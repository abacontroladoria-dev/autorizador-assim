// ============================================================================
// Central de Atendimento — Domain Errors
//
// Hierarquia de erros tipados para a camada de serviços.
// Route Handlers e Server Actions capturam estes erros e mapeiam para
// respostas HTTP ou mensagens de UI — nunca expõem stack traces.
//
// Uso:
//   throw new ConversationNotFoundError(id)
//   catch (err) {
//     if (err instanceof ConversationNotFoundError) → 404
//     if (err instanceof ProviderError)             → 502
//     if (err instanceof UnauthorizedError)         → 403
//   }
// ============================================================================

export class CentralError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    // Mantém stack trace correto em subclasses no V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

// ----------------------------------------------------------------------------
// Conversation
// ----------------------------------------------------------------------------

export class ConversationNotFoundError extends CentralError {
  constructor(id: string) {
    super(`Conversa ${id} não encontrada`, 'CONVERSATION_NOT_FOUND', { id })
  }
}

// Disparado ao tentar operar em conversa já resolvida ou arquivada.
// reopen() NÃO usa este erro — é idempotente.
export class ConversationAlreadyClosedError extends CentralError {
  constructor(id: string, currentStatus: string) {
    super(
      `Conversa ${id} já está ${currentStatus} e não pode ser modificada`,
      'CONVERSATION_ALREADY_CLOSED',
      { id, currentStatus }
    )
  }
}

// ----------------------------------------------------------------------------
// Message
// ----------------------------------------------------------------------------

// Disparado quando external_message_id já existe no banco (idempotência).
// MessageService.receive() retorna a mensagem existente em vez de lançar.
// Disponível para callers externos que precisam inspecionar a condição.
export class DuplicateMessageError extends CentralError {
  constructor(externalId: string, provider: string) {
    super(
      `Mensagem ${externalId} do provider ${provider} já foi processada`,
      'DUPLICATE_MESSAGE',
      { externalId, provider }
    )
  }
}

// ----------------------------------------------------------------------------
// Contact
// ----------------------------------------------------------------------------

export class ContactNotFoundError extends CentralError {
  constructor(identifier: string) {
    super(`Contato não encontrado: ${identifier}`, 'CONTACT_NOT_FOUND', { identifier })
  }
}

export class MissingContactPhoneError extends CentralError {
  constructor(contactId: string) {
    super(
      `Contato ${contactId} não possui telefone cadastrado para envio de mensagem`,
      'MISSING_CONTACT_PHONE',
      { contactId }
    )
  }
}

// ----------------------------------------------------------------------------
// Channel
// ----------------------------------------------------------------------------

export class ChannelNotFoundError extends CentralError {
  constructor(id: string) {
    super(`Canal ${id} não encontrado`, 'CHANNEL_NOT_FOUND', { id })
  }
}

// ----------------------------------------------------------------------------
// Provider
// ----------------------------------------------------------------------------

// Erro de comunicação com o provider externo (Evolution API, Meta WABA, etc).
// Mensagem NÃO é persistida quando este erro é lançado — o provider não confirmou.
export class ProviderError extends CentralError {
  constructor(
    public readonly provider: string,
    public readonly originalError: unknown,
    public readonly externalRef?: string
  ) {
    const cause =
      originalError instanceof Error
        ? originalError.message
        : String(originalError)
    super(
      `Erro no provider ${provider}: ${cause}`,
      'PROVIDER_ERROR',
      { provider, externalRef, cause }
    )
  }
}

// Lançado pelo ProviderFactory quando o provider ainda não foi implementado.
// Esperado durante Sprint 1 — providers são implementados no Sprint 2.
export class ProviderNotImplementedError extends CentralError {
  constructor(providerType: string) {
    super(
      `Provider ${providerType} ainda não implementado`,
      'PROVIDER_NOT_IMPLEMENTED',
      { providerType }
    )
  }
}

// ----------------------------------------------------------------------------
// Authorization
// ----------------------------------------------------------------------------

// 401 — sem sessão válida ou token expirado.
// Lançado por extractUser() quando não há JWT válido.
export class UnauthenticatedError extends CentralError {
  constructor(reason = 'Sessão inválida ou expirada') {
    super(reason, 'UNAUTHENTICATED')
  }
}

// 403 — usuário autenticado mas sem permissão para a operação.
export class UnauthorizedError extends CentralError {
  constructor(reason: string) {
    super(reason, 'UNAUTHORIZED')
  }
}
