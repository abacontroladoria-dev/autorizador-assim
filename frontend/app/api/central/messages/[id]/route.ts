import type { NextRequest } from 'next/server'
import { extractUser }     from '@/lib/central/auth'
import { mapCentralError } from '@/lib/central/errors'
import { noContent }       from '@/lib/central/response'
import { createMessageService } from '@/modules/atendimento/services'

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/central/messages/[id]
// Soft delete — mensagem apagada pelo operador ou pelo contato via WhatsApp.
// Idempotente: retorna 204 mesmo se a mensagem já foi deletada ou não existir.
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const service = createMessageService(supabase)
    await service.softDelete(id, user.id)

    return noContent()
  } catch (err) {
    return mapCentralError(err)
  }
}
