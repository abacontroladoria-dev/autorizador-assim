-- /solicitar: falta de um paciente "resgatava" a sessão de outro paciente
-- diferente quando os dois compartilhavam a matrícula-placeholder.
--
-- Pacientes fora do convênio ASSIM (ex.: "LEVE SAUDE") não têm numero_carteirinha
-- real — o RPA não atua sobre eles, é só fluxo manual de falta/presença — então
-- ag.matricula/ag.dep caem no padrão "0000000"/"00" (ver buscarDadosPaciente em
-- sync_tita_agenda). Isso é esperado e não é o bug.
--
-- O bug é a CTE ma_consumos_falta casar uma falta de fila_autorizacoes a um slot
-- de ma_blocos usando só matricula+dep+data_atendimento+horario, sem checar o
-- código TUSS. Como vários pacientes sem carteirinha compartilham a mesma
-- matricula/dep placeholder, uma falta de QUALQUER terapia às 17:00 "resgatava"
-- (mostrar_na_tela=false, status_final='autorizado_externo') a sessão de OUTRO
-- paciente às 17:00 no mesmo dia, mesmo sendo terapia diferente.
--
-- Caso real: Samuel Salvador Felix (Terapia Ocupacional, TUSS 22070427, 17:00,
-- 03/08/2026) sumiu do /solicitar porque Rebeca Hadassa Gama de Almeida
-- (Fonoaudiologia, TUSS 22070397, também 17:00, mesmo dia, mesma matricula/dep
-- placeholder) teve falta registrada no mesmo horário.
--
-- Recriação FIEL da definição viva de 20260729010000_ma_auths_excluir_guias_com_fila.sql
-- + a única adição: `fa.tuss = bo.codigo_tuss` no JOIN de ma_consumos_falta.

CREATE OR REPLACE FUNCTION public.listar_central_autorizacoes(p_data date)
 RETURNS TABLE(paciente_id bigint, paciente_nome text, cpf text, data_nascimento date, data_atendimento date, horario time without time zone, terapias text[], sala_nome text[], profissionais text[], codigos_tuss text[], agendamentos text[], convenio_nome text, convenio_id bigint, empresa text, matricula text, dep text, crm text, nome_medico text, horario_autorizacao timestamp without time zone, ultima_autorizacao_anterior timestamp without time zone, status_final text, mostrar_na_tela boolean, tipo_fluxo text, cancelado_por_nome text)
 LANGUAGE sql
 STABLE
AS $function$

WITH

-- ── fallback_pat ───────────────────────────────────────────────────────────────
fallback_pat AS (
  SELECT
    p.paciente_id,
    ag.cpf,
    ag.data_nascimento,
    ag.convenio_id,
    ag.convenio_nome,
    ag.numero_carteirinha,
    substring(ag.numero_carteirinha, 1, 6)                          AS empresa,
    substring(ag.numero_carteirinha, 7, 7)                          AS matricula,
    right(regexp_replace(ag.numero_carteirinha, '\D', '', 'g'), 2)  AS dep
  FROM (
    SELECT DISTINCT paciente_id
    FROM   public.agenda_tita_autorizacao
    WHERE  data_atendimento = p_data
      AND  (cpf IS NULL OR numero_carteirinha IS NULL OR convenio_id IS NULL)
  ) p
  CROSS JOIN LATERAL (
    SELECT cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
    FROM   public.agenda_tita
    WHERE  paciente_id = p.paciente_id
      AND  (cpf IS NOT NULL OR numero_carteirinha IS NOT NULL)
    ORDER BY
      (origem = 'grade')                                      DESC,
      (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL)    DESC,
      updated_at                                              DESC
    LIMIT 1
  ) ag
),

-- ── raw_slots ──────────────────────────────────────────────────────────────────
raw_slots AS (
  SELECT
    ag.paciente_id,
    ag.paciente_nome,
    ag.cpf,
    ag.data_nascimento,
    ag.data_atendimento,
    ag.hora_inicial,
    ag.terapia_nome,
    ag.sala_nome,
    ag.profissional_nome,
    ag.codigo_tuss,
    ag.tita_agendamento_id,
    ag.convenio_nome,
    ag.convenio_id,
    ag.empresa,
    ag.matricula,
    ag.dep,
    ag.crm,
    ag.nome_medico,
    fp.cpf              AS fp_cpf,
    fp.data_nascimento  AS fp_data_nascimento,
    fp.convenio_id      AS fp_convenio_id,
    fp.convenio_nome    AS fp_convenio_nome,
    fp.empresa          AS fp_empresa,
    fp.matricula        AS fp_matricula,
    fp.dep              AS fp_dep
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
),

