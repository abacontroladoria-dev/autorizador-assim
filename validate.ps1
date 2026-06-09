#!/usr/bin/env pwsh

# Load environment variables
$env:SUPABASE_URL = "https://qnwlzwxpspmjzxkopzcv.supabase.co"

# Query A: Profissionais EXCLUSIVAMENTE em unidade 177
Write-Host "=== Query A: Profissionais EXCLUSIVAMENTE em unidade 177 ===" -ForegroundColor Green
Write-Host ""
Write-Host "Conectando ao Supabase e executando queries..."
Write-Host ""

$queryA = @"
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
"@

# Query B: Profissionais em AMBAS as unidades
$queryB = @"
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
"@

# Query C: Profissionais 177 que passam pelo ILIKE
$queryC = @"
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
"@

# Query para verificar os 4 profissionais específicos
$querySpecific = @"
SELECT
  profissional_id,
  nome_profissional,
  COUNT(*) FILTER (WHERE id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE id_unidade = 280) AS slots_280
FROM grade_profissionais_tita
WHERE profissional_id IN (8617, 8587, 8604, 8684)
  AND data >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY profissional_id, nome_profissional
ORDER BY profissional_id;
"@

Write-Host "Executando Query dos 4 profissionais reportados:" -ForegroundColor Yellow
Write-Host ""
Write-Host $querySpecific
