-- ACHADO CRÍTICO (2026-07-24): csv_reposicao_faltas tinha uma policy de
-- SELECT liberada pra `anon` (usuário SEM login, usando só a anon key
-- pública embutida no JS do site) com `using (true)`. Colunas incluem
-- paciente_nome, paciente_id, profissional_nome, profissional_cpf e
-- horário/sala/convênio da sessão — ou seja, qualquer pessoa na internet
-- conseguia ler nome de paciente + CPF de profissional sem autenticar.
--
-- Confirmado que nenhum fluxo do app depende de acesso anon a esta tabela
-- (a única rota pública do sistema, disponibilidade-terapeuta, não a
-- referencia). Corrige removendo `anon`, mantendo só `authenticated` (nível
-- de acesso já usado pela tabela irmã csv_grades_profissionais).
--
-- csv_reposicao_faltas só é usada pela feature Reposição de Faltas
-- (frontend/hooks/useReposicaoFaltas.ts é o único consumidor) — diferente
-- da tabela irmã csv_grades_profissionais, que alimenta várias telas.
-- Por isso aqui dá pra restringir direto por role, batendo com quem ainda
-- tem a permissão 'reposicao_faltas' em routes.ts depois da restrição do
-- papel 'cronograma' feita junto (2026-07-24): só admin/diretoria.
--
-- csv_grades_profissionais (mesmas colunas sensíveis: paciente_nome,
-- profissional_cpf) continua liberada pra qualquer authenticated — é um
-- achado separado, maior, que exige mapear todas as telas que dependem
-- dela antes de restringir por role sem quebrar nada. Ver SECURITY_CHECKLIST.md.

DROP POLICY IF EXISTS "csv_reposicao_faltas_select_all" ON public.csv_reposicao_faltas;

CREATE POLICY "csv_reposicao_faltas_select_admin_diretoria"
  ON public.csv_reposicao_faltas
  FOR SELECT
  TO authenticated
  USING (public.remuneracao_has_role(array['admin','diretoria']));
