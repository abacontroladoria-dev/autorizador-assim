-- ============================================================================
-- Reconciliação de Autorizações ASSIM — ETAPA 0 (MEDIÇÃO)
-- ============================================================================
--
-- 100% SELECT. Nenhum DDL, nenhum DML, nenhuma função criada. Pode rodar em
-- produção sem risco de escrita.
--
-- PARA QUE SERVE
-- Decidir, com dados reais, três coisas que o desenho da reconciliação depende:
--   1. o volume de guias órfãs (a feature vale a pena?);
--   2. o valor de `p_janela_dias` (medição 0.3);
--   3. se `UNIQUE (bloco_id)` é seguro (medição 0.4).
--
-- COMO RODAR
-- Cada bloco 0.x é UM statement independente, executável isoladamente no SQL
-- Editor. Todos começam pelo mesmo prólogo `params` + CTEs de base, replicadas
-- fielmente de get_auditoria_assim_periodo
-- (supabase/migrations/20260820150000_glosa_codigos_descricao_completa.sql).
-- Se aquela RPC mudar, este snippet precisa ser reconferido — não há
-- compartilhamento de código entre os dois.
--
-- Ajuste as datas em `params`, no topo de cada bloco.
--
-- ----------------------------------------------------------------------------
-- DEFINIÇÃO DE "GUIA ÓRFÃ" usada aqui
--
-- O match sessão↔autorização da Conferência é POSICIONAL: dentro da partição
-- (empresa, matricula, dep, dia, codigo_tuss), a n-ésima autorização por
-- data_execucao casa com a n-ésima sessão por hora_inicial. Órfã, portanto, é a
-- guia EXCEDENTE da partição: `ordem_autorizacao > (nº de sessões da partição)`.
--
-- NÃO usamos `NOT EXISTS (fa.numero_autorizacao = aa.guia)` cru. Esse é o
-- critério do ramo `guias_sem_fila` de vw_match_autorizacoes_assim
-- (20260805124824_remote_schema.sql:1784-1803) e é inseguro: o número da guia
-- RECICLA (20260805170300:99-107). Aqui a comparação é sempre qualificada por
-- uma janela de ±5 min entre `fa.horario_autorizacao` e `aa.data_execucao`.
--
-- FUSO: a comparação acima é direta, sem AT TIME ZONE, e isso é correto.
-- `fila_autorizacoes` mistura dois fusos, mas `horario_autorizacao`
-- especificamente guarda hora de parede de São Paulo, e é escrito a partir de
-- `aa.data_execucao` por sync_assim_results
-- (20260814120000_sync_assim_conclui_pendente.sql). Mesmo relógio.
-- (`created_at`/`updated_at`/`completed_at` da fila, esses sim, estão em UTC —
--  não são usados neste snippet.)
-- ============================================================================


