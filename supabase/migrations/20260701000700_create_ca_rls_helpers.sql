-- Central de Atendimento — RLS Helper Functions
-- M-RLS-001 | Block 4 — Security Layer
-- Depends on:
--   20260701000000_create_ca_schema.sql          (central schema, grants)
--   20260701000001_extend_usuarios_central.sql   (public.usuarios.organization_id, central_role)
--
-- Roles: admin | director
-- Naming: ca_ prefix on ca_current_role() — avoids conflict with PG built-in current_role()

-- ============================================================================
-- FUNCTION: central.current_organization_id()
--
-- JWT claim first (fast path after Auth Hook is active).
-- DB fallback for bootstrap period before hook activation.
--
-- SECURITY DEFINER: reads public.usuarios which has its own RLS.
-- ============================================================================
create or replace function central.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, central
as $$
  select coalesce(
    (auth.jwt() ->> 'organization_id')::uuid,
    (
      select organization_id
      from public.usuarios
      where id = auth.uid()
      limit 1
    )
  );
$$;

grant execute on function central.current_organization_id() to authenticated;

-- ============================================================================
-- FUNCTION: central.ca_current_role()
--
-- Returns central_role from JWT claim "central_role".
-- Uses "central_role" — not "role" (reserved by Supabase internally).
-- DB fallback for bootstrap period.
--
-- Returns NULL for users without Central access.
-- ============================================================================
create or replace function central.ca_current_role()
returns text
language sql
stable
security definer
set search_path = public, central
as $$
  select coalesce(
    auth.jwt() ->> 'central_role',
    (
      select central_role
      from public.usuarios
      where id = auth.uid()
      limit 1
    )
  );
$$;

grant execute on function central.ca_current_role() to authenticated;

-- ============================================================================
-- FUNCTION: central.current_user_id()
--
-- Thin wrapper over auth.uid() for consistency and testability.
-- ============================================================================
create or replace function central.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

grant execute on function central.current_user_id() to authenticated;