-- ── base ───────────────────────────────────────────────────────────────────────
base AS (
  SELECT
    rs.paciente_id,
    rs.paciente_nome,
    COALESCE(rs.cpf,             rs.fp_cpf)            AS cpf,
    COALESCE(rs.data_nascimento, rs.fp_data_nascimento) AS data_nascimento,
    rs.data_atendimento,
    rs.hora_inicial                                     AS horario,
    array_agg(DISTINCT rs.terapia_nome)                 AS terapias,
    array_agg(DISTINCT rs.sala_nome)                    AS sala_nome,
    array_agg(DISTINCT rs.profissional_nome)            AS profissionais,
    array_agg(DISTINCT rs.codigo_tuss)                  AS codigos_tuss,
    array_agg(DISTINCT (rs.tita_agendamento_id)::text)  AS agendamentos,
    COALESCE(rs.convenio_nome, rs.fp_convenio_nome)     AS convenio_nome,
    COALESCE(rs.convenio_id,   rs.fp_convenio_id)       AS convenio_id,
    COALESCE(rs.empresa,       rs.fp_empresa)           AS empresa,
    COALESCE(rs.matricula,     rs.fp_matricula)         AS matricula,
    COALESCE(rs.dep,           rs.fp_dep)               AS dep,
    rs.crm,
    rs.nome_medico
  FROM raw_slots rs
  GROUP BY
    rs.paciente_id, rs.paciente_nome,
    COALESCE(rs.cpf,             rs.fp_cpf),
    COALESCE(rs.data_nascimento, rs.fp_data_nascimento),
    rs.data_atendimento, rs.hora_inicial,
    COALESCE(rs.convenio_nome, rs.fp_convenio_nome),
    COALESCE(rs.convenio_id,   rs.fp_convenio_id),
    COALESCE(rs.empresa,       rs.fp_empresa),
    COALESCE(rs.matricula,     rs.fp_matricula),
    COALESCE(rs.dep,           rs.fp_dep),
    rs.crm, rs.nome_medico
),

-- ── ma_blocos ──────────────────────────────────────────────────────────────────
ma_blocos AS (
  SELECT
    rs.paciente_id,
    rs.data_atendimento,
    rs.hora_inicial,
    rs.codigo_tuss,
    rs.matricula,
    rs.dep,
    min(rs.tita_agendamento_id)  AS tita_agendamento_id,
    row_number() OVER (
      PARTITION BY rs.matricula, rs.dep, rs.data_atendimento, rs.codigo_tuss
      ORDER BY rs.hora_inicial
    )                            AS ordem_consumo
  FROM raw_slots rs
  GROUP BY
    rs.paciente_id, rs.data_atendimento, rs.hora_inicial,
    rs.codigo_tuss, rs.matricula, rs.dep
),

-- ── ma_consumos_falta ──────────────────────────────────────────────────────────
-- fa.tuss = bo.codigo_tuss (nova condição): sem isso, uma falta de QUALQUER
-- terapia casava por matricula+dep+data+horario com o slot de OUTRO paciente no
-- mesmo horário — grave quando vários pacientes sem carteirinha real (RPA não
-- atua neles, só falta/presença manual) compartilham a mesma matricula/dep
-- placeholder "0000000"/"00".
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
    AND fa.tuss               = bo.codigo_tuss
    AND fa.status             = 'falta'
),

-- ── ma_auths ───────────────────────────────────────────────────────────────────
-- (item 5) NOT EXISTS: exclui guias já vinculadas a uma fila (numero_autorizacao),
-- para o pareamento posicional não capturar guia retroativa no atendimento de hoje.
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.fila_autorizacoes fa
      WHERE fa.numero_autorizacao = aa.guia
    )
),

-- ── ma_matches_ext ─────────────────────────────────────────────────────────────
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

-- ── ma_matches_falta ───────────────────────────────────────────────────────────
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

-- ── match_assim ────────────────────────────────────────────────────────────────
match_assim AS (
  SELECT * FROM ma_matches_ext
  UNION ALL
  SELECT * FROM ma_matches_falta
),

-- ── ultima_fila ────────────────────────────────────────────────────────────────
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

$function$;
