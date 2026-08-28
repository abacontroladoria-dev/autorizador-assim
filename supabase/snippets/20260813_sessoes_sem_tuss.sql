-- ============================================================================
-- Sessões ASSIM que sumiram das telas por TUSS nulo
-- ============================================================================
-- Rode no SQL Editor do Supabase.
--
-- Contexto: até a migration 20260813120000, tanto a view agenda_tita_autorizacao
-- (que alimenta a /solicitar) quanto get_auditoria_assim (que alimenta a
-- /auditoria-assim) derivavam o código TUSS SÓ do nome de exibição da terapia e
-- descartavam a linha quando esse mapa não respondia. Quando o TiTa manda a
-- exibição errada — o nome da AÇÃO no lugar do nome da EXIBIÇÃO, ex.: exibição
-- "Aplicador ABA (PS)" em vez de "Psicologia ABA" — a sessão simplesmente não
-- aparecia para ninguém: sem erro, sem log, sem contador. Ninguém autorizava.
--
-- Use este snippet para:
--   (a) dimensionar o passivo — quantas sessões foram perdidas e desde quando;
--   (b) gerar a lista de correção de cadastro para quem opera o TiTa.
--
-- Serve antes E depois da migration: a Parte 1 recalcula a REGRA ANTIGA em linha,
-- então não depende de nada que a migration crie. A Parte 3 compara antigo x novo
-- e só funciona depois que public.tuss_da_sessao existir.
--
-- ⚠ JANELA DE DATAS: as datas estão literais em cada consulta, como
-- BETWEEN '2026-07-01' AND '2026-12-31'. Para mudar a janela, troque as duas
-- datas nas Partes 1, 2 e 3a (busque por 2026-07-01). Ficou literal de propósito:
-- \set é do psql e não funciona no SQL Editor do Supabase.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 1 — As sessões perdidas, uma a uma (lista de correção do TiTa)
-- ────────────────────────────────────────────────────────────────────────────
WITH regra_antiga AS (
  SELECT
    at.*,
    CASE
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Psicologia','Psicologia ABA','Arteterapia','Arteterapia (Psicologia ABA)','Avaliação Neuropsicológica','Habilidades Sociais (Psicologia ABA)']) THEN '22070384'
      WHEN at.terapia_exibicao_nome = 'Coordenador de Caso' THEN '22070384'
      WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'      THEN '22070397'
      WHEN at.terapia_exibicao_nome = 'Psicomotricidade'    THEN '22070400'
      WHEN at.terapia_exibicao_nome = 'Fisioterapia'        THEN '22070419'
      WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional' THEN '22070427'
      WHEN at.terapia_exibicao_nome = 'Psicopedagogia'      THEN '22070435'
      WHEN at.terapia_exibicao_nome = 'Musicoterapia'       THEN '22070451'
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição','Terapia Alimentar'])         THEN '22070460'
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia','Fisioterapia Aquática']) THEN '22070265'
      WHEN at.terapia_exibicao_nome = 'Equoterapia'         THEN '22070257'
      ELSE NULL
    END AS tuss_regra_antiga
  FROM public.agenda_tita at
  WHERE at.ativo = true
    AND at.convenio_nome ILIKE '%assim%'
    AND at.data_atendimento BETWEEN '2026-07-01' AND '2026-12-31'
    AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
)
SELECT
  r.data_atendimento,
  r.hora_inicial,
  r.paciente_id,
  r.paciente_nome,
  r.terapia_id,
  r.terapia_nome           AS terapia_acao,
  r.terapia_exibicao_id,
  r.terapia_exibicao_nome  AS terapia_exibicao_errada,
  -- O que o cadastro do TiTa DEVERIA dizer, pela regra do Grupo 1 ABA
  CASE WHEN r.terapia_id = ANY (ARRAY[2317,2269,2263,2260,2283,2248])
            OR r.terapia_nome ~ '^Aplicador ABA \('
       THEN 'Psicologia ABA (2271)'
       ELSE '?? terapia fora do bloco ABA — investigar'
  END                      AS exibicao_esperada,
  r.profissional_nome,
  r.sala_nome,
  r.tita_agendamento_id
