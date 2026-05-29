-- View que expõe os slots de grade de HOJE para o modal de substituição de cobertura.
-- Retorna um slot por (profissional_id, hora_inicial), com status livre/ocupado
-- e o nome do paciente quando ocupado. Restringe à data corrente para que
-- terapeutas que não trabalham hoje não apareçam como "Livre".
DROP VIEW IF EXISTS public.vw_modal_substituicao_terapeutas;

CREATE VIEW public.vw_modal_substituicao_terapeutas AS
WITH terapias_hoje AS (
  -- Pega o terapia_exibicao_nome normalizado por terapeuta a partir das sessões de hoje
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
    WHEN LOWER(gp.status_agendamento) = 'livre' THEN 'livre'
    ELSE 'ocupado'
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
