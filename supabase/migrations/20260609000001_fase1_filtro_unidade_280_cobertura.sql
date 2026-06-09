-- Fase 1: Aplicar regra operacional de unidade 280 na Cobertura Clínica
--
-- Rationale:
-- A Universo ABA opera exclusivamente na unidade 280 (CLÍNICA UNIVERSO ABA).
-- A unidade 177 (BASE INATIVA DE DADOS) é histórica e não participa de processos operacionais.
--
-- Changes:
-- 1. vw_modal_substituicao_terapeutas Part 1 (ocupado): filtro clinica_id = 280 em agenda_tita
-- 2. vw_modal_substituicao_terapeutas Part 2 (livre): filtro id_unidade = 280 em grade_profissionais_tita
-- 3. vw_terapeutas_semana: filtro id_unidade = 280 em grade_profissionais_tita (CTE + SELECT)
-- 4. vw_profissionais_disponiveis: sem alteração (já filtra id_unidade = 280)
--
-- Impacto esperado:
-- - Anne Christine (8617) e Catislene (8587) com registros APENAS em unidade 177 desaparecerão
-- - Daiane (8684) e Vinicius (8604) com registros em unidade 280 permanecerão (serão tratados em Fase 2)
-- - Profissionais ativos com unidade 280 continuarão aparecendo normalmente

CREATE OR REPLACE VIEW public.vw_modal_substituicao_terapeutas AS

-- ── Part 1: slots ocupados (agenda_tita — filtro clinica_id = 280) ─────────────────────────
SELECT
  a.profissional_id,
  a.profissional_nome,
  a.terapia_nome,
  a.terapia_exibicao_nome,
  CASE
    WHEN a.sala_nome ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN a.sala_nome ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN a.sala_nome ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END                     AS unidade,
  a.hora_inicial::text    AS hora,
  'ocupado'               AS status_slot,
  a.paciente_nome,
  a.sala_nome,
  a.data_atendimento      AS data_grade
FROM public.agenda_tita a
WHERE a.ativo             = TRUE
  AND a.profissional_id   IS NOT NULL
  AND a.terapia_nome      IS NOT NULL
  AND a.clinica_id        = 280

UNION ALL

-- ── Part 2: slots livres (grade sem sessão ativa — filtro id_unidade = 280) ─────────────────
-- usa nome_unidade OR sala para não depender de um único campo do TiTa grade API
SELECT
  gp.profissional_id,
  gp.nome_profissional                                           AS profissional_nome,
  gp.nome_terapia                                               AS terapia_nome,
  COALESCE(th.terapia_exibicao_nome, gp.terapia_exibicao)      AS terapia_exibicao_nome,
  CASE
    WHEN gp.nome_unidade ILIKE '%Realengo%'     OR gp.sala ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN gp.nome_unidade ILIKE '%Fazendinha%'   OR gp.sala ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN gp.nome_unidade ILIKE '%Padre Miguel%' OR gp.sala ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END                     AS unidade,
  gp.hora_inicial::text   AS hora,
  'livre'                 AS status_slot,
  NULL                    AS paciente_nome,
  gp.sala                 AS sala_nome,
  gp.data                 AS data_grade
FROM public.grade_profissionais_tita gp
LEFT JOIN (
  SELECT DISTINCT ON (profissional_id, data_atendimento)
    profissional_id, data_atendimento, terapia_exibicao_nome
  FROM public.agenda_tita
  WHERE terapia_exibicao_nome IS NOT NULL
    AND profissional_id       IS NOT NULL
  ORDER BY profissional_id, data_atendimento
) th ON th.profissional_id  = gp.profissional_id
     AND th.data_atendimento = gp.data
LEFT JOIN public.agenda_tita a
  ON  a.profissional_id  = gp.profissional_id
  AND a.data_atendimento = gp.data
  AND a.hora_inicial     = gp.hora_inicial
  AND a.ativo            = TRUE
WHERE a.tita_agendamento_id IS NULL
  AND gp.id_unidade         = 280;

GRANT SELECT ON public.vw_modal_substituicao_terapeutas TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_terapeutas_semana AS
WITH turnos AS (
  SELECT
    profissional_id,
    CASE
      WHEN bool_or(hora_inicial < '13:00'::time) AND bool_or(hora_inicial >= '13:00'::time) THEN 'ambos'
      WHEN bool_or(hora_inicial < '13:00'::time) THEN 'manha'
      ELSE 'tarde'
    END AS turno_semana
  FROM public.grade_profissionais_tita
  WHERE data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
    AND id_unidade = 280
  GROUP BY profissional_id
)
SELECT DISTINCT ON (g.profissional_id, g.nome_terapia, unidade)
  g.profissional_id,
  g.nome_profissional                           AS profissional_nome,
  g.nome_terapia                                AS terapia_nome,
  COALESCE(g.terapia_exibicao, g.nome_terapia) AS terapia_exibicao_nome,
  CASE
    WHEN g.nome_unidade ILIKE '%Realengo%'     OR g.sala ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN g.nome_unidade ILIKE '%Fazendinha%'   OR g.sala ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN g.nome_unidade ILIKE '%Padre Miguel%' OR g.sala ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END AS unidade,
  COALESCE(t.turno_semana, 'ambos') AS turno_semana
FROM public.grade_profissionais_tita g
LEFT JOIN turnos t ON t.profissional_id = g.profissional_id
WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
  AND g.id_unidade      = 280
  AND g.nome_terapia    IS NOT NULL
  AND g.profissional_id IS NOT NULL
ORDER BY g.profissional_id, g.nome_terapia, unidade;

GRANT SELECT ON public.vw_terapeutas_semana TO anon, authenticated, service_role;
