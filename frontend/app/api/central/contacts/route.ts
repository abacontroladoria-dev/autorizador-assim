import type { NextRequest }         from 'next/server'
import { extractUser }              from '@/lib/central/auth'
import { mapCentralError }          from '@/lib/central/errors'
import { ok, created, badRequest }  from '@/lib/central/response'
import {
  parseListContactsQuery,
  parseCreateContactBody,
} from '@/modules/atendimento/dto/contact.dto'
import { createContactService } from '@/modules/atendimento/services'

// GET /api/central/contacts
// Busca de contatos com filtros de texto e tipo.
// Paginação offset para listas — não é hot path de mensageria.
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const parsed = parseListContactsQuery(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { search, phone, contactType, limit, offset } = parsed.data

    const service = createContactService(supabase)
    const result  = await service.search({
      orgId: user.orgId,
      search,
      phone,
      contactType,
      limit,
      offset,
    })

    return ok(result.data, {
      total:   result.count,
      limit,
      offset,
      hasMore: offset + result.data.length < result.count,
    })
  } catch (err) {
    return mapCentralError(err)
  }
}

// POST /api/central/contacts
// Cria novo contato com identificadores opcionais.
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const body   = await request.json().catch(() => null)
    const parsed = parseCreateContactBody(body)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const service = createContactService(supabase)
    const contact = await service.create(user.orgId, {
      name:         parsed.data.name,
      displayPhone: parsed.data.displayPhone,
      displayEmail: parsed.data.displayEmail,
      contactType:  parsed.data.contactType,
      source:       parsed.data.source,
      identifiers:  parsed.data.identifiers,
    }, user.id)

    return created(contact)
  } catch (err) {
    return mapCentralError(err)
  }
}
