import type { NextRequest } from 'next/server'
import { extractUser }     from '@/lib/central/auth'
import { mapCentralError } from '@/lib/central/errors'
import { ok }              from '@/lib/central/response'

// GET /api/central/inboxes
// Lista as inboxes das quais o usuário autenticado é membro.
// Usa INNER JOIN via PostgREST (!inner) para filtrar apenas inboxes com
// vínculo ativo — equivalente a: WHERE inbox_members.user_id = :userId.
export async function GET(_request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const { data, error } = await (supabase as any)
      .schema('central')
      .from('inboxes')
      .select('id, name, description, created_at, members:inbox_members!inner(role)')
      .eq('organization_id', user.orgId)
      .eq('inbox_members.user_id', user.id)
      .order('name')

    if (error) throw error

    // Achata o role para o nível do inbox (user só pode ter um role por inbox)
    const inboxes = ((data ?? []) as any[]).map(i => ({
      id:          i.id,
      name:        i.name,
      description: i.description,
      created_at:  i.created_at,
      role:        i.members?.[0]?.role ?? null,
    }))

    return ok(inboxes)
  } catch (err) {
    return mapCentralError(err)
  }
}
