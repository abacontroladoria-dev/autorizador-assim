-- Função paramétrica que substitui a consulta direta a vw_central_autorizacoes
-- na página /solicitar, resolvendo dois problemas:
--
--   1. PostgREST não empurra predicados para dentro dos CTEs da view →
--      full scans em agenda_tita, fila_autorizacoes e autorizacoes_assim a cada
--      carregamento de tela.
--
--   2. vw_match_autorizacoes_assim usa now()::date hardcoded → para qualquer data
--      diferente de hoje todos os pacientes ASSIM aparecem como 'sem_acao'
--      (bug silencioso de correção).
--
-- Decisões de arquitetura:
--   - RETURNS TABLE  : contrato explícito, independente do rowtype de vw_central_autorizacoes.
--                      Permite CREATE OR REPLACE aditivo sem DROP prévio (ao contrário de
--                      RETURNS SETOF view, que exige DROP + recriação a cada mudança de schema).
--   - SECURITY INVOKER : RLS de agenda_tita usa USING (true) / auth.role(); INVOKER é suficiente.
--   - STABLE          : sem efeitos colaterais; o planner pode otimizar chamadas repetidas.
--   - match_assim     : replica integralmente os 5 CTEs de vw_match_autorizacoes_assim com
--                       p_data no lugar de now()::date; SELECT DISTINCT simples causaria N:N
--                       (auditado: 3 sessões × 3 auths = 9 combinações, DISTINCT não elimina
--                       porque data_execucao difere em cada par).

CREATE OR REPLACE FUNCTION public.listar_central_autorizacoes(p_data date)
RETURNS TABLE(
  paciente_id                  bigint,
  paciente_nome                text,
  cpf                          text,
  data_nascimento              date,
  data_atendimento             date,
  horario                      time without time zone,
  terapias                     text[],
  sala_nome                    text[],
  profissionais                text[],
  codigos_tuss                 text[],
  agendamentos                 text[],
  convenio_nome                text,
  convenio_id                  bigint,
  empresa                      text,
  matricula                    text,
  dep                          text,
  crm                          text,
  nome_medico                  text,
  horario_autorizacao          timestamp without time zone,
  ultima_autorizacao_anterior  timestamp without time zone,
  status_final                 text,
  mostrar_na_tela              boolean,
  tipo_fluxo                   text,
  cancelado_por_nome           text
)
STABLE
SECURITY INVOKER
LANGUAGE sql AS $$

WITH

-- ── fallback_pat ───────────────────────────────────────────────────────────────
-- Melhor CPF/carteirinha histórico por paciente.
-- Restrito aos pacientes do dia para não varrer toda a tabela agenda_tita.
fallback_pat AS (
  SELECT DISTINCT ON (paciente_id)
    paciente_id,
    cpf,
    data_nascimento,
    convenio_id,
    convenio_nome,
    numero_carteirinha,
    substring(numero_carteirinha, 1, 6)                          AS empresa,
    substring(numero_carteirinha, 7, 7)                          AS matricula,
    right(regexp_replace(numero_carteirinha, '\D', '', 'g'), 2)  AS dep
  FROM public.agenda_tita
  WHERE (cpf IS NOT NULL OR numero_carteirinha IS NOT NULL)
    AND paciente_id IN (
      SELECT paciente_id
      FROM   public.agenda_tita
      WHERE  data_atendimento = p_data
        AND  ativo = true
    )
  ORDER BY
    paciente_id,
    (origem = 'grade')                                      DESC,
    (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL)    DESC,
    updated_at                                              DESC
),

