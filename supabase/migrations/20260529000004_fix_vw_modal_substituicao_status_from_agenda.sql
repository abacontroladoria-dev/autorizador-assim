-- Corrige derivação de status_slot: usa presença em agenda_tita (ativo=TRUE)
-- em vez de grade_profissionais_tita.status_agendamento (snapshot, pode estar desatualizado).
-- Terapeutas com sessão agendada no horário agora aparecem corretamente como 'ocupado'.
DROP VIEW IF EXISTS public.vw_modal_substituicao_terapeutas;

CREATE VIEW public.vw_modal_substituicao_terapeutas AS
WITH terapias_hoje AS (
  SELECT DISTINCT ON (profissional_id)
    profissional_id,
    terapia_exibicao_nome
  FROM public.agenda_tita
  WHERE data_atendimento = CURRENT_DATE
    AND terapia_exibicao_nome IS NOT NULL
    AND profissional_id IS NOT NULL
  ORDER BY profissional_id
)
SELECT
  gp.profissional_id,
  gp.nome_profissional                                           AS profissional_nome,
  COALESCE(th.terapia_exibicao_nome, gp.terapia_exibicao)      AS terapia_exibicao_nome,
  CASE
    WHEN gp.nome_unidade ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN gp.nome_unidade ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN gp.nome_unidade ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END                                                            AS unidade,
  gp.hora_inicial::text                                         AS hora,
  CASE
    WHEN a.tita_agendamento_id IS NOT NULL THEN 'ocupado'
    ELSE 'livre'
  END                                                            AS status_slot,
  a.paciente_nome,
  gp.sala                                                       AS sala_nome
FROM public.grade_profissionais_tita gp
LEFT JOIN terapias_hoje th ON th.profissional_id = gp.profissional_id
LEFT JOIN public.agenda_tita a
  ON  a.profissional_id  = gp.profissional_id
  AND a.data_atendimento = gp.data
  AND a.hora_inicial     = gp.hora_inicial
  AND a.ativo            = TRUE
WHERE gp.data = CURRENT_DATE;

GRANT SELECT ON public.vw_modal_substituicao_terapeutas TO anon, authenticated, service_role;