-- ============================================================================
-- 0.1  VOLUME DE GUIAS ÓRFÃS, POR MÊS
-- ----------------------------------------------------------------------------
-- Pergunta: quantas guias 'Liberado' sobram da partição posicional?
-- Se este número for próximo de zero, a feature não se justifica.
-- ============================================================================
WITH params AS (
  SELECT '2026-01-01'::date AS de,
         '2026-12-31'::date AS ate
),
agenda_tita_tuss AS (
  SELECT
    at.paciente_id,
    at.data_atendimento,
    at.hora_inicial,
    at.terapia_nome,
    substring(at.numero_carteirinha, 1, 6)                         AS empresa,
    substring(at.numero_carteirinha, 7, 7)                         AS matricula,
    right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2) AS dep,
    public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
  FROM agenda_tita at, params p
  WHERE at.data_atendimento BETWEEN p.de AND p.ate
    AND at.ativo = true
    AND at.convenio_nome ILIKE '%assim%'
    AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
),
agenda_filtrada AS (
  SELECT a.* FROM agenda_tita_tuss a
  WHERE a.codigo_tuss IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM config_regras_terapias r
      WHERE r.categoria = 'BLACKLIST_AUTORIZACAO' AND r.ativo = true
        AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
    )
),
agenda_sem_falta AS (
  SELECT a.* FROM agenda_filtrada a
  WHERE NOT EXISTS (
    SELECT 1 FROM fila_autorizacoes f
    WHERE f.paciente_id::bigint = a.paciente_id
      AND f.data_atendimento = a.data_atendimento
      AND f.horario = a.hora_inicial
      AND (
        (f.status IS DISTINCT FROM 'glosa'
         AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
  )
    AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
    AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
    AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
    AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
),
-- Um bloco = uma linha da Conferência. Espelha `blocos_auditoria`.
blocos AS (
  SELECT
    concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
    asf.paciente_id, asf.empresa, asf.matricula, asf.dep,
    asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss,
    count(*) AS quantidade_sessoes
  FROM agenda_sem_falta asf
  GROUP BY asf.paciente_id, asf.empresa, asf.matricula, asf.dep,
           asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss
),
-- Quantas sessões a partição posicional tem. É o teto de guias que ela absorve.
n_sessoes AS (
  SELECT empresa, matricula, dep, data_atendimento, codigo_tuss, count(*) AS n
  FROM blocos
  GROUP BY 1,2,3,4,5
),
-- Espelha a CTE `autorizacoes` da RPC, inclusive o row_number().
guias AS (
  SELECT
    aa.guia, aa.matricula AS carteirinha, aa.paciente_id, aa.paciente_nome,
    aa.data_execucao, aa.status, aa.codigo_tuss,
    split_part(aa.matricula, '.', 1) AS empresa,
    split_part(aa.matricula, '.', 2) AS matricula_base,
    split_part(aa.matricula, '.', 3) AS dep,
    row_number() OVER (
      PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    ) AS ordem_autorizacao
  FROM autorizacoes_assim aa, params p
  WHERE date(aa.data_execucao) BETWEEN p.de AND p.ate
),
orfas AS (
  SELECT g.*, COALESCE(ns.n, 0) AS sessoes_na_particao
  FROM guias g
  LEFT JOIN n_sessoes ns
    ON  ns.empresa          = g.empresa
    AND ns.matricula        = g.matricula_base
    AND ns.dep              = g.dep
    AND ns.data_atendimento = date(g.data_execucao)
    AND ns.codigo_tuss      = g.codigo_tuss
  WHERE g.status = 'Liberado'                             -- 'Liberado *' = cancelada; resto = glosa
    AND g.ordem_autorizacao > COALESCE(ns.n, 0)           -- excedente da partição
    AND NOT EXISTS (                                      -- e não é guia já capturada pelo Pulsar
      SELECT 1 FROM fila_autorizacoes fa
      WHERE fa.numero_autorizacao = g.guia
        AND fa.horario_autorizacao IS NOT NULL
        AND abs(EXTRACT(epoch FROM (fa.horario_autorizacao - g.data_execucao))) <= 300
    )
)
SELECT
  to_char(date_trunc('month', o.data_execucao), 'YYYY-MM')            AS mes,
  count(*)                                                            AS guias_orfas,
  count(*) FILTER (WHERE o.sessoes_na_particao = 0)                    AS orfas_sem_nenhuma_sessao_no_dia,
  count(*) FILTER (WHERE o.sessoes_na_particao > 0)                    AS orfas_excedentes_de_particao_ocupada,
  count(DISTINCT o.paciente_id)                                        AS pacientes_afetados,
  count(DISTINCT o.codigo_tuss)                                        AS tuss_distintos
FROM orfas o
GROUP BY 1
ORDER BY 1;


-- ============================================================================
-- 0.2  SITUAÇÃO DA CANDIDATA MAIS PROVÁVEL
-- ----------------------------------------------------------------------------
-- Pergunta: as órfãs realmente apontam para sessões GLOSA / NAO_SOLICITADA?
--
-- A `situacao` vem da própria RPC — não é reimplementada aqui. É a única forma
-- de garantir que o número medido é o mesmo que o operador verá na tela.
-- ATENÇÃO: get_auditoria_assim_periodo sobre um ano inteiro é caro. Rode este
-- bloco por trimestre, ou reduza a janela em `params`.
-- ============================================================================
WITH params AS (
  SELECT '2026-06-01'::date AS de,
         '2026-08-31'::date AS ate,
         30                 AS janela_medicao_dias   -- generoso de propósito: quem decide a janela é 0.3
),
guias AS (
  SELECT
    aa.guia, aa.paciente_id, aa.paciente_nome, aa.data_execucao, aa.codigo_tuss,
    split_part(aa.matricula, '.', 1) AS empresa,
    split_part(aa.matricula, '.', 2) AS matricula_base,
    split_part(aa.matricula, '.', 3) AS dep,
    row_number() OVER (
      PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    ) AS ordem_autorizacao
  FROM autorizacoes_assim aa, params p
  WHERE date(aa.data_execucao) BETWEEN p.de AND p.ate
    AND aa.status = 'Liberado'
),
-- A RPC devolve bloco_id, data, hora, tuss, paciente e situacao já resolvidos.
-- Janela alargada em `janela_medicao_dias` para trás, senão a candidata de uma
-- órfã do dia 1 do período ficaria invisível.
auditoria AS (
  SELECT a.*
  FROM params p,
       public.get_auditoria_assim_periodo(
         (p.de - make_interval(days => p.janela_medicao_dias))::date,
         p.ate
       ) a
),
n_sessoes AS (
  SELECT
    a.empresa, a.matricula AS matricula_base, a.dep,
    a.data_atendimento, a.codigo_tuss, count(*) AS n
  FROM auditoria a
  GROUP BY 1,2,3,4,5
),
orfas AS (
  SELECT g.*
  FROM guias g
  LEFT JOIN n_sessoes ns
    ON  ns.empresa          = g.empresa
    AND ns.matricula_base   = g.matricula_base
    AND ns.dep              = g.dep
    AND ns.data_atendimento = date(g.data_execucao)
    AND ns.codigo_tuss      = g.codigo_tuss
  WHERE g.ordem_autorizacao > COALESCE(ns.n, 0)
    AND NOT EXISTS (
      SELECT 1 FROM fila_autorizacoes fa
      WHERE fa.numero_autorizacao = g.guia
        AND fa.horario_autorizacao IS NOT NULL
        AND abs(EXTRACT(epoch FROM (fa.horario_autorizacao - g.data_execucao))) <= 300
    )
),
-- A candidata mais próxima ANTES da autorização (a hipótese operacional:
-- autoriza-se depois da sessão). 0.3 é quem valida essa hipótese.
melhor_candidata AS (
  SELECT DISTINCT ON (o.guia)
    o.guia, o.data_execucao,
    a.bloco_id, a.data_atendimento, a.hora_inicial, a.situacao,
    (o.data_execucao - (a.data_atendimento + a.hora_inicial)) AS distancia
  FROM orfas o, params p
  LEFT JOIN auditoria a
    ON  a.empresa      = o.empresa
    AND a.matricula    = o.matricula_base
    AND a.dep          = o.dep
    AND a.codigo_tuss  = o.codigo_tuss
    AND a.data_atendimento             <= date(o.data_execucao)
    AND a.data_atendimento             >= date(o.data_execucao) - p.janela_medicao_dias
  ORDER BY o.guia, (o.data_execucao - (a.data_atendimento + a.hora_inicial)) ASC
)
SELECT
  COALESCE(mc.situacao, '(sem candidata na janela)') AS situacao_da_candidata,
  count(*)                                           AS guias_orfas,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM melhor_candidata mc
GROUP BY 1
ORDER BY 2 DESC;


-- ============================================================================
-- 0.3  DISTRIBUIÇÃO TEMPORAL  — É ESTE BLOCO QUE DEFINE `p_janela_dias`
-- ----------------------------------------------------------------------------
-- Mede o INTERVALO COMPLETO, não a diferença de dias:
--     data_execucao - (data_atendimento + hora_inicial)
--
-- Janela de medição SIMÉTRICA (±30d) de propósito. Só assim se enxerga o caso
-- `data_execucao < data_atendimento` (autorização adiantada) — o cenário que
-- 20260805170300:1-27 aponta como o que "quebrou todo caminho de vínculo".
-- Medir largo para decidir estreito.
-- ============================================================================
WITH params AS (
  SELECT '2026-06-01'::date AS de,
         '2026-08-31'::date AS ate,
         30                 AS janela_medicao_dias
),
guias AS (
  SELECT
    aa.guia, aa.data_execucao, aa.codigo_tuss,
    split_part(aa.matricula, '.', 1) AS empresa,
    split_part(aa.matricula, '.', 2) AS matricula_base,
    split_part(aa.matricula, '.', 3) AS dep,
    row_number() OVER (
      PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    ) AS ordem_autorizacao
  FROM autorizacoes_assim aa, params p
  WHERE date(aa.data_execucao) BETWEEN p.de AND p.ate
    AND aa.status = 'Liberado'
),
auditoria AS (
  SELECT a.*
  FROM params p,
       public.get_auditoria_assim_periodo(
         (p.de - make_interval(days => p.janela_medicao_dias))::date,
         (p.ate + make_interval(days => p.janela_medicao_dias))::date
       ) a
),
n_sessoes AS (
  SELECT
    a.empresa, a.matricula AS matricula_base, a.dep,
    a.data_atendimento, a.codigo_tuss, count(*) AS n
  FROM auditoria a
  GROUP BY 1,2,3,4,5
),
orfas AS (
  SELECT g.*
  FROM guias g
  LEFT JOIN n_sessoes ns
    ON  ns.empresa          = g.empresa
    AND ns.matricula_base   = g.matricula_base
    AND ns.dep              = g.dep
    AND ns.data_atendimento = date(g.data_execucao)
    AND ns.codigo_tuss      = g.codigo_tuss
  WHERE g.ordem_autorizacao > COALESCE(ns.n, 0)
    AND NOT EXISTS (
      SELECT 1 FROM fila_autorizacoes fa
      WHERE fa.numero_autorizacao = g.guia
        AND fa.horario_autorizacao IS NOT NULL
        AND abs(EXTRACT(epoch FROM (fa.horario_autorizacao - g.data_execucao))) <= 300
    )
),
-- Candidata mais próxima em VALOR ABSOLUTO, olhando para os dois lados.
pares AS (
  SELECT DISTINCT ON (o.guia)
    o.guia,
    a.bloco_id, a.situacao,
    (o.data_execucao - (a.data_atendimento + a.hora_inicial)) AS distancia
  FROM orfas o, params p
  JOIN auditoria a
    ON  a.empresa      = o.empresa
    AND a.matricula    = o.matricula_base
    AND a.dep          = o.dep
    AND a.codigo_tuss  = o.codigo_tuss
    AND a.data_atendimento BETWEEN date(o.data_execucao) - p.janela_medicao_dias
                               AND date(o.data_execucao) + p.janela_medicao_dias
  ORDER BY o.guia, abs(EXTRACT(epoch FROM (o.data_execucao - (a.data_atendimento + a.hora_inicial))))
)
-- 0.3.a — estatística do intervalo
SELECT
  'TODAS'                                                                  AS recorte,
  count(*)                                                                  AS n,
  min(distancia)                                                            AS minimo,
  max(distancia)                                                            AS maximo,
  avg(distancia)                                                            AS media,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY distancia)                    AS mediana,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY distancia)                    AS p75,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY distancia)                    AS p90,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY distancia)                    AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY distancia)                    AS p99,
  count(*) FILTER (WHERE distancia < interval '0')                           AS autorizacao_ADIANTADA,
  round(100.0 * count(*) FILTER (WHERE distancia < interval '0') / count(*), 1) AS pct_adiantada
