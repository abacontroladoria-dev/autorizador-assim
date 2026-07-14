-- Adiciona a terapia mais recente de cada profissional à view de roster
-- (vw_remuneracao_profissionais_roster, criada em 20260707180000_...), para
-- exibir a "terapia base" ao lado da capacidade editável em Config →
-- Capacidade do profissional. DISTINCT ON + ORDER BY data DESC pega a
-- terapia do agendamento mais recente do profissional na grade.
CREATE OR REPLACE VIEW public.vw_remuneracao_profissionais_roster
WITH (security_invoker = true) AS
SELECT DISTINCT ON (profissional_nome)
  profissional_nome,
  terapia_exibicao_nome AS terapia_principal
FROM csv_grades_profissionais
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
ORDER BY profissional_nome, data DESC;

GRANT SELECT ON public.vw_remuneracao_profissionais_roster TO authenticated;
