// ============================================================================
// Central de Atendimento — Core Types
//
// Fonte de verdade para todos os tipos da camada de domínio.
// Derivados diretamente das migrations SQL — qualquer alteração no banco
// deve ser refletida aqui antes de atualizar repositories e services.
//
// Migrations de referência:
//   20260701000100_create_ca_enums.sql      → enums
//   20260701000200_create_ca_inboxes.sql    → Inbox, InboxMember
//   20260701000300_create_ca_channels.sql   → Channel, ChannelConnection
//   20260701000400_create_ca_contacts.sql   → Contact, ContactIdentifier, ContactPatientLink
//   20260701000500_create_ca_conversations.sql → Conversation
//   20260701000600_create_ca_messages.sql   → Message, MessageAttachment
// ============================================================================

// ----------------------------------------------------------------------------
// Enums — espelham central.*_type e central.*_status do PostgreSQL
// ----------------------------------------------------------------------------

export type ConversationStatus =
  | 'open'
  | 'assigned'
  | 'waiting'
  | 'resolved'
  | 'archived'

export type ContactType =
  | 'guardian'
  | 'patient'
  | 'therapist'
  | 'physician'
  | 'employee'
  | 'lead'
  | 'supplier'
  | 'other'

export type ProviderType =
  | 'evolution'
  | 'meta_waba'
  | 'instagram'

export type AIMode =
  | 'off'
  | 'assisted'
  | 'autonomous'

export type NotificationPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type ChannelStatus =
  | 'active'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'suspended'

// Derivados de constraints text das colunas (documentados nos comentários SQL)
export type MessageDirection = 'inbound' | 'outbound'

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'deleted'

export type StorageStatus = 'pending' | 'stored' | 'failed'

export type ContactStatus = 'active' | 'unidentified' | 'blocked' | 'merged'

export type IdentifierType =
  | 'phone'
  | 'email'
  | 'wa_id'
  | 'instagram_id'
  | 'facebook_id'

export type ResolvedBy = 'automatic' | 'manual' | 'ai'

export type RelationshipType =
  | 'guardian'
  | 'mother'
  | 'father'
  | 'grandmother'
  | 'grandfather'
  | 'sibling'
  | 'self'
  | 'caregiver'
  | 'other'

// ----------------------------------------------------------------------------
// Entidades — mirror exato das colunas do banco
// ----------------------------------------------------------------------------

export interface Conversation {
  id:               string
  organization_id:  string
  inbox_id:         string
  channel_id:       string
  contact_id:       string
  assigned_user_id: string | null
  status:           ConversationStatus
  priority:         string | null
  intent:           string | null
  sentiment:        string | null
  ai_mode:          AIMode
  last_message_at:  string | null
  resolved_at:      string | null
  archived_at:      string | null
  created_at:       string
  updated_at:       string
}

export interface Message {
  id:                  string
  organization_id:     string
  conversation_id:     string
  external_message_id: string | null
  direction:           MessageDirection
  message_type:        string
  body:                string | null
  // Coluna 'provider' (não provider_type) — espelha central.provider_type enum
  provider:            ProviderType | null
  sent_by_user_id:     string | null
  sent_by_ai:          boolean
  reply_to_message_id: string | null
  status:              MessageStatus
  sent_at:             string | null
  deleted_at:          string | null
  created_at:          string
  updated_at:          string
  // Relacionamento expandido opcionalmente por listByConversation
  attachments?:        MessageAttachment[]
}

export interface MessageAttachment {
  id:              string
  organization_id: string
  message_id:      string
  file_name:       string | null
  file_type:       string | null
  file_size:       number | null
  storage_path:    string | null
  external_url:    string | null
  storage_status:  StorageStatus
  duration_secs:   number | null
  thumbnail_path:  string | null
  created_at:      string
  updated_at:      string
}

export interface Contact {
  id:                     string
  organization_id:        string
  name:                   string | null
  display_phone:          string | null
  display_email:          string | null
  contact_type:           ContactType
  status:                 ContactStatus
  source:                 string | null
  avatar_url:             string | null
  is_provisional:         boolean
  merged_into_contact_id: string | null
  last_interaction_at:    string | null
  deleted_at:             string | null
  created_at:             string
  updated_at:             string
}

export interface ContactIdentifier {
  id:               string
  organization_id:  string
  contact_id:       string
  identifier_type:  IdentifierType
  identifier_value: string
  is_primary:       boolean
  created_at:       string
}

export interface ContactPatientLink {
  id:               string
  organization_id:  string
  contact_id:       string
  // BIGINT no banco → number no TypeScript (não UUID)
  tita_paciente_id: number
  relationship_type:RelationshipType | null
  confidence_score: number | null
  resolved_by:      ResolvedBy | null
  resolved_at:      string | null
  created_by:       string | null
  created_at:       string
}

export interface Channel {
  id:              string
  organization_id: string
  inbox_id:        string
  name:            string
  // Coluna 'provider' (não provider_type) — espelha central.provider_type enum
  provider:        ProviderType
  channel_type:    string
  status:          ChannelStatus
  active:          boolean
  created_at:      string
  updated_at:      string
}

export interface ChannelConnection {
  id:                   string
  organization_id:      string
  channel_id:           string
  external_id:          string | null
  provider_instance_id: string | null
  provider_account_id:  string | null
  provider_metadata:    Record<string, unknown> | null
  connection_status:    ChannelStatus
  last_sync_at:         string | null
  created_at:           string
  updated_at:           string
}

// ----------------------------------------------------------------------------
// Provider abstraction — interface do contrato de mensageria
// Implementações: EvolutionProvider (Sprint 2), MetaWabaProvider (Sprint 3)
// ----------------------------------------------------------------------------

export interface ProviderSendInput {
  to:          string     // número E.164 ou wa_id do contato
  body?:       string
  messageType: string
  mediaUrl?:   string
  caption?:    string
  fileName?:   string
  replyToId?:  string    // external_message_id da mensagem citada
}

export interface ProviderSendResult {
  externalId: string
  status:     MessageStatus
  sentAt:     string
}

export interface NormalizedIncomingMessage {
  externalMessageId:  string
  from:               string   // número E.164 ou wa_id
  body?:              string
  messageType:        string
  sentAt?:            string
  replyToExternalId?: string
  attachments?: {
    externalUrl:  string
    fileType?:    string
    fileName?:    string
    fileSize?:    number
    durationSecs?:number
  }[]
}

export interface MessagingProvider {
  sendMessage(channel: Channel, input: ProviderSendInput): Promise<ProviderSendResult>
  sendMedia(channel: Channel, input: ProviderSendInput): Promise<ProviderSendResult>
  getStatus(channel: Channel): Promise<ChannelStatus>
  processWebhook(raw: unknown): Promise<NormalizedIncomingMessage>
}

// Contrato mínimo que MessageService exige do factory.
// ProviderFactory (services/index.ts) implementa este contrato.
// Evita dependência circular entre message.service.ts e services/index.ts.
export interface ProviderResolver {
  get(type: ProviderType): MessagingProvider
}

// ----------------------------------------------------------------------------
// Utilitários de paginação
// ----------------------------------------------------------------------------

export interface PaginatedResult<T> {
  data:  T[]
  count: number
}

export interface PaginationParams {
  limit?:  number
  offset?: number
}
