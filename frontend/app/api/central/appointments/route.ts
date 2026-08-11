import type { NextRequest }        from 'next/server'
import { extractUser }             from '@/lib/central/auth'
import { mapCentralError }         from '@/lib/central/errors'
import { ok, created, badRequest } from '@/lib/central/response'
import {
  parseListAppointmentsQuery,
  parseCreateAppointmentBody,
} from '@/modules/atendimento/dto/appointment.dto'
import { createAppointmentService } from '@/modules/atendimento/services'

// GET /api/central/appointments
// Janela de agendamentos para o calendário.
// Paginação offset com teto de 500: a visão de mês precisa do mês inteiro de
// uma vez, senão a grade renderiza dias incompletos.
export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const parsed = parseListAppointmentsQuery(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { from, to, status, contactId, type, includeCancelled, limit, offset } = parsed.data

    const service = createAppointmentService(supabase)
    const result  = await service.list({
      orgId: user.orgId,
      from, to, status, contactId, type, includeCancelled, limit, offset,
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

// POST /api/central/appointments
//
// Duas formas, distinguidas por profissionalId:
//   com profissionalId → reserva vaga real da grade. Valida contra
//     central.listar_vagas_disponiveis e pode falhar com 409 (vaga tomada),
//     422 (vaga não existe na grade / está no passado).
//   sem profissionalId → agendamento administrativo (reunião, followup).
//     Não consome vaga e fica fora da guarda uq_appointments_slot_ocupada.
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await extractUser()

    const body   = await request.json().catch(() => null)
    const parsed = parseCreateAppointmentBody(body)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const d       = parsed.data
    const service = createAppointmentService(supabase)

    // Reserva de vaga real da grade
    if (d.profissionalId != null && d.hora) {
      const appointment = await service.agendarVaga(user.orgId, {
        profissionalId:  d.profissionalId,
        data:            d.data,
        hora:            d.hora,
        titulo:          d.titulo,
        descricao:       d.descricao,
        tipo:            d.tipo,
        duracao:         d.duracao,
        contactId:       d.contactId,
        conversationId:  d.conversationId,
        titaPacienteId:  d.titaPacienteId,
        participantes:   d.participantes,
        criadoPorIa:     false,   // criado por operador nesta rota
      }, user.id)

      return created(appointment)
    }

    // Agendamento administrativo
    const appointment = await service.criarAdministrativo(user.orgId, {
      titulo:         d.titulo!,   // DTO garante presença quando não há profissionalId
      data:           d.data,
      hora:           d.hora,
      duracao:        d.duracao,
      tipo:           d.tipo,
      descricao:      d.descricao,
      contactId:      d.contactId,
      conversationId: d.conversationId,
      participantes:  d.participantes,
      criadoPorIa:    false,
    }, user.id)

    return created(appointment)
  } catch (err) {
    return mapCentralError(err)
  }
}
