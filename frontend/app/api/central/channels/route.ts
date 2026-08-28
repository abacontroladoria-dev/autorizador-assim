import type { NextRequest } from 'next/server'
import { extractUser }     from '@/lib/central/auth'
import { mapCentralError } from '@/lib/central/errors'
import { ok }              from '@/lib/central/response'

// GET /api/central/channels
// Lista canais ativos da organização.
// Usado pelo workspace para exibir canais disponíveis.
// ChannelRepository implementado no Sprint 2 — query direta por ora.
export async function GET(_request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const { data, error } = await (supabase as any)
      .schema('central')
      .from('channels')
      .select('id, name, provider, channel_type, status, active, created_at')
      .eq('organization_id', user.orgId)
      .eq('active', true)
      .eq('status', 'active')
      .order('name')

    if (error) throw error
    return ok(data ?? [])
  } catch (err) {
    return mapCentralError(err)
  }
}
