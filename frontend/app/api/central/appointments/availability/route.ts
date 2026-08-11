import type { NextRequest }       from 'next/server'
import { extractUser }            from '@/lib/central/auth'
import { mapCentralError }        from '@/lib/central/errors'
import { ok, badRequest }         from '@/lib/central/response'
import { parseListAvailabilityQuery } from '@/modules/atendimento/dto/appointment.dto'
import { createAppointmentService }   from '@/modules/atendimento/services'

// GET /api/central/appointments/availability
//
// Vagas que a clínica pode de fato oferecer: a grade real do TiTa
// (status_agendamento = 'Livre') menos o que já prometemos em
// central.appointments, menos o passado. A subtração acontece em
// central.listar_vagas_disponiveis — ver 20260810100100 para o porquê.
//
// Sem filtro de data a janela é hoje..hoje+30 (default da própria RPC). Pedir
// mais que isso não devolve mais vaga: a grade só é populada algumas semanas à
// frente.
//
// agrupar=terapia devolve o resumo por especialidade — é o que responde
// "quais terapias vocês têm disponíveis?" sem despejar centenas de horários.
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await extractUser()

    const parsed = parseListAvailabilityQuery(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join('; '))

    const { dataInicio, dataFim, terapiaId, profissionalId, unidadeId, limite, agrupar } = parsed.data

    const service = createAppointmentService(supabase)

    if (agrupar === 'terapia') {
      const terapias = await service.listarTerapiasComVaga(dataInicio, dataFim)
      return ok(terapias)
    }

    const vagas = await service.listarVagas({
      dataInicio, dataFim, terapiaId, profissionalId, unidadeId, limite,
    })

    return ok(vagas, { limit: limite, hasMore: vagas.length === limite })
  } catch (err) {
    return mapCentralError(err)
  }
}
