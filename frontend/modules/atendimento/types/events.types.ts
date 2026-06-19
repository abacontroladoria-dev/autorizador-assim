// ============================================================================
// Central de Atendimento — Event Types
//
// Define dois contratos relacionados a eventos:
//
//   1. ConversationEventType — string union dos tipos de eventos gravados em
//      central.conversation_events (tabela de auditoria). Usado por AuditRepository.
//
//   2. CAEventMap — mapa tipado dos eventos emitidos pelo caEventBus (in-process).
//      Apenas eventos de side effect: notificação, SLA, auditoria.
//      NÃO usados para orquestrar o fluxo principal de negócio.
// ============================================================================

import type { Conversation, Message, MessageStatus } from './central.types'

// ----------------------------------------------------------------------------
// ConversationEventType
// Superset dos eventos do CAEventMap — inclui eventos de sistema (webhook,
// contact) que não passam pelo EventBus mas são registrados no banco.
// ----------------------------------------------------------------------------

export type ConversationEventType =
  // Ciclo de vida da conversa
  | 'conversation.created'
  | 'conversation.assigned'
  | 'conversation.unassigned'
  | 'conversation.transferred'
  | 'conversation.resolved'
  | 'conversation.archived'
  | 'conversation.reopened'
  // Mensagens
  | 'message.received'
  | 'message.sent'
  | 'message.deleted'
  | 'message.status_updated'
  // Contatos
  | 'contact.created'
  | 'contact.updated'
  | 'contact.merged'
  | 'patient_link.created'
  // Infra
  | 'webhook.received'
  | 'webhook.failed'
  | 'channel.connected'
  | 'channel.disconnected'

// ----------------------------------------------------------------------------
// CAEventMap — contrato do EventBus in-process
//
// ESCOPO: side effects após operação principal persistida com sucesso.
//
// Listeners ativos no Sprint 1: nenhum (estrutura preparada).
// Listeners Sprint 2: NotificationService (message.received, conversation.assigned,
//                     conversation.transferred).
// Listeners Sprint 3: SLAService (message.received, conversation.resolved).
//
// Regra: listeners NÃO lançam exceção para o caller — falha interna de listener
// não reverte a operação que gerou o evento.
// ----------------------------------------------------------------------------

export type CAEventMap = {
  'conversation.created': {
    conversation: Conversation
    actorId:      string   // 'system' para webhooks
  }

  'conversation.assigned': {
    conversation:     Conversation
    toUserId:         string
    previousAssignee: string | null
    actorId:          string
  }

  'conversation.transferred': {
    conversation: Conversation
    toUserId:     string
    fromUserId:   string | null
    actorId:      string
    reason?:      string
  }

  'conversation.resolved': {
    conversation: Conversation
    actorId:      string
  }

  'conversation.archived': {
    conversation: Conversation
    actorId:      string
  }

  'conversation.reopened': {
    conversation: Conversation
    actorId:      string
  }

  'message.received': {
    message:      Message
    // Subset para evitar carregar conversa completa desnecessariamente
    conversation: Pick<Conversation, 'id' | 'organization_id' | 'inbox_id' | 'assigned_user_id'>
  }

  'message.sent': {
    message:      Message
    conversation: Pick<Conversation, 'id' | 'organization_id' | 'inbox_id'>
    actorId:      string
  }

  // Delivery status update recebido do provider (sent → delivered → read)
  'message.status_updated': {
    messageId:   string
    status:      MessageStatus
    externalId:  string
    provider:    string
  }
}

export type CAEventName    = keyof CAEventMap
export type CAEventPayload<K extends CAEventName> = CAEventMap[K]
