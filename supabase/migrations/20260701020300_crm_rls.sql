-- CRM — Row Level Security
-- M-C04 | CRM Block
-- Depends on:
--   20260701020100_crm_tables.sql       (tabelas CRM)
--   20260701000700_create_ca_rls_helpers.sql (central.current_organization_id, central.ca_current_role)
--
-- Padrão herdado do schema central (20260701000800_create_ca_rls_policies.sql):
--   admin       → controle total dentro da org
--   director    → leitura + operações (inserir/atualizar deals e atividades)
--   service_role → bypass total (workers, Edge Functions, triggers cross-schema)
--
-- Nota especial para deals e deal_activities:
--   director pode inserir/atualizar (CRM é operacional, não só de configuração).
--   Apenas admin pode deletar deals (operação destrutiva irreversível).
--
-- Nota especial para pipeline_stages:
--   admin pode criar/editar/reordenar estágios.
--   director pode ver (para mover deals) mas não altera a estrutura do funil.
--   Estágios is_system = true são protegidos na aplicação (UI desabilita delete);
--   a policy não bloqueia no banco — admin pode remover se necessário.
--
-- ROLLBACK:
--   drop policy if exists <nome> on crm.<tabela>;
--   alter table crm.<tabela> disable row level security;

-- ============================================================================
-- ENABLE RLS — todas as tabelas CRM
-- ============================================================================

alter table crm.pipeline_stages  enable row level security;
alter table crm.deals             enable row level security;
alter table crm.deal_activities   enable row level security;
alter table crm.team_functions    enable row level security;
alter table crm.teams             enable row level security;
alter table crm.team_members      enable row level security;

-- ============================================================================
-- TABLE: crm.pipeline_stages
--
-- admin    : leitura + escrita (gerenciar estrutura do funil)
-- director : somente leitura (mover deals entre estágios não requer alterar stages)
-- ============================================================================

drop policy if exists pipeline_stages_select on crm.pipeline_stages;
create policy pipeline_stages_select
  on crm.pipeline_stages
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists pipeline_stages_insert_admin on crm.pipeline_stages;
create policy pipeline_stages_insert_admin
  on crm.pipeline_stages
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists pipeline_stages_update_admin on crm.pipeline_stages;
create policy pipeline_stages_update_admin
  on crm.pipeline_stages
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists pipeline_stages_delete_admin on crm.pipeline_stages;
create policy pipeline_stages_delete_admin
  on crm.pipeline_stages
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: crm.deals
--
-- admin + director : leitura + escrita (CRM é operação do dia-a-dia)
-- DELETE           : admin apenas (deals deletados perdem histórico de atividades)
-- ============================================================================

drop policy if exists deals_select on crm.deals;
create policy deals_select
  on crm.deals
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deals_insert on crm.deals;
create policy deals_insert
  on crm.deals
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deals_update on crm.deals;
create policy deals_update
  on crm.deals
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deals_delete_admin on crm.deals;
create policy deals_delete_admin
  on crm.deals
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: crm.deal_activities
--
-- admin + director : leitura + inserção + atualização
--   Operadores inserem notas, ligações, reuniões etc.
--   Atividades existentes podem ser editadas (marcar tarefa como concluída).
-- DELETE: admin apenas (log de atividades não deve ser apagado por operadores).
-- ============================================================================

drop policy if exists deal_activities_select on crm.deal_activities;
create policy deal_activities_select
  on crm.deal_activities
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deal_activities_insert on crm.deal_activities;
create policy deal_activities_insert
  on crm.deal_activities
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deal_activities_update on crm.deal_activities;
create policy deal_activities_update
  on crm.deal_activities
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists deal_activities_delete_admin on crm.deal_activities;
create policy deal_activities_delete_admin
  on crm.deal_activities
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: crm.team_functions
--
-- admin    : leitura + escrita (gerenciar catálogo de funções: SDR, Closer...)
-- director : somente leitura (ver funções ao consultar times)
-- ============================================================================

drop policy if exists team_functions_select on crm.team_functions;
create policy team_functions_select
  on crm.team_functions
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists team_functions_insert_admin on crm.team_functions;
create policy team_functions_insert_admin
  on crm.team_functions
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists team_functions_update_admin on crm.team_functions;
create policy team_functions_update_admin
  on crm.team_functions
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists team_functions_delete_admin on crm.team_functions;
create policy team_functions_delete_admin
  on crm.team_functions
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: crm.teams
--
-- admin    : leitura + escrita (criar e gerenciar times de vendas)
-- director : somente leitura (ver estrutura de times ao distribuir deals)
-- ============================================================================

drop policy if exists crm_teams_select on crm.teams;
create policy crm_teams_select
  on crm.teams
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists crm_teams_insert_admin on crm.teams;
create policy crm_teams_insert_admin
  on crm.teams
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists crm_teams_update_admin on crm.teams;
create policy crm_teams_update_admin
  on crm.teams
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

drop policy if exists crm_teams_delete_admin on crm.teams;
create policy crm_teams_delete_admin
  on crm.teams
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: crm.team_members
--
-- admin    : leitura + escrita (gerenciar quem está em qual time)
-- director : leitura + inserção/atualização (operador pode se adicionar ou
--             adicionar colegas ao time, mas admin remove)
-- DELETE   : admin apenas
-- ============================================================================

drop policy if exists team_members_select on crm.team_members;
create policy team_members_select
  on crm.team_members
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists team_members_insert on crm.team_members;
create policy team_members_insert
  on crm.team_members
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists team_members_update on crm.team_members;
create policy team_members_update
  on crm.team_members
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

drop policy if exists team_members_delete_admin on crm.team_members;
create policy team_members_delete_admin
  on crm.team_members
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );
