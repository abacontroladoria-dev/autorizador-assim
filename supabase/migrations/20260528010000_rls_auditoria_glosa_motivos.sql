-- auditoria_glosa_motivos foi criada sem RLS nem policies.
-- Todas as tabelas deste projeto usam RLS com policies explícitas para authenticated.

alter table "public"."auditoria_glosa_motivos" enable row level security;

drop policy if exists "Allow select for authenticated" on "public"."auditoria_glosa_motivos";
create policy "Allow select for authenticated"
  on "public"."auditoria_glosa_motivos"
  as permissive
  for select
  to authenticated
  using (true);

drop policy if exists "Allow insert for authenticated" on "public"."auditoria_glosa_motivos";
create policy "Allow insert for authenticated"
  on "public"."auditoria_glosa_motivos"
  as permissive
  for insert
  to authenticated
  with check (true);

drop policy if exists "Allow update for authenticated" on "public"."auditoria_glosa_motivos";
create policy "Allow update for authenticated"
  on "public"."auditoria_glosa_motivos"
  as permissive
  for update
  to authenticated
  using (true)
  with check (true);