FROM pares
UNION ALL
SELECT
  'só candidata GLOSA', count(*),
  min(distancia), max(distancia), avg(distancia),
  percentile_cont(0.50) WITHIN GROUP (ORDER BY distancia),
  percentile_cont(0.75) WITHIN GROUP (ORDER BY distancia),
  percentile_cont(0.90) WITHIN GROUP (ORDER BY distancia),
  percentile_cont(0.95) WITHIN GROUP (ORDER BY distancia),
  percentile_cont(0.99) WITHIN GROUP (ORDER BY distancia),
  count(*) FILTER (WHERE distancia < interval '0'),
  round(100.0 * count(*) FILTER (WHERE distancia < interval '0') / NULLIF(count(*),0), 1)
FROM pares WHERE situacao = 'GLOSA';

-- 0.3.b — histograma por dia. `dias` NEGATIVO = autorização antes da sessão.
--         Rode com o MESMO `params` do 0.3.a (repita o prólogo acima e troque
--         apenas o SELECT final por este):
--
--   SELECT
--     floor(EXTRACT(epoch FROM distancia) / 86400)::int AS dias,
--     count(*)                                          AS guias,
--     count(*) FILTER (WHERE situacao = 'GLOSA')         AS das_quais_glosa,
--     round(100.0 * sum(count(*)) OVER (ORDER BY floor(EXTRACT(epoch FROM distancia)/86400)::int)
--           / sum(count(*)) OVER (), 1)                 AS pct_acumulado
--   FROM pares
--   GROUP BY 1
--   ORDER BY 1;
--
-- LEITURA: `p_janela_dias` = o menor `dias` cujo pct_acumulado (contando só os
-- >= 0) cubra ~95% dos casos. Se `pct_adiantada` de 0.3.a for material, a
-- janela retroativa pura do desenho precisa ser revista antes da Etapa 1.


