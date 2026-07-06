-- =====================================================================
-- FASE 0 — CONTENÇÃO DE SEGURANÇA (2026-07-06)
-- Reabilita RLS em public.usuarios, revoga acesso anônimo, bloqueia a
-- auto-alteração de papel (privilege escalation) e neutraliza o signup
-- que confia no `role` da metadata — SEM quebrar os acessos legítimos:
--   * SELECT da própria linha (proxy.ts, login, dashboards, perfil)
--   * SELECT de todas as linhas por admin (impersonation, tela de permissões)
--   * UPDATE do próprio `nome` (ModalPerfil) — e SOMENTE do nome
--   * login por username preservado via RPC SECURITY DEFINER (abaixo)
--
-- Pré-requisitos verificados: public.is_admin() e public.handle_new_user()
-- são SECURITY DEFINER (não sofrem recursão de RLS).
--
-- ROLLBACK ao final do arquivo (comentado).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) RLS ligado + grants saneados
-- ---------------------------------------------------------------------
alter table public.usuarios enable row level security;

-- Remove TODO acesso do papel anônimo (a anon key é pública).
revoke all on public.usuarios from anon;

-- authenticated: mantém apenas SELECT (a RLS escopa as linhas) e UPDATE
-- restrito à coluna `nome`. Sem INSERT/DELETE (isso é papel de admin/service).
revoke insert, update, delete on public.usuarios from authenticated;
grant  select                 on public.usuarios to authenticated;
grant  update (nome)          on public.usuarios to authenticated;

-- ---------------------------------------------------------------------
-- 2) Políticas (idempotentes)
-- ---------------------------------------------------------------------

-- Limpa políticas antigas conhecidas para evitar sobreposição permissiva.
drop policy if exists "select usuarios authenticated"   on public.usuarios;
drop policy if exists "usuarios_select_all"             on public.usuarios;
drop policy if exists usuarios_view_own                 on public.usuarios;
drop policy if exists usuarios_select_own               on public.usuarios;
drop policy if exists usuarios_admin_all                on public.usuarios;
drop policy if exists usuarios_update_own_profile       on public.usuarios;
drop policy if exists usuarios_update_own_safe          on public.usuarios;

-- (a) Cada usuário lê a própria linha.
create policy usuarios_select_own on public.usuarios
  for select to authenticated
  using (id = auth.uid());

-- (b) Admin lê/gerencia todas as linhas (is_admin() é SECURITY DEFINER → sem recursão).
create policy usuarios_admin_all on public.usuarios
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- (c) Usuário atualiza a PRÓPRIA linha; o grant de coluna acima garante que
--     apenas `nome` é gravável (role/ativo/central_role/organization_id ficam
--     fisicamente fora do alcance → sem escalonamento de privilégio).
create policy usuarios_update_own_safe on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 3) Bloqueia signup que confia no `role` da metadata (defesa em profundidade)
--    Mesmo que o signup público fique acidentalmente ligado no Dashboard,
--    novas contas nascem SEM privilégio e INATIVAS.
--    (As rotas admin de criação fazem UPSERT do role correto depois do convite,
--     então a criação legítima de usuários continua funcionando.)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.usuarios (id, nome, email, role, ativo, primeiro_acesso)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    new.email,
    'recepcao',   -- NUNCA confiar em raw_user_meta_data->>'role'
    false,        -- nasce inativo; um admin precisa ativar
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4) RPC para o login por username SEM expor a tabela ao anon.
--    Retorna apenas o e-mail de um usuário ATIVO com match exato de username.
-- ---------------------------------------------------------------------
create or replace function public.resolver_email_por_username(p_username text)
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select email
  from public.usuarios
  where username = p_username
    and ativo = true
  limit 1;
$function$;

revoke all     on function public.resolver_email_por_username(text) from public;
grant  execute on function public.resolver_email_por_username(text) to anon, authenticated;

commit;

-- =====================================================================
-- ROLLBACK (executar manualmente se algo quebrar em produção):
--
-- begin;
--   drop policy if exists usuarios_select_own      on public.usuarios;
--   drop policy if exists usuarios_admin_all        on public.usuarios;
--   drop policy if exists usuarios_update_own_safe  on public.usuarios;
--   alter table public.usuarios disable row level security;
--   -- (NÃO reconceder grants a anon — isso reabriria a falha crítica)
-- commit;
--
-- Se o problema for apenas leitura de outros usuários por conta não-admin,
-- em vez do rollback acima, TROQUE a política (b)/(a) por uma leitura ampla
-- temporária, mantendo anon revogado e o bloqueio de escrita:
--   create policy usuarios_select_all_auth on public.usuarios
--     for select to authenticated using (true);
-- =====================================================================
