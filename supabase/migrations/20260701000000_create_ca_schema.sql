-- Central de Atendimento — Schema Foundation
-- M-000a | Sprint 0
-- Reversible: DROP SCHEMA central CASCADE

-- ============================================================================
-- SCHEMA
-- ============================================================================
create schema if not exists central;

-- ============================================================================
-- GRANTS
-- C-1 (2026-06-17): authenticated precisa de DML grants para que RLS funcione.
-- PostgreSQL verifica table-level grant antes de avaliar policies — sem DML
-- grant em authenticated, toda query autenticada falha com "permission denied"
-- antes de qualquer policy ser executada.
-- ============================================================================
grant usage on schema central to service_role;
grant usage on schema central to authenticated;

grant select, insert, update, delete on all tables in schema central to service_role;
grant select, insert, update, delete on all tables in schema central to authenticated;
grant usage, select on all sequences in schema central to service_role;
grant usage, select on all sequences in schema central to authenticated;

-- Tabelas criadas futuramente no schema central herdam estes grants automaticamente
alter default privileges in schema central
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema central
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema central
  grant usage, select on sequences to service_role;
alter default privileges in schema central
  grant usage, select on sequences to authenticated;

-- ============================================================================
-- TABLE: central.organizations
-- Root of every FK chain in the Central schema.
-- All other tables reference organization_id → this table.
-- ============================================================================
create table central.organizations (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        unique not null,
  active     boolean     default true,
  plan       text,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- C-2 (2026-06-17): DROP IF EXISTS + CREATE para idempotência em ambientes de dev.
-- Função usada: public.set_updated_at() (linha 1383 de 20260518131652_remote_schema.sql).
-- Nota: public.handle_updated_at() não existe no projeto.
drop trigger if exists set_updated_at on central.organizations;
create trigger set_updated_at
  before update on central.organizations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- SEED: Default organization (single-tenant bootstrap)
-- Fixed UUID so M-000b and subsequent migrations can reference it
-- deterministically without gen_random_uuid() at migration time.
-- ============================================================================
insert into central.organizations (id, name, slug, active)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Universo ABA',
  'universo-aba',
  true
)
on conflict (id) do nothing;
