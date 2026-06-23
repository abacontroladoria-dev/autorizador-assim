-- Central de Atendimento — Nina Integration: RLS Policies
-- M-N03 | Nina Integration Block
-- Depends on:
--   20260701010000_central_nina_tables.sql (novas tabelas)
--   20260701000700_create_ca_rls_helpers.sql (central.current_organization_id, central.ca_current_role)
--
-- Padrão herdado das policies existentes (20260701000800_create_ca_rls_policies.sql):
--   admin    → controle total dentro da org
--   director → leitura + updates operacionais; sem escrita em config/infra
--   service_role → bypass total (workers, Edge Functions)
--
-- Filas (message_grouping_queue, send_queue):
--   authenticated pode apenas ler (SELECT) para monitoramento.
--   INSERT / UPDATE: service_role apenas (workers via Edge Function com service_role key).
--   Isso protege integridade das filas de modificações manuais via cliente.
--
-- ROLLBACK:
--   drop policy if exists <nome> on central.<tabela>;
--   alter table central.<tabela> disable row level security;

-- ============================================================================
-- ENABLE RLS — todas as novas tabelas
-- ============================================================================

alter table central.teams                   enable row level security;
alter table central.agent_settings          enable row level security;
alter table central.tag_definitions         enable row level security;
alter table central.appointments            enable row level security;
alter table central.conversation_states     enable row level security;
alter table central.message_grouping_queue  enable row level security;
alter table central.send_queue              enable row level security;

-- ============================================================================
-- TABLE: central.teams
--
-- admin    : leitura + escrita (criar/editar/desativar times)
-- director : somente leitura (visão de operação, sem gerenciamento de times)
-- ============================================================================

create policy teams_select
  on central.teams
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy teams_insert_admin
  on central.teams
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy teams_update_admin
  on central.teams
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

create policy teams_delete_admin
  on central.teams
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.agent_settings
--
-- admin    : leitura + escrita (configurar credenciais TTS, prompt, parâmetros IA)
-- director : somente leitura (visão das configurações ativas, sem editar credenciais)
--
-- Nota de segurança: elevenlabs_api_key é armazenada em texto puro.
--   A policy de SELECT para director permite ver a chave. Se isso for indesejável,
--   criar uma view central.agent_settings_public (ver 20260701010300) que omite
--   as colunas de credencial, e restringir o SELECT direto a admin apenas.
-- ============================================================================

create policy agent_settings_select_admin
  on central.agent_settings
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy agent_settings_insert_admin
  on central.agent_settings
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy agent_settings_update_admin
  on central.agent_settings
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

create policy agent_settings_delete_admin
  on central.agent_settings
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.tag_definitions
--
-- admin    : leitura + escrita (gerenciar catálogo de tags)
-- director : somente leitura (usar tags existentes)
-- ============================================================================

create policy tag_definitions_select
  on central.tag_definitions
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy tag_definitions_insert_admin
  on central.tag_definitions
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy tag_definitions_update_admin
  on central.tag_definitions
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

create policy tag_definitions_delete_admin
  on central.tag_definitions
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.appointments
--
-- admin + director : leitura + escrita (criar e gerenciar agendamentos)
-- DELETE           : admin apenas
-- Nota: agendamentos criados pela IA (created_by_ai = true) são inseridos
--       via service_role no worker — sem necessidade de policy para INSERT autômato.
-- ============================================================================

create policy appointments_select
  on central.appointments
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy appointments_insert
  on central.appointments
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy appointments_update
  on central.appointments
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

create policy appointments_delete_admin
  on central.appointments
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.conversation_states
--
-- admin + director : SELECT (monitoramento do estado IA das conversas)
-- UPDATE           : service_role apenas (worker/orquestrador atualiza o estado)
-- INSERT           : service_role apenas (criado automaticamente no início da conversa)
-- DELETE           : service_role apenas (cascaded por ON DELETE CASCADE em conversations)
--
-- Não expor UPDATE para authenticated evita que a UI sobrescreva o estado da
-- máquina de estados diretamente, o que poderia corromper o fluxo do orquestrador.
-- ============================================================================

create policy conversation_states_select
  on central.conversation_states
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.message_grouping_queue
--
-- SELECT  : admin + director (monitoramento e diagnóstico)
-- INSERT / UPDATE / DELETE : service_role apenas (worker)
-- ============================================================================

create policy message_grouping_queue_select
  on central.message_grouping_queue
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.send_queue
--
-- SELECT  : admin + director (monitoramento de mensagens pendentes de envio)
-- INSERT / UPDATE / DELETE : service_role apenas (worker)
-- ============================================================================

create policy send_queue_select
  on central.send_queue
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );
