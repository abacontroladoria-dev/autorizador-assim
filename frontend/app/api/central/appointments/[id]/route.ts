import type { NextRequest }       from 'next/server'
import { extractUser }            from '@/lib/central/auth'
import { mapCentralError }        from '@/lib/central/errors'
import { ok, badRequest, forbidden } from '@/lib/central/response'
import { parseUpdateAppointmentBody } from '@/modules/atendimento/dto/appointment.dto'
import { createAppointmentService }   from '@/modules/atendimento/services'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/central/appointments/[id]
export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const service     = createAppointmentService(supabase)
    const appointment = await service.getById(user.orgId, id)

    return ok(appointment)
  } catch (err) {
    return mapCentralError(err)
  }
}

// PATCH /api/central/appointments/[id]
//
// Mudar data/hora de uma reserva de vaga vira reagendamento dentro do service:
// ele revalida a vaga nova na grade antes de liberar a antiga. Passar
// profissionalId reagenda para outro profissional.
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const body   = await request.json().catch(() => null)
    const parsed = parseUpdateAppointmentBody(body)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const d       = parsed.data
    const service = createAppointmentService(supabase)

    // Reagendamento explícito para outro profissional
    if (d.profissionalId != null && d.data && d.hora) {
      const novo = await service.reagendar(
        user.orgId,
        id,
        { profissionalId: d.profissionalId, data: d.data, hora: d.hora },
        user.id,
        d.motivo,
      )
      return ok(novo)
    }

    const appointment = await service.atualizar(user.orgId, id, {
      titulo:        d.titulo,
      descricao:     d.descricao,
      data:          d.data,
      hora:          d.hora,
      duracao:       d.duracao,
      tipo:          d.tipo,
      status:        d.status,
      participantes: d.participantes,
      titaSessionId: d.titaSessionId,
    }, user.id)

    return ok(appointment)
  } catch (err) {
    return mapCentralError(err)
  }
}

// DELETE /api/central/appointments/[id]
//
// Por padrão CANCELA (status = 'cancelled'), não apaga: isso devolve a vaga à
// grade — o predicado de uq_appointments_slot_ocupada exclui 'cancelled' — e
// preserva o rastro de que alguém desmarcou.
//
// ?hard=true faz DELETE físico e é restrito a admin, para limpar lixo.
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { user, supabase } = await extractUser()
    const { id } = await ctx.params

    const service = createAppointmentService(supabase)
    const hard    = request.nextUrl.searchParams.get('hard') === 'true'
    const motivo  = request.nextUrl.searchParams.get('motivo')

    if (hard) {
      if (user.centralRole !== 'admin') {
        return forbidden('Exclusão definitiva de agendamento é restrita a admin')
      }
      await service.remover(user.orgId, id, user.id)
      return ok({ id, removido: true })
    }

    const cancelado = await service.cancelar(user.orgId, id, user.id, motivo)
    return ok(cancelado)
  } catch (err) {
    return mapCentralError(err)
  }
}
