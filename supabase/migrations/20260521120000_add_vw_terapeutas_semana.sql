-- View com todos os terapeutas que possuem a mesma terapia_exibicao_nome na semana corrente.
-- Usada no modal de substituição para incluir profissionais que não trabalham no dia específico
-- mas podem ter acordado uma troca previamente.
CREATE OR REPLACE VIEW public.vw_terapeutas_semana AS
SELECT DISTINCT ON (profissional_id, terapia_exibicao_nome, unidade)
  profissional_id,
  profissional_nome,
  terapia_exibicao_nome,
  CASE
    WHEN sala_nome ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN sala_nome ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN sala_nome ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END AS unidade
FROM public.agenda_tita
WHERE
  data_atendimento BETWEEN
    date_trunc('week', CURRENT_DATE)
    AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'
  AND terapia_exibicao_nome IS NOT NULL
  AND profissional_id IS NOT NULL;
