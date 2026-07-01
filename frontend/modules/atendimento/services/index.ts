import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseService }     from '@/lib/supabase/service'
import type { MessagingProvider, ProviderType } from '../types/central.types'
import { ProviderNotImplementedError }          from '../types/errors.types'
import { caEventBus }                           from '../events/event-bus'

import { AuditRepository }        from '../repositories/audit.repository'
import { ConversationRepository } from '../repositories/conversation.repository'
import { MessageRepository }      from '../repositories/message.repository'
import { ContactRepository }      from '../repositories/contact.repository'

import { ConversationService } from './conversation.service'
import { MessageService }      from './message.service'
import { ContactService }      from './contact.service'

// ============================================================================
// ProviderFactory
//
// Ponto único de acesso aos providers de mensageria.
// Sprint 1: todos os providers retornam ProviderNotImplementedError —
//   a arquitetura está correta, as implementações chegam no Sprint 2.
// Sprint 2: EvolutionProvider wired em 'evolution'.
// Sprint 3: MetaWabaProvider wired em 'meta_waba'.
//
// Não expor o factory diretamente ao caller — ele recebe um serviço já
// instanciado por createMessageService() ou createSystemServices().
// ============================================================================

export class ProviderFactory {
  private readonly registry = new Map<ProviderType, MessagingProvider>()

  // Registrar um provider concreto (chamado no bootstrap quando implementado)
  register(type: ProviderType, provider: MessagingProvider): void {
    this.registry.set(type, provider)
  }

  get(type: ProviderType): MessagingProvider {
    const provider = this.registry.get(type)
    if (!provider) throw new ProviderNotImplementedError(type)
    return provider
  }
}

// Singleton do factory — compartilhado entre todas as instâncias de serviço
const providerFactory = new ProviderFactory()

// ============================================================================
// Factory functions — instanciam os serviços com o cliente correto
//
// createConversationService(userClient):
//   Para Route Handlers e Server Actions com sessão de usuário.
//   userClient = createServerClient com cookies do usuário → RLS aplicada.
//   AuditRepository SEMPRE usa service role (nunca o cliente do usuário).
//
// createMessageService(userClient):
//   Mesmo princípio. Provider é resolvido internamente pelo MessageService.
//
// createSystemServices():
//   Para webhook processors e jobs sem sessão de usuário.
//   Todos os repositories usam service role — sem RLS.
//   Único contexto onde service role é legítimo para dados de negócio.
// ============================================================================

export function createConversationService(userClient: SupabaseClient): ConversationService {
  return new ConversationService(
    new ConversationRepository(userClient),
    new AuditRepository(supabaseService),   // sempre service role
    caEventBus
  )
}

export function createMessageService(userClient: SupabaseClient): MessageService {
  return new MessageService(
    new MessageRepository(userClient),
    new ConversationRepository(userClient),
    new ContactRepository(userClient),
    new AuditRepository(supabaseService),   // sempre service role
    caEventBus,
    providerFactory,
    userClient
  )
}

// Para webhook processors e workers (sem sessão de usuário)
export function createSystemServices(): {
  conversationService: ConversationService
  messageService:      MessageService
} {
  const convRepo    = new ConversationRepository(supabaseService)
  const msgRepo     = new MessageRepository(supabaseService)
  const contactRepo = new ContactRepository(supabaseService)
  const auditRepo   = new AuditRepository(supabaseService)

  return {
    conversationService: new ConversationService(
      convRepo,
      auditRepo,
      caEventBus
    ),
    messageService: new MessageService(
      msgRepo,
      convRepo,
      contactRepo,
      auditRepo,
      caEventBus,
      providerFactory,
      supabaseService
    ),
  }
}

export function createContactService(userClient: SupabaseClient): ContactService {
  return new ContactService(
    new ContactRepository(userClient),
    new AuditRepository(supabaseService),   // sempre service role
  )
}

// Exportar para permitir que Sprint 2 registre providers no bootstrap
export { providerFactory }

// Re-exports das classes para uso em testes e composição avançada
export { ConversationService } from './conversation.service'
export { MessageService }      from './message.service'
export { ContactService }      from './contact.service'
