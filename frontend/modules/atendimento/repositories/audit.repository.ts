import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationEventType } from '../types/events.types'

// ============================================================================
// AuditRepository
//
// Ponto único de escrita em central.conversation_events.
// Regras invariáveis:
//   1. Sempre usa service role (nunca anon key) — auditoria não pode ser
//      bloqueada por RLS e deve registrar eventos de sistema sem sessão.
//   2. insert() NUNCA lança exceção — falha de auditoria não deve
//      interromper o fluxo de negócio que a originou.
//   3. Erros são logados de forma estruturada para rastreio em observabilidade.
// ============================================================================

export interface AuditEntry {
  organization_id:   string
  conversation_id?:  string
  event_type:        ConversationEventType
  // undefined = evento de sistema (webhook, worker, job).
  // UUID string = usuário humano identificado.
  performed_by?:     string
  performed_role?:   string
  payload?:          Record<string, unknown>
}

export class AuditRepository {
  // Espera receber supabaseService (service role) — nunca o cliente do usuário.
  constructor(private readonly supabase: SupabaseClient) {}

  // Fire-and-forget intencional para os callers: retorna void.
  // Internamente é async mas nunca rejeita — erros são absorvidos e logados.
  async insert(entry: AuditEntry): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .schema('central')
        .from('conversation_events')
        .insert({
          organization_id: entry.organization_id,
          conversation_id: entry.conversation_id ?? null,
          event_type:      entry.event_type,
          performed_by:    entry.performed_by ?? null,
          performed_role:  entry.performed_role ?? null,
          payload:         entry.payload ?? null,
        })

      if (error) {
        // Erro estruturado — não lança, apenas registra
        console.error('[AuditRepository] Falha ao inserir evento', {
          event_type:       entry.event_type,
          organization_id:  entry.organization_id,
          conversation_id:  entry.conversation_id,
          performed_by:     entry.performed_by,
          supabase_code:    error.code,
          supabase_message: error.message,
          supabase_hint:    error.hint,
          supabase_details: error.details,
        })
      }
    } catch (err) {
      // Captura erros de rede, serialização ou outros imprevistos
      console.error('[AuditRepository] Erro inesperado', {
        event_type:      entry.event_type,
        organization_id: entry.organization_id,
        conversation_id: entry.conversation_id,
        error: err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
      })
    }
  }

  // Listagem do histórico de uma conversa (timeline no painel).
  // Esta operação PODE lançar — é uma leitura controlada, não um side effect.
  async listByConversation(
    conversationId: string,
    orgId:          string
  ): Promise<AuditEntry[]> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('conversation_events')
      .select('*')
      .eq('organization_id', orgId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as AuditEntry[]
  }
}
