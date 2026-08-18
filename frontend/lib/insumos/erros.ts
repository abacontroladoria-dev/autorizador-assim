import { NextResponse } from "next/server"
// Os helpers de resposta são HTTP puro (ok/created/badRequest/…), sem nada
// específico da Central. Importados em vez de copiados de propósito: uma cópia
// divergente desses status é exatamente o tipo de duplicação que este projeto
// já pagou caro (ver o CASE do TUSS em duas cópias). Se um terceiro módulo
// precisar, aí sim vale mover para lib/http/.
import {
  badRequest,
  conflict,
  forbidden,
  internalError,
  notFound,
  unauthorized,
  unprocessable,
} from "@/lib/central/response"

// ----------------------------------------------------------------------------
// Erros de domínio do módulo de insumos.
//
// No AXIUM isto eram as exceções do Nest (BadRequestException, ForbiddenException,
// NotFoundException), que o framework traduzia em HTTP sozinho. Em route handler
// do Next não há esse tradutor, então o domínio levanta estas classes e
// `mapInsumosError` faz a tradução num lugar só.
// ----------------------------------------------------------------------------

export class InsumosError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NaoAutenticadoError extends InsumosError {
  constructor(message = "Sessão inválida ou expirada") {
    super("UNAUTHENTICATED", message)
  }
}

/** Autenticado, mas sem vínculo com nenhuma empresa — ou com a empresa pedida. */
export class SemEmpresaError extends InsumosError {
  constructor(message = "Usuário sem acesso a nenhuma empresa no módulo de insumos") {
    super("SEM_EMPRESA", message)
  }
}

export class SolicitacaoNaoEncontradaError extends InsumosError {
  constructor(message = "Solicitação não encontrada.") {
    super("SOLICITACAO_NAO_ENCONTRADA", message)
  }
}

/** Transição de status inválida, edição de solicitação travada, etc. */
export class TransicaoInvalidaError extends InsumosError {
  constructor(message: string) {
    super("TRANSICAO_INVALIDA", message)
  }
}

export class ValidacaoError extends InsumosError {
  constructor(message: string, readonly campo?: string) {
    super("VALIDATION_ERROR", message)
  }
}

// ----------------------------------------------------------------------------
// Erros vindos do Postgres.
//
// As RPCs de 20260818090000 sinalizam por SQLSTATE em vez de texto: `no_data_found`
// (P0002) para "não encontrada" e `check_violation` (23514) para regra de negócio
// violada. Traduzir pelo código, e não pela mensagem, evita que um ajuste de
// texto em português quebre o status HTTP calado.
// ----------------------------------------------------------------------------

type PostgrestLikeError = { code?: string; message?: string }

function ehErroPostgrest(err: unknown): err is PostgrestLikeError {
  return typeof err === "object" && err !== null && "message" in err
}

/**
 * Converte o erro do supabase-js em erro de domínio. Chame logo após cada
 * `.rpc()`/`.from()` — o supabase-js NÃO lança, devolve `{ data, error }`, e
 * ignorar isso é a forma silenciosa de perder falha de escrita.
 */
export function traduzirErroDoBanco(err: PostgrestLikeError): InsumosError {
  switch (err.code) {
    case "P0002": // no_data_found
      return new SolicitacaoNaoEncontradaError(err.message)
    case "23514": // check_violation — regra de negócio das RPCs e dos CHECK
      return new TransicaoInvalidaError(err.message ?? "Operação não permitida.")
    case "23505": // unique_violation
      return new TransicaoInvalidaError(err.message ?? "Registro duplicado.")
    case "42501": // insufficient_privilege — RLS barrou a escrita
      return new SemEmpresaError("Sem permissão para esta empresa.")
    default:
      return new InsumosError("DB_ERROR", err.message ?? "Erro no banco de dados")
  }
}

export function mapInsumosError(err: unknown): NextResponse {
  if (err instanceof NaoAutenticadoError) return unauthorized(err.message)
  if (err instanceof SemEmpresaError) return forbidden(err.message)
  if (err instanceof SolicitacaoNaoEncontradaError) return notFound(err.code, err.message)
  if (err instanceof TransicaoInvalidaError) return conflict(err.code, err.message)
  if (err instanceof ValidacaoError) return badRequest(err.message, err.campo)

  if (err instanceof InsumosError) {
    console.error("[Insumos API] InsumosError não mapeado", {
      code: err.code,
      message: err.message,
      context: err.context,
    })
    return unprocessable(err.code, err.message)
  }

  // Erro cru do supabase-js que escapou de traduzirErroDoBanco.
  if (ehErroPostgrest(err) && err.code) {
    return mapInsumosError(traduzirErroDoBanco(err))
  }

  console.error("[Insumos API] Erro inesperado", err)
  return internalError()
}
