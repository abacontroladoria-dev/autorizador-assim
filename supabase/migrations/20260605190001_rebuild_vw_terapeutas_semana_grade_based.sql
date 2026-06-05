-- Reconstrói vw_terapeutas_semana usando grade_profissionais_tita como fonte.
--
-- Problema com a versão anterior (baseada em agenda_tita):
--   O sync de agenda não retroage para datas passadas. Profissionais removidos
--   do TITA mantinham sessões ativo=TRUE de dias anteriores da semana, fazendo-os
--   aparecer no modal de substituição como "sem_agenda_hoje".
--
-- A grade (grade_profissionais_tita) é delete-and-reload: profissionais ausentes
-- no TITA são removidos na próxima sincronização, tornando-a a fonte correta para
-- determinar quem está escalado esta semana.

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
  AND g.nome_terapia    IS NOT NULL
  AND g.profissional_id IS NOT NULL
ORDER BY g.profissional_id, g.nome_terapia, unidade;

GRANT SELECT ON public.vw_terapeutas_semana TO anon, authenticated, service_role;
