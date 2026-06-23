-- CRM — Indexes
-- M-C03 | CRM Block
-- Depends on:
--   20260701020100_crm_tables.sql (todas as tabelas CRM)
--
-- Estratégia de indexação:
--   - organization_id como prefixo em todos os índices compostos (multi-tenant)
--   - Índices parciais WHERE is_active = true para evitar varredura de dados inativos
--   - Índice em status = 'open' em crm.deals (query mais frequente: ver deals ativos)
--   - Sem índice em deal_activities.description (campo livre, não filtrado)
--
-- ROLLBACK:
--   drop index if exists crm.idx_pipeline_stages_org_pos;
--   drop index if exists crm.idx_deals_org_stage;
--   drop index if exists crm.idx_deals_org_status;
--   drop index if exists crm.idx_deals_contact;
--   drop index if exists crm.idx_deals_conversation;
--   drop index if exists crm.idx_deals_assigned;
--   drop index if exists crm.idx_deals_ai_score;
--   drop index if exists crm.idx_deal_activities_deal;
--   drop index if exists crm.idx_deal_activities_type;
--   drop index if exists crm.idx_team_members_team;
--   drop index if exists crm.idx_team_members_user;

-- ============================================================================
-- crm.pipeline_stages
-- ============================================================================

-- Listagem ordenada do funil (query principal do Kanban)
create index idx_pipeline_stages_org_pos
  on crm.pipeline_stages(organization_id, position)
  where is_active = true;

-- ============================================================================
-- crm.deals
-- ============================================================================

-- Deals por estágio (renderização de colunas Kanban)
create index idx_deals_org_stage
  on crm.deals(organization_id, stage_id)
  where status = 'open';

-- Deals abertos por organização (listagem geral)
create index idx_deals_org_status
  on crm.deals(organization_id, status, updated_at desc);

-- Deals de um contato específico (painel lateral do contato em central)
create index idx_deals_contact
  on crm.deals(contact_id)
  where contact_id is not null;

-- Deals originados por uma conversa (rastreabilidade)
create index idx_deals_conversation
  on crm.deals(conversation_id)
  where conversation_id is not null;

-- Deals por responsável (visão individual do operador)
create index idx_deals_assigned
  on crm.deals(organization_id, assigned_to)
  where assigned_to is not null and status = 'open';

-- Score de IA (ordenar leads por qualificação)
create index idx_deals_ai_score
  on crm.deals(organization_id, ai_score desc)
  where ai_score is not null and status = 'open';

-- ============================================================================
-- crm.deal_activities
-- ============================================================================

-- Atividades de um deal (timeline do deal — query principal)
create index idx_deal_activities_deal
  on crm.deal_activities(deal_id, created_at desc);

-- Atividades por tipo (filtrar análises IA vs atividades humanas)
create index idx_deal_activities_type
  on crm.deal_activities(organization_id, type, created_at desc);

-- ============================================================================
-- crm.team_members
-- ============================================================================

-- Membros de um time (distribuição de deals)
create index idx_team_members_team
  on crm.team_members(team_id)
  where is_active = true;

-- Times de um usuário (load balancing reverso)
create index idx_team_members_user
  on crm.team_members(user_id)
  where user_id is not null and is_active = true;
