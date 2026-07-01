import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Message,
  MessageAttachment,
  MessageDirection,
  MessageStatus,
  ProviderType,
  StorageStatus,
} from '../types/central.types'

// ============================================================================
// MessageRepository
//
// Acesso às tabelas central.messages e central.message_attachments.
//
// Design append-mostly:
//   Conteúdo de mensagem é imutável após criação.
//   Status (pending→sent→delivered→read) é mutável via updateStatus().
//   Deleção é soft-only via softDelete() — deleted_at nunca é null após deleção.
//
// Indexes utilizados (migration 20260701000600):
//   findByExternalId      → uq_messages_ext_id (unique partial index)
//   listByConversation    → idx_messages_conversation_sent
//   updateStatus          → PK lookup
// ============================================================================

export interface CreateMessageInput {
  organization_id:      string
  conversation_id:      string
  external_message_id?: string
  direction:            MessageDirection
  message_type?:        string        // default 'text'
  body?:                string
  provider?:            ProviderType
  sent_by_user_id?:     string
  sent_by_ai?:          boolean
  reply_to_message_id?: string
  status?:              MessageStatus  // default 'pending'
  sent_at?:             string
}

export interface CreateAttachmentInput {
  organization_id: string
  message_id:      string
  file_name?:      string
  file_type?:      string
  file_size?:      number
  external_url?:   string
  storage_path?:   string
  storage_status?: StorageStatus   // default 'pending'
  duration_secs?:  number
}

export interface ListMessagesParams {
  conversationId:   string
  limit?:           number    // default 50
  // Cursor ISO datetime para scroll infinito — carrega mensagens ANTES deste timestamp
  before?:          string
  withAttachments?: boolean   // default true
}

export class MessageRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(id: string): Promise<Message | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('messages')
      .select('*, attachments:message_attachments(*)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? this.normalize(data) : null
  }

  // Idempotência de webhooks — retorna null se não existir, nunca lança em miss.
  // Usa o índice único parcial uq_messages_ext_id scoped em (org, provider, external_id).
  async findByExternalId(
    externalId: string,
    orgId:      string,
    provider:   ProviderType
  ): Promise<Message | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('messages')
      .select('*')
      .eq('organization_id', orgId)
      .eq('provider', provider)
      .eq('external_message_id', externalId)
      .maybeSingle()

    if (error) throw error
    return (data ?? null) as Message | null
  }

  // Paginação infinita com cursor: carrega as 'limit' mensagens mais recentes
  // anteriores ao timestamp 'before'. Frontend concatena ao state existente.
  async listByConversation(params: ListMessagesParams): Promise<Message[]> {
    const limit           = params.limit           ?? 50
    const withAttachments = params.withAttachments ?? true

    const select = withAttachments
      ? '*, attachments:message_attachments(*)'
      : '*'

    let query = (this.supabase as any)
      .schema('central')
      .from('messages')
      .select(select)
      .eq('conversation_id', params.conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (params.before) {
      query = query.lt('created_at', params.before)
    }

    const { data, error } = await query
    if (error) throw error

    return ((data ?? []) as Record<string, unknown>[]).map(r => this.normalize(r))
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('messages')
      .insert({
        organization_id:     input.organization_id,
        conversation_id:     input.conversation_id,
        external_message_id: input.external_message_id ?? null,
        direction:           input.direction,
        message_type:        input.message_type ?? 'text',
        body:                input.body ?? null,
        provider:            input.provider ?? null,
        sent_by_user_id:     input.sent_by_user_id ?? null,
        sent_by_ai:          input.sent_by_ai ?? false,
        reply_to_message_id: input.reply_to_message_id ?? null,
        status:              input.status ?? 'pending',
        sent_at:             input.sent_at ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data as Message
  }

  // Persiste mensagem + attachments em sequência (FK: attachment.message_id).
  // Supabase JS não suporta transação explícita — a ordem garante integridade:
  // attachments referenciam messages.id que já existe após o primeiro INSERT.
  // Se o INSERT de attachments falhar, a mensagem já foi criada mas sem mídia
  // (estado inconsistente tolerável: worker de storage detecta e retenta).
  async createWithAttachments(
    messageInput:     CreateMessageInput,
    attachmentInputs: CreateAttachmentInput[]
  ): Promise<Message> {
    const message = await this.create(messageInput)

    if (attachmentInputs.length > 0) {
      const rows = attachmentInputs.map(a => ({
        organization_id: message.organization_id,
        message_id:      message.id,
        file_name:       a.file_name      ?? null,
        file_type:       a.file_type      ?? null,
        file_size:       a.file_size      ?? null,
        external_url:    a.external_url   ?? null,
        storage_path:    a.storage_path   ?? null,
        storage_status:  a.storage_status ?? 'pending',
        duration_secs:   a.duration_secs  ?? null,
      }))

      const { error } = await (this.supabase as any)
        .schema('central')
        .from('message_attachments')
        .insert(rows)

      if (error) throw error
    }

    return { ...message, attachments: [] }
  }

  // Atualiza status de entrega: pending → sent → delivered → read.
  // Disparado por webhooks de status do provider (Evolution: MESSAGE_UPDATE).
  // Supabase Realtime emite o evento de UPDATE automaticamente → UI atualiza tick.
  async updateStatus(id: string, status: MessageStatus): Promise<void> {
    const { error } = await (this.supabase as any)
      .schema('central')
      .from('messages')
      .update({ status })
      .eq('id', id)

    if (error) throw error
  }

  // Soft delete — WhatsApp permite que o remetente apague mensagens.
  // deleted_at preenchido; conteúdo preservado para auditoria.
  // UI deve exibir "Mensagem apagada" quando deleted_at IS NOT NULL.
  async softDelete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .schema('central')
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  }

  private normalize(row: Record<string, unknown>): Message {
    const { attachments, ...msg } = row
    return {
      ...msg,
      attachments: Array.isArray(attachments)
        ? (attachments as MessageAttachment[])
        : [],
    } as Message
  }
}
