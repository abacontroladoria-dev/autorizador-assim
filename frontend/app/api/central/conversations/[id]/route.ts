import type { NextRequest }        from 'next/server'
import { extractUser }             from '@/lib/central/auth'
import { mapCentralError }         from '@/lib/central/errors'
import { ok, noContent, badRequest, forbidden } from '@/lib/central/response'
import { parsePatchConversationBody } from '@/modules/atendimento/dto/conversation.dto'
import {
  createConversationService,
  createMessageService,
  createContactService,
} from '@/modules/atendimento/services'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/central/conversations/[id]
// Retorna conversa enriquecida com contato, canal, inbox e últimas 20 mensagens.
export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const convService    = createConversationService(supabase)
    const msgService     = createMessageService(supabase)
    const contactService = createContactService(supabase)

    const conversation = await convService.getById(id)

    // Garante que a conversa pertence à org do usuário (RLS + check explícito)
    if (conversation.organization_id !== user.orgId) return forbidden()

    // Carrega dados relacionados em paralelo
    const [contact, channelResult, inboxResult, messages] = await Promise.all([
      contactService.getById(user.orgId, conversation.contact_id).catch(() => null),

      (supabase as any)
        .schema('central')
        .from('channels')
        .select('id, name, provider, channel_type, status')
        .eq('id', conversation.channel_id)
        .maybeSingle(),

      (supabase as any)
        .schema('central')
        .from('inboxes')
        .select('id, name, description')
        .eq('id', conversation.inbox_id)
        .maybeSingle(),

      msgService.list({ conversationId: id, limit: 20 }),
    ])

    return ok({
      ...conversation,
      contact:        contact ?? null,
      channel:        channelResult.data  ?? null,
      inbox:          inboxResult.data    ?? null,
      recentMessages: messages,
    })
  } catch (err) {
    return mapCentralError(err)
  }
}

// PATCH /api/central/conversations/[id]
// Executa uma ação de ciclo de vida na conversa.
// Payload: { action: 'assign'|'transfer'|'resolve'|'archive'|'reopen', ...campos por action }
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const body   = await request.json().catch(() => null)
    const parsed = parsePatchConversationBody(body)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const service = createConversationService(supabase)
    const { action } = parsed.data

    switch (action) {
      case 'assign':
        await service.assign(id, parsed.data.toUserId, user.id)
        break
      case 'transfer':
        await service.transfer({
          conversationId: id,
          toUserId:       parsed.data.toUserId,
          actorId:        user.id,
          reason:         parsed.data.reason,
        })
        break
      case 'resolve':
        await service.resolve(id, user.id)
        break
      case 'archive':
        await service.archive(id, user.id)
        break
      case 'reopen':
        await service.reopen(id, user.id)
        break
    }

    return noContent()
  } catch (err) {
    return mapCentralError(err)
  }
}
