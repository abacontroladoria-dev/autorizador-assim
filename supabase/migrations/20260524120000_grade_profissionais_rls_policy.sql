-- Adiciona policy de leitura na tabela grade_profissionais_tita.
-- RLS estava habilitado mas sem nenhuma policy, bloqueando todas as leituras
-- do cliente frontend (anon key). Esta policy permite SELECT para usuários
-- autenticados.

drop policy if exists "Allow select for authenticated" on "public"."grade_profissionais_tita";

create policy "Allow select for authenticated"
  on "public"."grade_profissionais_tita"
  as permissive
  for select
  to authenticated
  using (true);
