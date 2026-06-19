-- Central de Atendimento — Extend public.usuarios
-- M-000b | Sprint 0
-- Depends on: 20260701000000_create_ca_schema.sql (central.organizations must exist)

-- ============================================================================
-- ADD COLUMN: central_role
-- null = usuário sem acesso à Central de Atendimento
-- Valores válidos: operator | operator_special | supervisor | director | admin
-- ============================================================================
alter table public.usuarios
  add column if not exists central_role text;

-- ============================================================================
-- ADD COLUMN: organization_id
-- NOT NULL com DEFAULT aponta para a org padrão (UUID fixo de M-000a).
-- O DEFAULT garante que os routes existentes (create-user, create-user-with-password)
-- continuem funcionando sem alteração de código.
-- Remover o DEFAULT quando multi-tenant for implementado.
-- ============================================================================
alter table public.usuarios
  add column if not exists organization_id uuid
    not null
    default 'a0000000-0000-0000-0000-000000000001'
    references central.organizations(id);

-- ============================================================================
-- AUTH HOOK: Inject organization_id and central_role into JWT
--
-- Esta função deve existir ANTES de ser ativada no Supabase Dashboard.
-- Passo manual obrigatório após esta migration:
--   Dashboard → Authentication → Hooks → Customize Access Token
--   → Selecionar: public.custom_access_token_hook
--
-- NÃO habilitar o hook antes de executar esta migration.
-- NÃO habilitar RLS nas tabelas central.* antes de ativar o hook.
-- ============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims         jsonb;
  v_org_id       uuid;
  v_central_role text;
begin
  select organization_id, central_role
    into v_org_id, v_central_role
  from public.usuarios
  where id = (event ->> 'user_id')::uuid
  limit 1;

  claims := event -> 'claims';

  if v_org_id is not null then
    claims := jsonb_set(claims, '{organization_id}', to_jsonb(v_org_id::text));
  end if;

  if v_central_role is not null then
    claims := jsonb_set(claims, '{central_role}', to_jsonb(v_central_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- supabase_auth_admin invoca o hook; authenticated/anon não devem chamar diretamente
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon;