-- ── base ───────────────────────────────────────────────────────────────────────
-- Agendamentos do dia agregados por slot (paciente + horario).
-- WHERE empurra p_data para agenda_tita_data_idx dentro de agenda_tita_autorizacao.
base AS (
  SELECT
    ag.paciente_id,
    ag.paciente_nome,
    COALESCE(ag.cpf,              fp.cpf)            AS cpf,
    COALESCE(ag.data_nascimento,  fp.data_nascimento) AS data_nascimento,
    ag.data_atendimento,
    ag.hora_inicial                                   AS horario,
    array_agg(DISTINCT ag.terapia_nome)               AS terapias,
    array_agg(DISTINCT ag.sala_nome)                  AS sala_nome,
    array_agg(DISTINCT ag.profissional_nome)          AS profissionais,
    array_agg(DISTINCT ag.codigo_tuss)                AS codigos_tuss,
    array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
    COALESCE(ag.convenio_nome,    fp.convenio_nome)   AS convenio_nome,
    COALESCE(ag.convenio_id,      fp.convenio_id)     AS convenio_id,
    COALESCE(ag.empresa,          fp.empresa)          AS empresa,
    COALESCE(ag.matricula,        fp.matricula)        AS matricula,
    COALESCE(ag.dep,              fp.dep)              AS dep,
    ag.crm,
    ag.nome_medico
  FROM public.agenda_tita_autorizacao ag
  LEFT JOIN fallback_pat fp ON fp.paciente_id = ag.paciente_id
  WHERE ag.data_atendimento = p_data
    AND lower(COALESCE(ag.terapia_nome, '')) <> ALL (ARRAY[
          'aplicador aba escola'::text, 'aplicador aba casa'::text,
          'aplicador suporte'::text, 'apoio operacional'::text,
          'especialista técnico de área'::text, 'estágio'::text,
          'facilitador técnico'::text, 'operações clínicas'::text,
          'supervisão aba'::text, 'técnico terapêutico particular'::text,
          'triagem'::text])
    AND lower(COALESCE(ag.paciente_nome, '')) <> 'horário bloqueado'::text
    AND lower(COALESCE(ag.sala_nome,     '')) !~~ '%sala teste%'::text
  GROUP BY
    ag.paciente_id, ag.paciente_nome,
    COALESCE(ag.cpf,             fp.cpf),
    COALESCE(ag.data_nascimento, fp.data_nascimento),
    ag.data_atendimento, ag.hora_inicial,
    COALESCE(ag.convenio_nome,   fp.convenio_nome),
    COALESCE(ag.convenio_id,     fp.convenio_id),
    COALESCE(ag.empresa,         fp.empresa),
    COALESCE(ag.matricula,       fp.matricula),
    COALESCE(ag.dep,             fp.dep),
    ag.crm, ag.nome_medico
),

-- ── match_assim — 5 CTEs replicados de vw_match_autorizacoes_assim ─────────────
-- now()::date substituído por p_data; nomes prefixados com ma_ para não colidir.
-- SELECT DISTINCT simples é INSEGURO: 3 sessões × 3 auths mesma terapia/dia = 9
-- combinações; DISTINCT não elimina porque data_execucao difere em cada par,
-- e o LEFT JOIN externo duplicaria linhas. Obrigatório preservar ROW_NUMBER.

-- Passo 1: slots do dia com posição sequencial por (matricula, dep, tuss)
ma_blocos AS (
  SELECT
    ag.paciente_id,
    ag.data_atendimento,
    ag.hora_inicial,
    ag.codigo_tuss,
    ag.matricula,
    ag.dep,
    min(ag.tita_agendamento_id)  AS tita_agendamento_id,
    row_number() OVER (
      PARTITION BY ag.matricula, ag.dep, ag.data_atendimento, ag.codigo_tuss
      ORDER BY ag.hora_inicial
    )                            AS ordem_consumo
  FROM public.agenda_tita_autorizacao ag
  WHERE ag.data_atendimento = p_data
    AND lower(COALESCE(ag.terapia_nome, '')) <> ALL (ARRAY[
          'aplicador aba escola'::text, 'aplicador aba casa'::text,
          'aplicador suporte'::text, 'apoio operacional'::text,
          'especialista técnico de área'::text, 'estágio'::text,
          'facilitador técnico'::text, 'operações clínicas'::text,
          'supervisão aba'::text, 'técnico terapêutico particular'::text,
          'triagem'::text])
    AND lower(COALESCE(ag.paciente_nome, '')) <> 'horário bloqueado'::text
    AND lower(COALESCE(ag.sala_nome,     '')) !~~ '%sala teste%'::text
  GROUP BY
    ag.paciente_id, ag.data_atendimento, ag.hora_inicial,
    ag.codigo_tuss, ag.matricula, ag.dep
),

-- Passo 2: posições já consumidas por falta (mantêm seu número de ordem)
ma_consumos_falta AS (
  SELECT DISTINCT
    bo.matricula,
    bo.dep,
    bo.data_atendimento,
    bo.codigo_tuss,
    bo.ordem_consumo
  FROM ma_blocos bo
  JOIN public.fila_autorizacoes fa
    ON  fa.matricula          = bo.matricula
    AND COALESCE(fa.dep, '')  = COALESCE(bo.dep, '')
    AND fa.data_atendimento   = bo.data_atendimento
    AND fa.horario            = bo.hora_inicial
    AND fa.status             = 'falta'
),

-- Passo 3: autorizações ASSIM do dia, numeradas na mesma sequência que os slots
ma_auths AS (
  SELECT
    aa.paciente_id,
    aa.matricula_limpa                  AS matricula,
    right(aa.matricula, 2)              AS dep,
    aa.codigo_tuss,
    aa.data_execucao,
    date(aa.data_execucao)              AS data_atendimento,
    row_number() OVER (
      PARTITION BY aa.matricula_limpa, right(aa.matricula, 2),
                   date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    )                                   AS ordem_autorizacao
  FROM public.autorizacoes_assim aa
  WHERE date(aa.data_execucao) = p_data
),