FROM regra_antiga r
WHERE r.tuss_regra_antiga IS NULL
  -- Mesma lista negra que a RPC da /solicitar aplica: essas terapias não
  -- aparecem na tela de propósito, então não são perda e não entram na conta.
  -- Sem este filtro o relatório enche de falso positivo (Triagem, Estágio...).
  AND lower(COALESCE(r.terapia_nome, '')) <> ALL (ARRAY[
        'aplicador aba escola', 'aplicador aba casa', 'aplicador suporte',
        'apoio operacional', 'especialista técnico de área', 'estágio',
        'facilitador técnico', 'operações clínicas', 'supervisão aba',
        'técnico terapêutico particular', 'triagem'])
ORDER BY r.data_atendimento, r.hora_inicial, r.paciente_nome;


-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 2 — O tamanho do estrago, agrupado por exibição torta
-- ────────────────────────────────────────────────────────────────────────────
-- Responde: qual cadastro errado custou mais sessões, e em que período.
WITH regra_antiga AS (
  SELECT
    at.terapia_id, at.terapia_nome, at.terapia_exibicao_nome, at.data_atendimento,
    CASE
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Psicologia','Psicologia ABA','Arteterapia','Arteterapia (Psicologia ABA)','Avaliação Neuropsicológica','Habilidades Sociais (Psicologia ABA)']) THEN '22070384'
      WHEN at.terapia_exibicao_nome = 'Coordenador de Caso' THEN '22070384'
      WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'      THEN '22070397'
      WHEN at.terapia_exibicao_nome = 'Psicomotricidade'    THEN '22070400'
      WHEN at.terapia_exibicao_nome = 'Fisioterapia'        THEN '22070419'
      WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional' THEN '22070427'
      WHEN at.terapia_exibicao_nome = 'Psicopedagogia'      THEN '22070435'
      WHEN at.terapia_exibicao_nome = 'Musicoterapia'       THEN '22070451'
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição','Terapia Alimentar'])         THEN '22070460'
      WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia','Fisioterapia Aquática']) THEN '22070265'
      WHEN at.terapia_exibicao_nome = 'Equoterapia'         THEN '22070257'
      ELSE NULL
    END AS tuss_regra_antiga
  FROM public.agenda_tita at
  WHERE at.ativo = true
    AND at.convenio_nome ILIKE '%assim%'
    AND at.data_atendimento BETWEEN '2026-07-01' AND '2026-12-31'
    AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
    AND lower(COALESCE(at.terapia_nome, '')) <> ALL (ARRAY[
          'aplicador aba escola', 'aplicador aba casa', 'aplicador suporte',
          'apoio operacional', 'especialista técnico de área', 'estágio',
          'facilitador técnico', 'operações clínicas', 'supervisão aba',
          'técnico terapêutico particular', 'triagem'])
)
SELECT
  COALESCE(r.terapia_exibicao_nome, '(nulo)') AS exibicao_no_tita,
  r.terapia_nome                              AS terapia_acao,
  r.terapia_id,
  count(*)                                    AS sessoes_perdidas,
  min(r.data_atendimento)                     AS primeira,
  max(r.data_atendimento)                     AS ultima,
  -- quantas destas o fallback novo recupera
  count(*) FILTER (
    WHERE r.terapia_id = ANY (ARRAY[2317,2269,2263,2260,2283,2248])
       OR r.terapia_nome ~ '^Aplicador ABA \('
  )                                           AS recuperadas_pelo_fallback
