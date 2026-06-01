-- Adiciona terapia_nome (Terapia Real) à vw_terapeutas_semana.
-- Compatibilidade determina-se por terapia_nome; terapia_exibicao_nome fica apenas para exibição.

DROP VIEW IF EXISTS public.vw_terapeutas_semana;

CREATE VIEW public.vw_terapeutas_semana AS
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
  GROUP BY profissional_id
)
SELECT DISTINCT ON (a.profissional_id, a.terapia_nome, unidade)
  a.profissional_id,
  a.profissional_nome,
  a.terapia_nome,
  a.terapia_exibicao_nome,
  CASE
    WHEN a.sala_nome ILIKE '%Realengo%'     THEN 'Realengo'
    WHEN a.sala_nome ILIKE '%Fazendinha%'   THEN 'Fazendinha'
    WHEN a.sala_nome ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END AS unidade,
  COALESCE(t.turno_semana, 'ambos') AS turno_semana
FROM public.agenda_tita a
LEFT JOIN turnos t ON t.profissional_id = a.profissional_id
WHERE a.data_atendimento BETWEEN
        date_trunc('week', CURRENT_DATE)
        AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days'
  AND a.terapia_nome    IS NOT NULL
  AND a.profissional_id IS NOT NULL;
