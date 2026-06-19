-- Central de Atendimento — Conversation Events (Audit Trail)
-- M-010 | Sprint 1
-- Depends on:
--   20260701000000_create_ca_schema.sql        (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql (public.usuarios)
--   20260701000500_create_ca_conversations.sql  (central.conversations)
--
-- Design:
--   Tabela append-only: nenhuma linha é atualizada ou deletada.
--   Ausência de updated_at é intencional — mutação desta tabela viola o contrato
--   de auditoria. A constraint de integridade é garantida pela aplicação:
--   AuditRepository.insert() é o único ponto de escrita.
--
--   performed_by nullable:
--     NULL indica evento de sistema (webhook, worker, job agendado).
--     UUID indica usuário humano — snapshot do role capturado em performed_role.
--
--   payload jsonb:
--     Contexto livre por event_type. A aplicação documenta o shape esperado
--     por tipo de evento em events.types.ts (ConversationEventType).
--     Não normalizado intencionalmente: evitar JOINs em queries de auditoria.
--
--   conversation_id nullable:
--     Eventos de canal (channel.connected, webhook.received) não pertencem a
--     uma conversa específica. conversation_id IS NULL nestes casos.
-- ============================================================================

create table central.conversation_events (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  conversation_id uuid        references central.conversations(id),
  event_type      text        not null,
  performed_by    uuid        references public.usuarios(id) on delete set null,
  performed_role  text,
  payload         jsonb,
  created_at      timestamptz default now()
  -- Sem updated_at: tabela imutável por contrato
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Histórico de uma conversa em ordem cronológica (painel de timeline)
create index idx_conv_events_org_conv
  on central.conversation_events(organization_id, conversation_id, created_at desc)
  where conversation_id is not null;

-- Audit trail por operador (quem fez o quê na org)
create index idx_conv_events_actor
  on central.conversation_events(organization_id, performed_by, created_at desc)
  where performed_by is not null;

-- Filtrar por tipo de evento na org (ex: todas as transferências do dia)
create index idx_conv_events_type
  on central.conversation_events(organization_id, event_type, created_at desc);