-- ============================================================================
-- 0.4  DESAMBIGUAÇÃO  — DECIDE SE `UNIQUE (bloco_id)` É SEGURO
-- ----------------------------------------------------------------------------
-- (a) blocos com quantidade_sessoes > 1: se existirem, um bloco representa mais
--     de uma sessão, e UNIQUE(bloco_id) impediria cobrir a segunda.
-- (b) órfãs com >= 2 candidatas na janela: mede o peso real da escolha manual.
-- ============================================================================
WITH params AS (
  SELECT '2026-06-01'::date AS de,
         '2026-08-31'::date AS ate,
         7                  AS janela_dias   -- ajuste para o valor que 0.3 indicar
),
agenda_tita_tuss AS (
  SELECT
    at.paciente_id, at.data_atendimento, at.hora_inicial, at.terapia_nome,
    substring(at.numero_carteirinha, 1, 6)                         AS empresa,
    substring(at.numero_carteirinha, 7, 7)                         AS matricula,
    right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2) AS dep,
    public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
  FROM agenda_tita at, params p
  WHERE at.data_atendimento BETWEEN p.de AND p.ate
    AND at.ativo = true
    AND at.convenio_nome ILIKE '%assim%'
    AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
),
agenda_filtrada AS (
  SELECT a.* FROM agenda_tita_tuss a
  WHERE a.codigo_tuss IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM config_regras_terapias r
      WHERE r.categoria = 'BLACKLIST_AUTORIZACAO' AND r.ativo = true
        AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
    )
),
agenda_sem_falta AS (
  SELECT a.* FROM agenda_filtrada a
  WHERE NOT EXISTS (
    SELECT 1 FROM fila_autorizacoes f
    WHERE f.paciente_id::bigint = a.paciente_id
      AND f.data_atendimento = a.data_atendimento
      AND f.horario = a.hora_inicial
      AND (
        (f.status IS DISTINCT FROM 'glosa'
         AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
  )
    AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
    AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
    AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
    AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
),
blocos AS (
  SELECT
    concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
    asf.paciente_id, asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss,
    count(*) AS quantidade_sessoes
  FROM agenda_sem_falta asf
  GROUP BY asf.paciente_id, asf.empresa, asf.matricula, asf.dep,
           asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss
)
-- 0.4.a — o número que decide a constraint
SELECT
  'blocos por quantidade_sessoes'  AS medicao,
  b.quantidade_sessoes::text        AS valor,
  count(*)                          AS blocos
FROM blocos b
GROUP BY 2, b.quantidade_sessoes
ORDER BY b.quantidade_sessoes;
-- LEITURA: se `quantidade_sessoes = 1` for 100%, UNIQUE(bloco_id) é seguro.
-- Qualquer linha com valor >= 2 tem de ser inspecionada ANTES de criar a
-- constraint — não mascarar com ON CONFLICT DO NOTHING.

-- 0.4.b — quantas órfãs teriam mais de uma candidata (peso da escolha manual).
--         Reaproveite o prólogo de 0.2 e troque o SELECT final por:
--
--   SELECT n_candidatas, count(*) AS guias_orfas
--   FROM (
--     SELECT o.guia, count(a.bloco_id) AS n_candidatas
--     FROM orfas o, params p
--     LEFT JOIN auditoria a
--       ON  a.empresa     = o.empresa
--       AND a.matricula   = o.matricula_base
--       AND a.dep         = o.dep
--       AND a.codigo_tuss = o.codigo_tuss
--       AND a.data_atendimento BETWEEN date(o.data_execucao) - p.janela_dias
--                                  AND date(o.data_execucao)
--       AND a.situacao IN ('GLOSA','NAO_SOLICITADA','RETORNO_NAO_CONFIRMADO')
--     GROUP BY o.guia
--   ) t
--   GROUP BY 1 ORDER BY 1;


-- ============================================================================
-- 0.5  O CASO REAL  —  03/08/2026 11:20 · TUSS 22070435 · guias 9229 e 9378
-- ----------------------------------------------------------------------------
-- Demonstra a mecânica do bug: as duas ordens da partição, por que a 9378 sobra,
-- e que o bloco de 11:20 aparece como candidata em GLOSA.
-- ============================================================================

-- 0.5.a — as guias do relatório e sua posição na partição posicional
WITH guias AS (
  SELECT
    aa.guia, aa.matricula AS carteirinha, aa.paciente_nome,
    aa.data_execucao, aa.status, aa.codigo_erro, aa.descricao_erro, aa.codigo_tuss,
    row_number() OVER (
      PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    ) AS ordem_autorizacao
  FROM autorizacoes_assim aa
  WHERE date(aa.data_execucao) = '2026-08-03'
    AND aa.codigo_tuss = '22070435'
)
SELECT * FROM guias
WHERE guia IN ('9229','9378')
   OR carteirinha IN (SELECT carteirinha FROM guias WHERE guia IN ('9229','9378'))
ORDER BY data_execucao;
-- ESPERADO: 9229 com ordem_autorizacao = 1 e status de recusa;
--           9378 com ordem_autorizacao = 2 e status 'Liberado'.

-- 0.5.b — como a Conferência vê o bloco hoje (deve sair GLOSA, guia 9229)
SELECT bloco_id, paciente_nome, data_atendimento, hora_inicial, codigo_tuss,
       situacao, guia, status_assim, codigo_erro, descricao_erro, observacao,
       motivo_glosa, possui_autorizacao, possui_solicitacao, quantidade_sessoes
FROM public.get_auditoria_assim_periodo('2026-08-03','2026-08-03')
WHERE codigo_tuss = '22070435'
  AND hora_inicial = '11:20:00'
ORDER BY paciente_nome;
-- Colunas conferidas contra o RETURNS TABLE em 20260820150000:166.

-- 0.5.c — quantas sessões a partição de 03/08 tem para esse TUSS
--          (se for 1 e houver 2 guias, a 9378 é excedente por construção)
SELECT paciente_nome, count(*) AS sessoes_no_dia_desse_tuss,
       string_agg(hora_inicial::text, ', ' ORDER BY hora_inicial) AS horarios
FROM public.get_auditoria_assim_periodo('2026-08-03','2026-08-03')
WHERE codigo_tuss = '22070435'
GROUP BY paciente_nome
ORDER BY 2 DESC;
