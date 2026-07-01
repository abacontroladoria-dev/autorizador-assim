import type { NextRequest } from 'next/server'
import { extractUser }     from '@/lib/central/auth'
import { mapCentralError } from '@/lib/central/errors'
import { ok, badRequest }  from '@/lib/central/response'
import { parseSearchQuery } from '@/modules/atendimento/dto/search.dto'
import type { Conversation } from '@/modules/atendimento/types/central.types'
import {
  createContactService,
  createConversationService,
} from '@/modules/atendimento/services'

// GET /api/central/search?q=joao&type=all&limit=10
// Busca unificada: contatos por nome/telefone + conversas ativas dos contatos encontrados.
//
// Fluxo para type=all:
//   1. Busca contatos por ILIKE (name + phone) → até 20 resultados
//   2. Com os IDs encontrados, busca conversas ativas → até `limit` resultados
// Latência alvo: < 300ms (duas queries indexadas em paralelo onde possível).
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const parsed = parseSearchQuery(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { q, type, limit } = parsed.data

    const contactService = createContactService(supabase)
    const convService    = createConversationService(supabase)

    const includeContacts     = type === 'contacts'     || type === 'all'
    const includeConversations = type === 'conversations' || type === 'all'

    // Sempre busca contatos — necessário para derivar conversas mesmo em type=conversations
    const contactResult = await contactService.search({
      orgId:  user.orgId,
      search: q,
      limit:  includeConversations ? Math.max(20, limit) : limit,
      offset: 0,
    })

    const contacts = contactResult.data

    // Busca conversas ativas dos contatos encontrados
    let conversations: Conversation[] = []
    if (includeConversations && contacts.length > 0) {
      const contactIds = contacts.map(c => c.id)
      conversations = await convService.listByContactIds(user.orgId, contactIds, limit)
    }

    return ok({
      contacts:      includeContacts ? contacts.slice(0, limit) : [],
      conversations: includeConversations ? conversations : [],
    })
  } catch (err) {
    return mapCentralError(err)
  }
}