FROM regra_antiga r
WHERE r.tuss_regra_antiga IS NULL
GROUP BY 1, 2, 3
ORDER BY sessoes_perdidas DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Conferência pós-migration (só roda depois de aplicar a 20260813120000)
-- ────────────────────────────────────────────────────────────────────────────
-- (a) NÃO-REGRESSÃO: tem que voltar 0. Nenhuma linha que já passava pode ter
--     mudado de TUSS — o COALESCE só age onde a regra antiga dava NULL.
SELECT count(*) AS linhas_que_mudaram_de_tuss_indevidamente
FROM public.agenda_tita a
WHERE a.data_atendimento BETWEEN '2026-07-01' AND '2026-12-31'
  AND CASE
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Psicologia','Psicologia ABA','Arteterapia','Arteterapia (Psicologia ABA)','Avaliação Neuropsicológica','Habilidades Sociais (Psicologia ABA)']) THEN '22070384'
        WHEN a.terapia_exibicao_nome = 'Coordenador de Caso' THEN '22070384'
        WHEN a.terapia_exibicao_nome = 'Fonoaudiologia'      THEN '22070397'
        WHEN a.terapia_exibicao_nome = 'Psicomotricidade'    THEN '22070400'
        WHEN a.terapia_exibicao_nome = 'Fisioterapia'        THEN '22070419'
        WHEN a.terapia_exibicao_nome = 'Terapia Ocupacional' THEN '22070427'
        WHEN a.terapia_exibicao_nome = 'Psicopedagogia'      THEN '22070435'
        WHEN a.terapia_exibicao_nome = 'Musicoterapia'       THEN '22070451'
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Nutrição','Terapia Alimentar'])         THEN '22070460'
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia','Fisioterapia Aquática']) THEN '22070265'
        WHEN a.terapia_exibicao_nome = 'Equoterapia'         THEN '22070257'
        ELSE NULL
      END IS NOT NULL
  AND public.tuss_da_sessao(a.terapia_exibicao_nome, a.terapia_id, a.terapia_nome)
      IS DISTINCT FROM
      CASE
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Psicologia','Psicologia ABA','Arteterapia','Arteterapia (Psicologia ABA)','Avaliação Neuropsicológica','Habilidades Sociais (Psicologia ABA)']) THEN '22070384'
        WHEN a.terapia_exibicao_nome = 'Coordenador de Caso' THEN '22070384'
        WHEN a.terapia_exibicao_nome = 'Fonoaudiologia'      THEN '22070397'
        WHEN a.terapia_exibicao_nome = 'Psicomotricidade'    THEN '22070400'
        WHEN a.terapia_exibicao_nome = 'Fisioterapia'        THEN '22070419'
        WHEN a.terapia_exibicao_nome = 'Terapia Ocupacional' THEN '22070427'
        WHEN a.terapia_exibicao_nome = 'Psicopedagogia'      THEN '22070435'
        WHEN a.terapia_exibicao_nome = 'Musicoterapia'       THEN '22070451'
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Nutrição','Terapia Alimentar'])         THEN '22070460'
        WHEN a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia','Fisioterapia Aquática']) THEN '22070265'
        WHEN a.terapia_exibicao_nome = 'Equoterapia'         THEN '22070257'
        ELSE NULL
      END;

-- (b) Fumaça: o agendamento que originou tudo isto. Tem que voltar 1 linha,
--     com codigo_tuss = 22070384.
SELECT id, data_atendimento, hora_inicial, paciente_nome,
       terapia_nome, terapia_exibicao_nome, codigo_tuss
FROM public.agenda_tita_autorizacao
WHERE tita_agendamento_id = 3502258;


-- ────────────────────────────────────────────────────────────────────────────
-- PARTE 4 — Volume da /auditoria-assim (rode ANTES e DEPOIS da migration)
-- ────────────────────────────────────────────────────────────────────────────
-- get_auditoria_assim é por dia; isto soma o mês para dar um número comparável.
-- O total DEVE subir depois da migration: são as sessões que estavam fora da
-- conta por TUSS nulo. Anote o "antes" antes de aplicar.
SELECT sum(n) AS blocos_auditoria_no_periodo
FROM (
  SELECT (SELECT count(*) FROM public.get_auditoria_assim(d::date)) AS n
  FROM generate_series('2026-08-01'::date, '2026-08-31'::date, '1 day') d
) t;