-- Passo 4: match posicional — slot N recebe exatamente a autorização N
ma_matches_ext AS (
  SELECT
    bo.paciente_id,
    bo.data_atendimento,
    bo.hora_inicial           AS horario,
    an.data_execucao
  FROM ma_blocos bo
  JOIN ma_auths an
    ON  an.matricula              = bo.matricula
    AND COALESCE(an.dep, '')      = COALESCE(bo.dep, '')
    AND an.data_atendimento       = bo.data_atendimento
    AND an.codigo_tuss            = bo.codigo_tuss
    AND an.ordem_autorizacao      = bo.ordem_consumo
),

-- Passo 5: faltas que consomem posição sem deslocar autorizações seguintes
ma_matches_falta AS (
  SELECT
    bo.paciente_id,
    bo.data_atendimento,
    bo.hora_inicial                       AS horario,
    NULL::timestamp without time zone     AS data_execucao
  FROM ma_blocos bo
  JOIN ma_consumos_falta cf
    ON  cf.matricula              = bo.matricula
    AND COALESCE(cf.dep, '')      = COALESCE(bo.dep, '')
    AND cf.data_atendimento       = bo.data_atendimento
    AND cf.codigo_tuss            = bo.codigo_tuss
    AND cf.ordem_consumo          = bo.ordem_consumo
),

-- Resultado final do matching ASSIM.
-- Referenciado 2x no SELECT externo → sempre materializado pelo planner.
match_assim AS (
  SELECT * FROM ma_matches_ext
  UNION ALL
  SELECT * FROM ma_matches_falta
),

-- ── ultima_fila ────────────────────────────────────────────────────────────────
-- Registro mais recente de cada slot na fila de autorizações.
-- WHERE empurra p_data para idx_fila_data.
ultima_fila AS (
  SELECT DISTINCT ON (paciente_id, data_atendimento, horario)
    paciente_id,
    data_atendimento,
    horario,
    status,
    horario_autorizacao,
    cancelado_por_nome,
    created_at
  FROM public.fila_autorizacoes
  WHERE data_atendimento = p_data
  ORDER BY paciente_id, data_atendimento, horario, created_at DESC
)

SELECT
  b.paciente_id,
  b.paciente_nome,
  b.cpf,
  b.data_nascimento,
  b.data_atendimento,
  b.horario,
  b.terapias,
  b.sala_nome,
  b.profissionais,
  b.codigos_tuss,
  b.agendamentos,
  b.convenio_nome,
  b.convenio_id,
  b.empresa,
  b.matricula,
  b.dep,
  b.crm,
  b.nome_medico,
  uf.horario_autorizacao,
  (
    SELECT max(ma2.data_execucao)
    FROM   match_assim ma2
    WHERE  ma2.paciente_id      = b.paciente_id
      AND  ma2.data_atendimento = b.data_atendimento
      AND  ma2.horario          < b.horario
  ) AS ultima_autorizacao_anterior,
  CASE
    WHEN ma.paciente_id IS NOT NULL                                        THEN 'autorizado_externo'::text
    WHEN uf.status = 'concluido'::text                                     THEN 'concluido'::text
    WHEN uf.status = 'concluido_sem_guia'::text                            THEN 'concluido_sem_guia'::text
    WHEN uf.status = 'falta'::text                                         THEN 'falta'::text
    WHEN uf.status = 'processando'::text                                   THEN 'processando'::text
    WHEN uf.status = 'pendente'::text                                      THEN 'pendente'::text
    WHEN uf.status = 'cancelado'::text                                     THEN 'cancelado'::text
    WHEN uf.status = 'erro'::text                                          THEN 'erro'::text
    ELSE 'sem_acao'::text
  END AS status_final,
  CASE
    WHEN ma.paciente_id IS NOT NULL                                        THEN false
    WHEN uf.status = ANY(ARRAY['concluido'::text,'falta'::text,'concluido_sem_guia'::text]) THEN false
    ELSE true
  END AS mostrar_na_tela,
  CASE
    WHEN lower(COALESCE(b.convenio_nome, '')) ~~ '%assim%'::text          THEN 'autorizacao'::text
    ELSE 'presenca'::text
  END AS tipo_fluxo,
  uf.cancelado_por_nome

FROM base b
LEFT JOIN match_assim ma
  ON  ma.paciente_id      = b.paciente_id
  AND ma.data_atendimento = b.data_atendimento
  AND ma.horario          = b.horario
LEFT JOIN ultima_fila uf
  ON  uf.paciente_id::bigint = b.paciente_id
  AND uf.data_atendimento    = b.data_atendimento
  AND uf.horario             = b.horario

ORDER BY b.horario ASC;

$$;

GRANT EXECUTE ON FUNCTION public.listar_central_autorizacoes(date)
  TO authenticated, service_role;
