-- CRM — Schema Creation
-- M-C01 | CRM Block
-- Depends on:
--   20260701000000_create_ca_schema.sql (central.organizations, pattern de grants)
--
-- O que faz:
--   Cria o schema `crm` para gestão comercial e pipeline de vendas.
--   O CRM do Nina é preservado integralmente neste schema separado,
--   evitando que entidades comerciais contaminem o schema `central`
--   (comunicação e atendimento) ou o schema `public` (operação clínica).
--
-- Separação de domínios:
--   central → comunicação e atendimento (mensagens, conversas, canais)
--   crm     → gestão comercial e pipeline (deals, funil, times de vendas)
--   public  → operação clínica existente (TITA, agenda, autorizações)
--
-- ROLLBACK:
--   drop schema if exists crm cascade;

-- ============================================================================
-- SCHEMA
-- ============================================================================
create schema if not exists crm;

comment on schema crm is
  'CRM domain: deals pipeline, sales teams, commercial activities. '
  'Integrates with central.contacts for lead management. '
  'Preserves Nina CRM intact as a separate domain from communication (central) '
  'and clinical operation (public).';

-- ============================================================================
-- GRANTS
--
-- Padrão idêntico ao schema central:
--   authenticated → SELECT/INSERT/UPDATE/DELETE em tabelas (controlado por RLS)
--   service_role  → tudo (bypassa RLS — workers, Edge Functions)
--   anon          → usage apenas (sem acesso direto a dados)
-- ============================================================================
grant usage on schema crm to authenticated, anon, service_role;

alter default privileges in schema crm
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema crm
  grant usage on sequences to authenticated;

alter default privileges in schema crm
  grant all on tables to service_role;

alter default privileges in schema crm
  grant all on sequences to service_role;

alter default privileges in schema crm
  grant execute on functions to service_role;
