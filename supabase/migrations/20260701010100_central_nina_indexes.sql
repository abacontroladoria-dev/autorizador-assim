-- Central de Atendimento — Nina Integration: Indexes
-- M-N02 | Nina Integration Block
-- Depends on: 20260701010000_central_nina_tables.sql (all new tables + ALTER TABLEs)
--
-- ROLLBACK: drop each index by name individually (todos idempotentes via IF EXISTS).
--   drop index if exists central.idx_teams_org_active;
--   drop index if exists central.idx_agent_settings_org;
--   drop index if exists central.idx_tag_definitions_org_active;
--   drop index if exists central.idx_tag_definitions_org_category;
--   drop index if exists central.idx_appointments_org_date;
--   drop index if exists central.idx_appointments_org_contact;
--   drop index if exists central.idx_appointments_org_conv;
--   drop index if exists central.idx_appointments_org_status;
--   drop index if exists central.idx_conv_states_org;
--   drop index if exists central.idx_msg_grouping_pending;
--   drop index if exists central.idx_msg_grouping_wamid;
--   drop index if exists central.idx_send_queue_pending;
--   drop index if exists central.idx_send_queue_conversation;
--   drop index if exists central.idx_contacts_tags_gin;
--   drop index if exists central.idx_conversations_tags_gin;
--   drop index if exists central.idx_inbox_members_team;

-- ============================================================================
-- INDEXES — central.teams
-- ============================================================================

-- Listar times ativos de uma org (dropdown de atribuição no workspace)
create index idx_teams_org_active
  on central.teams(organization_id, is_active);

-- ============================================================================
-- INDEXES — central.agent_settings
-- ============================================================================

-- Lookup de configuração da org: "qual é o default de IA para esta org?"
-- Frequente em cada mensagem processada pelo worker.
-- O índice parcial uq_agent_settings_org_default (criado em 010000)
-- cobre a query WHERE inbox_id IS NULL implicitamente via B-tree;
-- este índice cobre queries com inbox_id explícito.
create index idx_agent_settings_org
  on central.agent_settings(organization_id, inbox_id);

-- ============================================================================
-- INDEXES — central.tag_definitions
-- ============================================================================

-- Listar tags ativas de uma org para o seletor da UI (query mais comum)
create index idx_tag_definitions_org_active
  on central.tag_definitions(organization_id, is_active)
  where is_active = true;

-- Agrupar tags por categoria dentro da org (painéis de filtro agrupados)
create index idx_tag_definitions_org_category
  on central.tag_definitions(organization_id, category)
  where category is not null;

-- ============================================================================
-- INDEXES — central.appointments
-- ============================================================================

-- Listagem cronológica de agendamentos por org (agenda do dia / semana)
create index idx_appointments_org_date
  on central.appointments(organization_id, date desc, time asc);

-- Agendamentos de um contato específico (painel de histórico do contato)
create index idx_appointments_org_contact
  on central.appointments(organization_id, contact_id)
  where contact_id is not null;

-- Agendamentos originados de uma conversa (rastreabilidade IA → agenda)
create index idx_appointments_org_conv
  on central.appointments(organization_id, conversation_id)
  where conversation_id is not null;

-- Filtrar por status dentro da org (ex: "todos os agendamentos pendentes hoje")
create index idx_appointments_org_status
  on central.appointments(organization_id, status, date asc);

-- ============================================================================
-- INDEXES — central.conversation_states
-- ============================================================================

-- A constraint UNIQUE (conversation_id) em 010000 cria um índice B-tree
-- implicitamente — lookup direto por conversation_id está coberto.

-- Monitoramento: quantas conversas em cada estado por org (dashboard IA)
create index idx_conv_states_org
  on central.conversation_states(organization_id, current_state);

-- ============================================================================
-- INDEXES — central.message_grouping_queue
-- ============================================================================

-- Hot path do worker de agrupamento: busca itens pendentes prontos para processar.
-- process_after ASC garante FIFO com delay: processa os mais antigos primeiro.
-- Índice parcial (status = 'pending'): exclui completed/failed/cancelled da varredura.
-- Tipicamente pouquíssimas linhas neste índice — filas funcionam com throughput alto.
create index idx_msg_grouping_pending
  on central.message_grouping_queue(organization_id, process_after asc)
  where status = 'pending';

-- Deduplicação de webhook: "já existe entrada pendente para esta mensagem?"
-- Evita enfileirar o mesmo whatsapp_message_id duas vezes em caso de retry do provider.
create index idx_msg_grouping_wamid
  on central.message_grouping_queue(organization_id, whatsapp_message_id);

-- ============================================================================
-- INDEXES — central.send_queue
-- ============================================================================

-- Hot path do worker de envio: busca itens pendentes agendados para agora ou passado.
-- scheduled_at ASC: processa os mais antigos primeiro (respeita ordem de enfileiramento).
create index idx_send_queue_pending
  on central.send_queue(organization_id, scheduled_at asc)
  where status = 'pending';

-- Lookup de status da fila por conversa: "há mensagens pendentes nesta conversa?"
-- Usado pelo workspace para exibir indicador "enviando..." na thread.
create index idx_send_queue_conversation
  on central.send_queue(organization_id, conversation_id, created_at desc);

-- ============================================================================
-- INDEXES — colunas novas em tabelas existentes
-- ============================================================================

-- central.contacts.tags: filtragem por tag em toda a base de contatos da org.
-- GIN (Generalized Inverted Index) é obrigatório para queries @> (contains) em arrays.
-- Ex: WHERE tags @> ARRAY['lead_quente'] — sem GIN isso faz seq scan em toda a tabela.
create index idx_contacts_tags_gin
  on central.contacts using gin(tags)
  where tags is not null;

-- central.conversations.tags: filtragem de conversas por tag.
-- Mesma justificativa do GIN acima.
create index idx_conversations_tags_gin
  on central.conversations using gin(tags)
  where tags is not null;

-- central.inbox_members.team_id: "quais membros pertencem ao time X?"
-- Usado pela lógica de distribuição de conversas por time no workspace.
create index idx_inbox_members_team
  on central.inbox_members(team_id)
  where team_id is not null;
