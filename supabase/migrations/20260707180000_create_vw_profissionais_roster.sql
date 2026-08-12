-- View com a lista de profissionais distintos que já apareceram na grade
-- (csv_grades_profissionais), usada para popular a lista completa de cadastro de
-- Contratos Antigos/Atuais (Config) — inclusive quem ainda não tem contrato
-- cadastrado, para poder preencher direto na tela sem precisar de import de CSV.
-- security_invoker garante que a view respeita a RLS de csv_grades_profissionais
-- (hoje: SELECT liberado para qualquer usuário autenticado).
CREATE OR REPLACE VIEW public.vw_remuneracao_profissionais_roster
WITH (security_invoker = true) AS
SELECT DISTINCT profissional_nome
FROM csv_grades_profissionais
WHERE profissional_nome IS NOT NULL
  AND profissional_nome <> ''
  AND profissional_nome NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
ORDER BY profissional_nome;

GRANT SELECT ON public.vw_remuneracao_profissionais_roster TO authenticated;
