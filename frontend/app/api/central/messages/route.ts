import type { NextRequest }         from 'next/server'
import { extractUser }              from '@/lib/central/auth'
import { mapCentralError }          from '@/lib/central/errors'
import { ok, created, badRequest }  from '@/lib/central/response'
import {
  parseListMessagesQuery,
  parseSendMessageBody,
} from '@/modules/atendimento/dto/message.dto'
import { createMessageService } from '@/modules/atendimento/services'

// GET /api/central/messages?conversationId=<uuid>&before=<ISO>&limit=50
// Paginação por cursor em created_at (DESC). Para scroll infinito:
//   nextCursor = created_at da mensagem mais antiga do batch.
//   Próxima request: ?before=<nextCursor>
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await extractUser()

    const parsed = parseListMessagesQuery(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { conversationId, before, limit } = parsed.data

    const service  = createMessageService(supabase)
    const messages = await service.list({ conversationId, before, limit })

    // Cursor = created_at da mensagem mais antiga — frontend passa como ?before= na próxima req
    const nextCursor = messages.at(-1)?.created_at

    return ok(messages, {
      limit,
      hasMore:    messages.length === limit,
      nextCursor: nextCursor ?? undefined,
    })
  } catch (err) {
    return mapCentralError(err)
  }
}

// POST /api/central/messages
// Envia mensagem outbound via provider.
// Só persiste após confirmação do provider (MessageService.send).
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const body   = await request.json().catch(() => null)
    const parsed = parseSendMessageBody(body)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { conversationId, body: text, messageType, replyToMessageId } = parsed.data

    const service = createMessageService(supabase)
    const message = await service.send({
      conversationId,
      body:              text,
      messageType,
      sentByUserId:      user.id,
      replyToMessageId,
    })

    return created(message)
  } catch (err) {
    return mapCentralError(err)
  }
}
