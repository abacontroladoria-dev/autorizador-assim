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
import { AppointmentRepository }  from '../repositories/appointment.repository'
import { AvailabilityRepository } from '../repositories/availability.repository'
import { AgentSettingsRepository }    from '../repositories/agent-settings.repository'
import { AgentCredentialsRepository } from '../repositories/agent-credentials.repository'

import { ConversationService }  from './conversation.service'
import { MessageService }       from './message.service'
import { ContactService }       from './contact.service'
import { AppointmentService }   from './appointment.service'
import { AgentSettingsService } from './agent-settings.service'

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

// createAppointmentService(userClient):
//   Para as rotas da página de Agendamentos — RLS do usuário aplicada.
//
// createAppointmentSystemService():
//   Para o agente de IA e workers de WhatsApp, que não têm sessão de usuário.
//   Usa service role, então a RLS de central.appointments não se aplica: a
//   restrição de organização passa a ser responsabilidade do caller, que
//   sempre informa orgId explicitamente ao service.
export function createAppointmentService(userClient: SupabaseClient): AppointmentService {
  return new AppointmentService(
    new AppointmentRepository(userClient),
    new AvailabilityRepository(userClient),
    new AuditRepository(supabaseService),   // sempre service role
  )
}

export function createAppointmentSystemService(): AppointmentService {
  return new AppointmentService(
    new AppointmentRepository(supabaseService),
    new AvailabilityRepository(supabaseService),
    new AuditRepository(supabaseService),
  )
}

// createAgentSettingsService(userClient):
//   Para a tela de configuração. A RLS de central.agent_settings restringe
//   leitura e escrita a central_role = 'admin', então a permissão é imposta
//   pelo banco, não só pela rota.
//
//   AgentCredentialsRepository recebe service role obrigatoriamente: a migration
//   20260810120300 tirou de `authenticated` o privilégio de LER
//   elevenlabs_api_key (mantendo o de gravá-la). Com o cliente do usuário, a
//   leitura da chave responderia 403 — que é a proteção funcionando.
//
// createAgentSettingsSystemService():
//   Para o worker de envio de áudio, que precisa dos parâmetros de voz sem
//   sessão de usuário. Usa service role em tudo: a organização passa a ser
//   responsabilidade do caller, que sempre informa orgId.
export function createAgentSettingsService(userClient: SupabaseClient): AgentSettingsService {
  return new AgentSettingsService(
    new AgentSettingsRepository(userClient),
    new AgentCredentialsRepository(supabaseService),  // credencial: só service role
    new AuditRepository(supabaseService),             // sempre service role
  )
}

export function createAgentSettingsSystemService(): AgentSettingsService {
  return new AgentSettingsService(
    new AgentSettingsRepository(supabaseService),
    new AgentCredentialsRepository(supabaseService),
    new AuditRepository(supabaseService),
  )
}

// Exportar para permitir que Sprint 2 registre providers no bootstrap
export { providerFactory }

// Re-exports das classes para uso em testes e composição avançada
export { ConversationService }  from './conversation.service'
export { MessageService }       from './message.service'
export { ContactService }       from './contact.service'
export { AppointmentService }   from './appointment.service'
export { AgentSettingsService } from './agent-settings.service'
