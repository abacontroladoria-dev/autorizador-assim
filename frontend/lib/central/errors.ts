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
  if (err instanceof ConversationAlreadyClosedError) return conflict(err.code, err.message)
  if (err instanceof MissingContactPhoneError)    return unprocessable(err.code, err.message)
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
