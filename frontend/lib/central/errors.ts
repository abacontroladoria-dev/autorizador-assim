import { NextResponse } from 'next/server'
import {
  CentralError,
  UnauthenticatedError,
  UnauthorizedError,
  ConversationNotFoundError,
  ContactNotFoundError,
  ChannelNotFoundError,
  ConversationAlreadyClosedError,
  MissingContactPhoneError,
  ProviderError,
  ProviderNotImplementedError,
  AppointmentNotFoundError,
  SlotNotInGradeError,
  SlotAlreadyBookedError,
  SlotInPastError,
  TtsNotConfiguredError,
  TtsProviderError,
} from '@/modules/atendimento/types/errors.types'
import {
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  badGateway,
  serviceUnavailable,
  internalError,
} from './response'

// Mapeia erros de domínio para respostas HTTP tipadas.
// Nunca expõe stack traces ao cliente — erros inesperados são logados internamente.
export function mapCentralError(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError)        return unauthorized(err.message)
  if (err instanceof ConversationNotFoundError)   return notFound(err.code, err.message)
  if (err instanceof ContactNotFoundError)        return notFound(err.code, err.message)
  if (err instanceof ChannelNotFoundError)        return notFound(err.code, err.message)
  if (err instanceof AppointmentNotFoundError)    return notFound(err.code, err.message)
  if (err instanceof ConversationAlreadyClosedError) return conflict(err.code, err.message)
  // 409: a vaga existia e foi tomada — retentar com outro horário resolve.
  if (err instanceof SlotAlreadyBookedError)      return conflict(err.code, err.message)
  // 422: o pedido é bem-formado mas inviável — a vaga não existe na grade
  // ou está no passado. Retentar igual nunca resolve.
  if (err instanceof SlotNotInGradeError)         return unprocessable(err.code, err.message)
  if (err instanceof SlotInPastError)             return unprocessable(err.code, err.message)
  if (err instanceof MissingContactPhoneError)    return unprocessable(err.code, err.message)
  // 422: falta configuração nossa — nada foi tentado contra a ElevenLabs.
  if (err instanceof TtsNotConfiguredError)       return unprocessable(err.code, err.message)
  // 502: a ElevenLabs respondeu recusando. A mensagem repassada é a dela —
  // é a única que diz se o problema é a chave, a voz ou a cota. O código é
  // separado por causa da ação que cada um pede: trocar credencial, esperar o
  // ciclo da cota, ou nenhuma das duas.
  if (err instanceof TtsProviderError) {
    const code = err.cotaEsgotada   ? 'TTS_QUOTA_EXCEEDED'
               : err.chaveRejeitada ? 'TTS_KEY_REJECTED'
               : err.code
    return badGateway(code, err.message)
  }
  if (err instanceof ProviderError)               return badGateway(err.code, err.message)
  if (err instanceof ProviderNotImplementedError) return serviceUnavailable(err.code, err.message)
  if (err instanceof UnauthorizedError)           return forbidden(err.message)

  if (err instanceof CentralError) {
    console.error('[Central API] CentralError não mapeado', {
      code:    err.code,
      message: err.message,
      context: err.context,
    })
  } else {
    console.error('[Central API] Erro inesperado', err)
  }

  return internalError()
}
