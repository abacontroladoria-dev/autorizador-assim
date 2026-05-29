-- Reconstrói vw_modal_substituicao_terapeutas usando agenda_tita como fonte primária
-- dos slots "ocupado". grade_profissionais_tita só guarda dados do dia corrente, então
-- para datas passadas a view anterior retornava zero linhas (todos viravam "Não trab. hoje").
--
-- Nova estrutura (UNION):
--   Part 1 → agenda_tita WHERE ativo = TRUE  → status_slot = 'ocupado'  (qualquer data)
--   Part 2 → grade sem sessão ativa           → status_slot = 'livre'   (só quando grade tem dados)

DROP VIEW IF EXISTS public.vw_modal_substituicao_terapeutas;

CREATE VIEW public.vw_modal_substituicao_terapeutas AS

-- ── Part 1: slots ocupados (agenda_tita — funciona para qualquer data) ──────
SELECT
  a.profissional_id,
  a.profissional_nome,
  a.terapia_exibicao_nome,
  CASE
    WHEN a.clinica_nome ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN a.clinica_nome ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN a.clinica_nome ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END                     AS unidade,
  a.hora_inicial::text    AS hora,
  'ocupado'               AS status_slot,
  a.paciente_nome,
  a.sala_nome,
  a.data_atendimento      AS data_grade
FROM public.agenda_tita a
WHERE a.ativo = TRUE
  AND a.profissional_id       IS NOT NULL
  AND a.terapia_exibicao_nome IS NOT NULL

UNION ALL

-- ── Part 2: slots livres (grade sem sessão ativa — só quando grade tem dados) ─
SELECT
  gp.profissional_id,
  gp.nome_profissional                                           AS profissional_nome,
  COALESCE(th.terapia_exibicao_nome, gp.terapia_exibicao)      AS terapia_exibicao_nome,
  CASE
    WHEN gp.nome_unidade ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN gp.nome_unidade ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN gp.nome_unidade ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
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
    AND profissional_id IS NOT NULL
  ORDER BY profissional_id, data_atendimento
) th ON th.profissional_id  = gp.profissional_id
     AND th.data_atendimento = gp.data
LEFT JOIN public.agenda_tita a
  ON  a.profissional_id  = gp.profissional_id
  AND a.data_atendimento = gp.data
  AND a.hora_inicial     = gp.hora_inicial
  AND a.ativo            = TRUE
WHERE a.tita_agendamento_id IS NULL;

GRANT SELECT ON public.vw_modal_substituicao_terapeutas TO anon, authenticated, service_role;
