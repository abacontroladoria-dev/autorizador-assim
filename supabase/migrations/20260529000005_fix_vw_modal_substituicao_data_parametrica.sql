-- Remove filtro CURRENT_DATE da view e expõe gp.data como data_grade,
-- para que o service possa filtrar pela data real da sessão.
-- Antes: WHERE gp.data = CURRENT_DATE → modal aberto para datas passadas/futuras
-- mostrava todos como 'sem_agenda_hoje' porque a view retornava zero linhas.
DROP VIEW IF EXISTS public.vw_modal_substituicao_terapeutas;

CREATE VIEW public.vw_modal_substituicao_terapeutas AS
WITH terapias_por_data AS (
  SELECT DISTINCT ON (profissional_id, data_atendimento)
    profissional_id,
    data_atendimento,
    terapia_exibicao_nome
  FROM public.agenda_tita
  WHERE terapia_exibicao_nome IS NOT NULL
    AND profissional_id IS NOT NULL
  ORDER BY profissional_id, data_atendimento
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
  gp.sala                                                       AS sala_nome,
  gp.data                                                       AS data_grade
FROM public.grade_profissionais_tita gp
LEFT JOIN terapias_por_data th
  ON  th.profissional_id  = gp.profissional_id
  AND th.data_atendimento = gp.data
LEFT JOIN public.agenda_tita a
  ON  a.profissional_id  = gp.profissional_id
  AND a.data_atendimento = gp.data
  AND a.hora_inicial     = gp.hora_inicial
  AND a.ativo            = TRUE;

GRANT SELECT ON public.vw_modal_substituicao_terapeutas TO anon, authenticated, service_role;
