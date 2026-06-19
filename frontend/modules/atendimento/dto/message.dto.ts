type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID    = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const isISODate = (v: unknown): v is string => typeof v === 'string' && !isNaN(new Date(v).getTime())

const VALID_MESSAGE_TYPES = ['text', 'image', 'audio', 'video', 'document'] as const
export type MessageType = typeof VALID_MESSAGE_TYPES[number]

// ----------------------------------------------------------------------------
// List messages (cursor pagination — chat scroll infinito)
// ----------------------------------------------------------------------------

export interface ListMessagesQuery {
  conversationId: string
  before?:        string   // ISO datetime — carrega mensagens ANTES deste timestamp
  limit:          number
}

export function parseListMessagesQuery(p: URLSearchParams): ParseResult<ListMessagesQuery> {
  const errors: string[] = []

  const conversationId = p.get('conversationId') ?? ''
  if (!isUUID(conversationId)) errors.push('conversationId é obrigatório (UUID)')

  const before = p.get('before') ?? undefined
  if (before !== undefined && !isISODate(before)) errors.push('before deve ser uma data ISO válida')

  const limit = clampInt(p.get('limit'), 1, 100, 50)

  if (errors.length) return { ok: false, errors }
  return { ok: true, data: { conversationId, before, limit } }
}

// ----------------------------------------------------------------------------
// Send message
// ----------------------------------------------------------------------------

export interface SendMessageBody {
  conversationId:   string
  body:             string
  messageType:      MessageType
  replyToMessageId?: string
}

export function parseSendMessageBody(body: unknown): ParseResult<SendMessageBody> {
  const errors: string[] = []
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Body inválido'] }
  const b = body as Record<string, unknown>

  if (!isUUID(b.conversationId)) errors.push('conversationId é obrigatório (UUID)')

  if (typeof b.body !== 'string' || b.body.trim().length === 0) {
    errors.push('body é obrigatório')
  } else if (b.body.length > 4096) {
    errors.push('body excede 4096 caracteres')
  }

  const messageType = (b.messageType ?? 'text') as string
  if (!VALID_MESSAGE_TYPES.includes(messageType as MessageType)) {
    errors.push(`messageType deve ser: ${VALID_MESSAGE_TYPES.join(', ')}`)
  }

  if (b.replyToMessageId !== undefined && !isUUID(b.replyToMessageId)) {
    errors.push('replyToMessageId deve ser um UUID válido')
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    data: {
      conversationId:   b.conversationId   as string,
      body:             (b.body as string).trim(),
      messageType:      messageType        as MessageType,
      replyToMessageId: b.replyToMessageId as string | undefined,
    },
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback
  const n = parseInt(raw, 10)
  return isNaN(n) ? fallback : Math.min(max, Math.max(min, n))
}
