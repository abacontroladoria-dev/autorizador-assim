-- Query A: Profissionais com registros EXCLUSIVAMENTE na unidade 177 (semana atual)
-- Esses profissionais desaparecerão da Cobertura com o filtro 280
SELECT
  g.profissional_id,
  MAX(g.nome_profissional) AS nome,
  COUNT(*) FILTER (WHERE g.id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE g.id_unidade = 280) AS slots_280
FROM grade_profissionais_tita g
WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
GROUP BY g.profissional_id
HAVING COUNT(*) FILTER (WHERE g.id_unidade = 280) = 0
ORDER BY nome;

-- Query B: Profissionais com registros nas DUAS unidades (semana atual)
-- Esses NÃO serão afetados (seus slots 280 os mantêm visíveis)
SELECT
  g.profissional_id,
  MAX(g.nome_profissional) AS nome,
  COUNT(*) FILTER (WHERE g.id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE g.id_unidade = 280) AS slots_280
FROM grade_profissionais_tita g
WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
GROUP BY g.profissional_id
HAVING COUNT(*) FILTER (WHERE g.id_unidade = 177) > 0
   AND COUNT(*) FILTER (WHERE g.id_unidade = 280) > 0
ORDER BY nome;

-- Query C: Profissionais da unidade 177 que passam pelo ILIKE (slot via sala)
-- Mostra quais slots 177 "sobreviviam" antes ao filtro ILIKE - esses perderão esse caminho
SELECT DISTINCT
  profissional_id,
  nome_profissional,
  nome_unidade,
  sala,
  CASE
    WHEN nome_unidade ILIKE '%Realengo%' OR sala ILIKE '%Realengo%' THEN 'Realengo'
    WHEN nome_unidade ILIKE '%Fazendinha%' OR sala ILIKE '%Fazendinha%' THEN 'Fazendinha'
    WHEN nome_unidade ILIKE '%Padre Miguel%' OR sala ILIKE '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END AS unidade_derivada
FROM grade_profissionais_tita
WHERE id_unidade = 177
  AND data BETWEEN date_trunc('week', CURRENT_DATE)::date
               AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
ORDER BY unidade_derivada, nome_profissional;
