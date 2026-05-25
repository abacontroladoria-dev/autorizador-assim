-- agenda_tita tem RLS habilitado (ver 20260518131652_remote_schema.sql:97)
-- mas nenhuma policy SELECT foi documentada em migrations.
-- Mesmo padrão corrigido em 20260524120000_grade_profissionais_rls_policy.sql.
-- Esta policy garante leitura para usuários autenticados, seja via tabela direta
-- ou via view (agenda_tita_autorizacao_v2).

drop policy if exists "Allow select for authenticated" on "public"."agenda_tita";

create policy "Allow select for authenticated"
  on "public"."agenda_tita"
  as permissive
  for select
  to authenticated
  using (true);
