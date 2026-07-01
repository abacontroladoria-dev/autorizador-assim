-- Central de Atendimento — Conversations
-- M-005 | Block 3
-- Depends on:
--   20260701000000_create_ca_schema.sql          (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql   (public.usuarios)
--   20260701000100_create_ca_enums.sql           (conversation_status, conversation_intent, ai_mode)
--   20260701000200_create_ca_inboxes.sql         (central.inboxes)
--   20260701000300_create_ca_channels.sql        (central.channels)
--   20260701000400_create_ca_contacts.sql        (central.contacts)

-- ============================================================================
-- TABLE: central.conversations
--
-- Modelagem:
--   Uma conversa representa a interação contínua entre um contato e a clínica
--   em um canal específico. Toda mensagem pertence a exatamente uma conversa.
--
--   Ciclo de vida de status:
--     open      → nenhum operador atribuído; conversa na fila pública da inbox
--     assigned  → assigned_user_id preenchido; operador responsável definido
--     waiting   → operador aguarda resposta do contato
--     resolved  → atendimento encerrado; resolved_at preenchido
--     archived  → conversa movida para histórico; archived_at preenchido
--
--   Autorização V1:
--     inbox_members é a fonte única de autorização para acesso a conversas.
--     conversation_participants não implementado nesta fase — postergado para V2.
--     Um usuário vê as conversas das inboxes das quais é membro.
--
--   last_message_at:
--     Campo desnormalizado para ordenação eficiente da fila (mais recentes
--     primeiro). Atualizado por trigger AFTER INSERT ON messages, definido em
--     20260701000600_create_ca_messages.sql. Nunca atualizado pela aplicação
--     diretamente — evita race conditions em envios simultâneos.
--
--   archived_at:
--     Timestamp de transição para 'archived'. Permite calcular tempo total
--     da conversa para métricas de SLA e relatórios operacionais.
--
--   ai_mode:
--     Modo atual de IA desta conversa. Default 'off'. Pode ser sobrescrito
--     por operador ou supervisor. Quando implementado, central.inboxes receberá
--     campo default_ai_mode para pré-preencher novas conversas automaticamente.
--
--   priority valid values:  'low' | 'medium' | 'high' | 'urgent'
--   sentiment valid values: 'positive' | 'negative' | 'neutral'
-- ============================================================================
create table central.conversations (
  id               uuid                        primary key default gen_random_uuid(),
  organization_id  uuid                        not null references central.organizations(id),
  inbox_id         uuid                        not null references central.inboxes(id),
  channel_id       uuid                        not null references central.channels(id),
  contact_id       uuid                        not null references central.contacts(id),
  assigned_user_id uuid                        references public.usuarios(id) on delete set null,
  status           central.conversation_status not null default 'open',
  priority         text,
  intent           central.conversation_intent,
  sentiment        text,
  ai_mode          central.ai_mode             not null default 'off',
  last_message_at  timestamptz,
  resolved_at      timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz                 default now(),
  updated_at       timestamptz                 default now()
);

drop trigger if exists set_updated_at on central.conversations;
create trigger set_updated_at
  before update on central.conversations
  for each row execute function public.set_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Query principal do workspace: conversas abertas de uma inbox
-- leading columns: org → inbox → status (drill-down natural do operador)
create index idx_conversations_org_inbox_status
  on central.conversations(organization_id, inbox_id, status);

-- Visão supervisor/director: todas as conversas da org ordenadas por recência
create index idx_conversations_org_status_last_msg
  on central.conversations(organization_id, status, last_message_at desc);

-- Histórico completo de interações de um contato
create index idx_conversations_org_contact
  on central.conversations(organization_id, contact_id);

-- Carga do operador: suas conversas atribuídas (parcial — exclui não atribuídas)
create index idx_conversations_org_assigned
  on central.conversations(organization_id, assigned_user_id)
  where assigned_user_id is not null;

-- Analytics e relatórios: range queries por data de criação
create index idx_conversations_org_created
  on central.conversations(organization_id, created_at desc);

-- Garantia de unicidade: um contato só pode ter uma conversa ativa por canal.
-- Cobre status open + assigned + waiting. Libera o slot quando resolved/archived.
-- Impede que o webhook processor crie conversas duplicadas acidentalmente.
create unique index uq_conversations_active_per_contact_channel
  on central.conversations(channel_id, contact_id)
  where status not in ('resolved', 'archived');
