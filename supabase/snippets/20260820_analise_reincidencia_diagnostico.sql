-- ============================================================================
-- Reincidência (glosa 1601): a autorização excedente existe no banco?
-- ============================================================================
-- Rode no SQL Editor do Supabase. É SÓ LEITURA — nenhum DDL, nenhum write.
--
-- CONTEXTO
-- Quando a ASSIM recusa com 1601 (REINCIDENCIA NO ATENDIMENTO), ela está dizendo
-- que a autorização daquele TUSS já ultrapassou a cota semanal do paciente. A
-- tela de auditoria não consegue mostrar isso por duas razões somadas:
--
--   1. ela é DIÁRIA, e a cota é SEMANAL;
--   2. ela é dirigida pela SESSÃO. get_auditoria_assim_periodo pareia
--      sessão <-> autorização por (carteirinha, dia, TUSS, ordinal) num LEFT JOIN
--      cujo lado esquerdo é sempre a agenda_tita. A autorização EXCEDENTE — a que
--      tem ordem_autorizacao = 3 onde só existem 2 sessões — não casa com sessão
--      nenhuma e por isso não aparece em tela nenhuma.
--
-- É essa autorização órfã que estoura a cota. O modal "Análise de Reincidência"
-- existe para mostrá-la, e este snippet é o teste da hipótese ANTES de construir:
-- se a órfã não existir no banco, o modal vira só contagem agendado x autorizado.
--
-- ⚠ JANELA DE DATAS: literal em cada consulta (\set é do psql e não funciona no
-- SQL Editor). A Parte 1 acha as semanas candidatas; troque as datas das Partes
-- 3 e 4 pela semana que ela devolver. Busque por 2026-07-01 / 2026-08-22.
-- ============================================================================


-- ── Parte 1 — Onde há glosa de reincidência, e em que semana ────────────────
-- O código pode chegar por dois caminhos: o relatório (autorizacoes_assim, texto
-- truncado em 25 chars, "1601-REINCIDENCIA NO ATEN") ou o recibo lido pelo robô
-- no ato do envio (fila_autorizacoes.status_assim, texto por extenso). Os dois
-- entram, porque a análise vale para qualquer um.
WITH glosa_relatorio AS (
  SELECT
    aa.matricula                                        AS carteirinha,
    aa.paciente_nome,
    date(aa.data_execucao)                              AS dia,
    aa.codigo_tuss,
    aa.guia,
    COALESCE(aa.codigo_erro, split_part(aa.status, '-', 1)) AS codigo,
    aa.status                                           AS texto,
    'relatorio'                                         AS origem
  FROM autorizacoes_assim aa
  WHERE date(aa.data_execucao) BETWEEN '2026-07-01' AND '2026-08-22'
    AND (aa.codigo_erro = '1601' OR aa.status ILIKE '%REINCIDENCIA%')
),
glosa_fila AS (
  SELECT
    concat_ws('.', f.empresa, f.matricula, f.dep)       AS carteirinha,
    f.paciente_nome,
    f.data_atendimento                                  AS dia,
    f.tuss                                              AS codigo_tuss,
    f.numero_autorizacao                                AS guia,
    btrim(split_part(f.status_assim, '-', 1))           AS codigo,
    f.status_assim                                      AS texto,
    'recibo'                                            AS origem
  FROM fila_autorizacoes f
  WHERE f.data_atendimento BETWEEN '2026-07-01' AND '2026-08-22'
    AND f.status = 'glosa'
    AND f.status_assim ILIKE '%REINCIDENCIA%'
)
SELECT
  origem,
  paciente_nome,
  carteirinha,
  dia,
  -- A segunda-feira da semana daquele dia: é o recorte que o modal usa.
  (dia - ((EXTRACT(isodow FROM dia)::int - 1)))::date AS semana_de,
  codigo_tuss,
  guia,
  codigo,
  texto
FROM (SELECT * FROM glosa_relatorio UNION ALL SELECT * FROM glosa_fila) t
ORDER BY dia DESC, paciente_nome;


-- ── Parte 2 — `matricula` da ASSIM casa com o `carteirinha` da RPC? ─────────
-- O modal filtra autorizacoes_assim por .in('matricula', carteirinhas), usando o
-- texto que a RPC devolve como carteirinha (concat_ws('.', empresa, matricula,
-- dep) derivado de agenda_tita.numero_carteirinha). Se as duas grafias não
-- baterem 1:1, o filtro volta vazio EM SILÊNCIO — que é o pior modo de falha
-- possível para uma tela de conferência.
--
-- Esperado: 'casou' » 0 e 'so_na_agenda' pequeno (paciente sem autorização
-- nenhuma na janela). 'so_na_assim' alto = a grafia divergiu; nesse caso trocar
-- o filtro do modal para matricula_limpa (já indexado por
-- idx_autorizacoes_assim_match).
WITH da_agenda AS (
  SELECT DISTINCT
    concat_ws('.',
      substring(at.numero_carteirinha, 1, 6),
      substring(at.numero_carteirinha, 7, 7),
      right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)
    ) AS carteirinha
  FROM agenda_tita at
  WHERE at.data_atendimento BETWEEN '2026-07-01' AND '2026-08-22'
    AND at.ativo = true
    AND at.convenio_nome ILIKE '%assim%'
    AND at.numero_carteirinha IS NOT NULL
),
da_assim AS (
  SELECT DISTINCT aa.matricula AS carteirinha
  FROM autorizacoes_assim aa
  WHERE date(aa.data_execucao) BETWEEN '2026-07-01' AND '2026-08-22'
    AND aa.matricula IS NOT NULL
)
SELECT
  count(*) FILTER (WHERE g.carteirinha IS NOT NULL AND a.carteirinha IS NOT NULL) AS casou,
  count(*) FILTER (WHERE a.carteirinha IS NULL)                                   AS so_na_agenda,
  count(*) FILTER (WHERE g.carteirinha IS NULL)                                   AS so_na_assim
FROM da_agenda g
FULL OUTER JOIN da_assim a ON a.carteirinha = g.carteirinha;


-- ── Parte 3 — A órfã existe? (o teste da hipótese) ──────────────────────────
-- Troque as duas datas pela semana que a Parte 1 apontou (segunda e sexta).
--
-- `pareadas` são as guias que a própria RPC casou com uma sessão. `orfas` são as
-- autorizações da mesma carteirinha, na mesma semana, cuja guia NÃO está nesse
-- conjunto — exatamente a diferença de conjuntos que o modal calcula no cliente.
-- É seguro comparar por guia aqui: os dois lados saem de autorizacoes_assim (onde
-- guia é PK) e da mesma semana, então a reciclagem do número não morde.
WITH sessoes AS (
  SELECT * FROM public.get_auditoria_assim_periodo('2026-08-17', '2026-08-21')
),
pareadas AS (
  SELECT DISTINCT guia FROM sessoes WHERE guia IS NOT NULL
),
autorizacoes AS (
  SELECT aa.*
  FROM autorizacoes_assim aa
  WHERE date(aa.data_execucao) BETWEEN '2026-08-17' AND '2026-08-21'
    AND aa.matricula IN (SELECT DISTINCT carteirinha FROM sessoes WHERE carteirinha IS NOT NULL)
)
SELECT
  a.paciente_nome,
  a.matricula          AS carteirinha,
  a.codigo_tuss,
  a.guia,
  a.data_execucao,
  a.status,
  a.codigo_erro,
  a.teve_token,
  CASE WHEN p.guia IS NULL THEN 'ORFA' ELSE 'pareada' END AS lado
FROM autorizacoes a
LEFT JOIN pareadas p ON p.guia = a.guia
ORDER BY (p.guia IS NULL) DESC, a.paciente_nome, a.data_execucao;


-- ── Parte 4 — Placar por (paciente, TUSS) na semana ────────────────────────
-- É o número que o modal mostra no topo. Mesmas datas da Parte 3.
--
-- `agendadas` conta blocos de sessão (falta já sai fora — a RPC exclui sessão com
-- falta de blocos_auditoria, e é por isso que autorizar em cima de falta aparece
-- como excedente). `liberadas` é o que de fato consumiu cota: recusa não consome.
-- excedente > 0 é a assinatura da reincidência.
WITH sessoes AS (
  SELECT * FROM public.get_auditoria_assim_periodo('2026-08-17', '2026-08-21')
),
agendadas AS (
  SELECT carteirinha, paciente_nome, codigo_tuss, count(*) AS agendadas
  FROM sessoes
  WHERE situacao NOT IN ('FALTA', 'FALTA_TERAPEUTA')
  GROUP BY 1, 2, 3
),
autorizadas AS (
  SELECT
    aa.matricula AS carteirinha,
    aa.codigo_tuss,
    count(*)                                                    AS autorizadas,
    count(*) FILTER (WHERE aa.status ILIKE 'Liberado%')          AS liberadas
  FROM autorizacoes_assim aa
  WHERE date(aa.data_execucao) BETWEEN '2026-08-17' AND '2026-08-21'
    AND aa.matricula IN (SELECT DISTINCT carteirinha FROM sessoes WHERE carteirinha IS NOT NULL)
  GROUP BY 1, 2
)
SELECT
  COALESCE(g.paciente_nome, '(sem sessão na semana)') AS paciente_nome,
  COALESCE(g.carteirinha, a.carteirinha)              AS carteirinha,
  COALESCE(g.codigo_tuss, a.codigo_tuss)              AS codigo_tuss,
  COALESCE(g.agendadas, 0)                            AS agendadas,
  COALESCE(a.autorizadas, 0)                          AS autorizadas,
  COALESCE(a.liberadas, 0)                            AS liberadas,
  COALESCE(a.liberadas, 0) - COALESCE(g.agendadas, 0) AS excedente
FROM agendadas g
FULL OUTER JOIN autorizadas a
  ON  a.carteirinha = g.carteirinha
  AND a.codigo_tuss IS NOT DISTINCT FROM g.codigo_tuss
ORDER BY excedente DESC, paciente_nome;
