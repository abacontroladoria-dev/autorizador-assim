import type { AppointmentStatus, AppointmentType } from '../types/central.types'

type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }

// 'YYYY-MM-DD'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// 'HH:MM' ou 'HH:MM:SS'
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const VALID_TYPES: AppointmentType[] = ['triagem', 'retorno', 'reuniao', 'followup', 'demo', 'other']
const VALID_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show']

// ----------------------------------------------------------------------------
// GET /api/central/appointments — janela do calendário
// ----------------------------------------------------------------------------

export interface ListAppointmentsQuery {
  from?:             string
  to?:               string
  status?:           AppointmentStatus[]
  contactId?:        string
  type?:             AppointmentType
  includeCancelled:  boolean
  limit:             number
  offset:            number
}

export function parseListAppointmentsQuery(p: URLSearchParams): ParseResult<ListAppointmentsQuery> {
  const errors: string[] = []

  const from = p.get('from') ?? undefined
  const to   = p.get('to')   ?? undefined
  if (from !== undefined && !DATE_RE.test(from)) errors.push('from deve estar no formato YYYY-MM-DD')
  if (to   !== undefined && !DATE_RE.test(to))   errors.push('to deve estar no formato YYYY-MM-DD')
  if (from && to && from > to)                   errors.push('from não pode ser posterior a to')

  const statusRaw = p.get('status') ?? undefined
  let status: AppointmentStatus[] | undefined
  if (statusRaw !== undefined) {
    const lista = statusRaw.split(',').map(s => s.trim()).filter(Boolean)
    const invalidos = lista.filter(s => !VALID_STATUSES.includes(s as AppointmentStatus))
    if (invalidos.length) errors.push(`status inválido: ${invalidos.join(', ')}. Valores: ${VALID_STATUSES.join(', ')}`)
    else status = lista as AppointmentStatus[]
  }

  const typeRaw = p.get('type') ?? undefined
  let type: AppointmentType | undefined
  if (typeRaw !== undefined) {
    if (!VALID_TYPES.includes(typeRaw as AppointmentType)) errors.push(`type inválido: ${typeRaw}`)
    else type = typeRaw as AppointmentType
  }

  const contactId = p.get('contactId') ?? undefined

  // Teto de 500: o calendário mensal precisa de todos os agendamentos do mês de
  // uma vez — paginar por 50 faria a grade renderizar incompleta.
  const limit  = clampInt(p.get('limit'),  1, 500, 200)
  const offset = clampInt(p.get('offset'), 0, Infinity, 0)

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    data: {
      from, to, status, contactId, type,
      includeCancelled: p.get('includeCancelled') === 'true',
      limit, offset,
    },
  }
}

// ----------------------------------------------------------------------------
// POST /api/central/appointments
//
// Duas formas no mesmo endpoint, distinguidas por profissionalId:
//   com profissionalId → reserva de vaga real da grade (valida disponibilidade)
//   sem profissionalId → agendamento administrativo (não consome vaga)
// ----------------------------------------------------------------------------

export interface CreateAppointmentBody {
  // Reserva de vaga
  profissionalId?:  number
  // Comum
  data:             string
  hora?:            string
  titulo?:          string
  descricao?:       string
  tipo?:            AppointmentType
  duracao?:         number
  contactId?:       string
  conversationId?:  string
  titaPacienteId?:  number
  participantes?:   string[]
}

export function parseCreateAppointmentBody(body: unknown): ParseResult<CreateAppointmentBody> {
  const errors: string[] = []
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Body inválido'] }
  const b = body as Record<string, unknown>

  if (typeof b.data !== 'string' || !DATE_RE.test(b.data)) {
    errors.push('data é obrigatória no formato YYYY-MM-DD')
  }

  if (b.hora !== undefined && (typeof b.hora !== 'string' || !TIME_RE.test(b.hora))) {
    errors.push('hora deve estar no formato HH:MM ou HH:MM:SS')
  }

  const temProfissional = b.profissionalId !== undefined && b.profissionalId !== null
  if (temProfissional) {
    if (!Number.isInteger(b.profissionalId)) errors.push('profissionalId deve ser inteiro')
    // Reservar vaga sem hora é impossível: a vaga é (profissional, data, hora).
    if (b.hora === undefined)                errors.push('hora é obrigatória ao reservar vaga de um profissional')
  } else {
    // Agendamento administrativo precisa de título — não há grade de onde derivá-lo.
    if (typeof b.titulo !== 'string' || !b.titulo.trim()) {
      errors.push('titulo é obrigatório em agendamento sem profissionalId')
    }
  }

  if (b.titulo !== undefined) {
    if (typeof b.titulo !== 'string')   errors.push('titulo deve ser string')
    else if (b.titulo.length > 255)     errors.push('titulo excede 255 caracteres')
  }

  if (b.descricao !== undefined && typeof b.descricao !== 'string') {
    errors.push('descricao deve ser string')
  }

  if (b.tipo !== undefined && !VALID_TYPES.includes(b.tipo as AppointmentType)) {
    errors.push(`tipo inválido. Valores: ${VALID_TYPES.join(', ')}`)
  }

  if (b.duracao !== undefined) {
    if (!Number.isInteger(b.duracao) || (b.duracao as number) <= 0 || (b.duracao as number) > 600) {
      errors.push('duracao deve ser inteiro entre 1 e 600 minutos')
    }
  }

  if (b.titaPacienteId !== undefined && b.titaPacienteId !== null && !Number.isInteger(b.titaPacienteId)) {
    errors.push('titaPacienteId deve ser inteiro')
  }

  if (b.participantes !== undefined && !isStringArray(b.participantes)) {
    errors.push('participantes deve ser array de strings')
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    data: {
      profissionalId: b.profissionalId as number | undefined,
      data:           b.data           as string,
      hora:           b.hora           as string | undefined,
      titulo:         (b.titulo as string | undefined)?.trim(),
      descricao:      b.descricao      as string | undefined,
      tipo:           b.tipo           as AppointmentType | undefined,
      duracao:        b.duracao        as number | undefined,
      contactId:      b.contactId      as string | undefined,
      conversationId: b.conversationId as string | undefined,
      titaPacienteId: b.titaPacienteId as number | undefined,
      participantes:  b.participantes  as string[] | undefined,
    },
  }
}

// ----------------------------------------------------------------------------
// PATCH /api/central/appointments/[id]
//
// Mudança de data/hora numa reserva de vaga é tratada como reagendamento pelo
// service (revalida a grade). Aqui só validamos a forma.
// ----------------------------------------------------------------------------

export interface UpdateAppointmentBody {
  titulo?:         string
  descricao?:      string | null
  data?:           string
  hora?:           string | null
  duracao?:        number | null
  tipo?:           AppointmentType
  status?:         AppointmentStatus
  participantes?:  string[] | null
  titaSessionId?:  number | null
  // Reagendamento para OUTRO profissional exige o destino completo
  profissionalId?: number
  motivo?:         string
}

export function parseUpdateAppointmentBody(body: unknown): ParseResult<UpdateAppointmentBody> {
  const errors: string[] = []
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Body inválido'] }
  const b = body as Record<string, unknown>

  if (Object.keys(b).length === 0) errors.push('Nenhum campo para atualizar')

  if (b.titulo !== undefined) {
    if (typeof b.titulo !== 'string' || !b.titulo.trim()) errors.push('titulo não pode ser vazio')
    else if (b.titulo.length > 255)                       errors.push('titulo excede 255 caracteres')
  }

  if (b.data !== undefined && (typeof b.data !== 'string' || !DATE_RE.test(b.data))) {
    errors.push('data deve estar no formato YYYY-MM-DD')
  }

  if (b.hora !== undefined && b.hora !== null && (typeof b.hora !== 'string' || !TIME_RE.test(b.hora))) {
    errors.push('hora deve estar no formato HH:MM ou HH:MM:SS')
  }

  if (b.tipo !== undefined && !VALID_TYPES.includes(b.tipo as AppointmentType)) {
    errors.push(`tipo inválido. Valores: ${VALID_TYPES.join(', ')}`)
  }

  if (b.status !== undefined && !VALID_STATUSES.includes(b.status as AppointmentStatus)) {
    errors.push(`status inválido. Valores: ${VALID_STATUSES.join(', ')}`)
  }

  if (b.duracao !== undefined && b.duracao !== null) {
    if (!Number.isInteger(b.duracao) || (b.duracao as number) <= 0 || (b.duracao as number) > 600) {
      errors.push('duracao deve ser inteiro entre 1 e 600 minutos')
    }
  }

  if (b.profissionalId !== undefined && !Number.isInteger(b.profissionalId)) {
    errors.push('profissionalId deve ser inteiro')
  }

  // Trocar de profissional é reagendar: sem data e hora do destino, o service
  // não tem vaga para validar.
  if (b.profissionalId !== undefined && (b.data === undefined || b.hora === undefined)) {
    errors.push('ao informar profissionalId, data e hora do novo horário são obrigatórias')
  }

  if (b.participantes !== undefined && b.participantes !== null && !isStringArray(b.participantes)) {
    errors.push('participantes deve ser array de strings')
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    data: {
      titulo:         (b.titulo as string | undefined)?.trim(),
      descricao:      b.descricao      as string | null | undefined,
      data:           b.data           as string | undefined,
      hora:           b.hora           as string | null | undefined,
      duracao:        b.duracao        as number | null | undefined,
      tipo:           b.tipo           as AppointmentType | undefined,
      status:         b.status         as AppointmentStatus | undefined,
      participantes:  b.participantes  as string[] | null | undefined,
      titaSessionId:  b.titaSessionId  as number | null | undefined,
      profissionalId: b.profissionalId as number | undefined,
      motivo:         b.motivo         as string | undefined,
    },
  }
}

// ----------------------------------------------------------------------------
// GET /api/central/appointments/availability
// ----------------------------------------------------------------------------

export interface ListAvailabilityQuery {
  dataInicio?:     string
  dataFim?:        string
  terapiaId?:      number
  profissionalId?: number
  unidadeId?:      number
  limite:          number
  // agrupar=terapia devolve o resumo por especialidade em vez da lista de horários
  agrupar?:        'terapia'
}

export function parseListAvailabilityQuery(p: URLSearchParams): ParseResult<ListAvailabilityQuery> {
  const errors: string[] = []

  const dataInicio = p.get('dataInicio') ?? undefined
  const dataFim    = p.get('dataFim')    ?? undefined
  if (dataInicio !== undefined && !DATE_RE.test(dataInicio)) errors.push('dataInicio deve estar no formato YYYY-MM-DD')
  if (dataFim    !== undefined && !DATE_RE.test(dataFim))    errors.push('dataFim deve estar no formato YYYY-MM-DD')
  if (dataInicio && dataFim && dataInicio > dataFim)         errors.push('dataInicio não pode ser posterior a dataFim')

  const terapiaId      = parseOptionalInt(p.get('terapiaId'),      'terapiaId',      errors)
  const profissionalId = parseOptionalInt(p.get('profissionalId'), 'profissionalId', errors)
  const unidadeId      = parseOptionalInt(p.get('unidadeId'),      'unidadeId',      errors)

  const agruparRaw = p.get('agrupar') ?? undefined
  if (agruparRaw !== undefined && agruparRaw !== 'terapia') {
    errors.push("agrupar aceita apenas 'terapia'")
  }

  // Teto 500 espelha o da RPC central.listar_vagas_disponiveis.
  const limite = clampInt(p.get('limite'), 1, 500, 50)

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    data: {
      dataInicio, dataFim, terapiaId, profissionalId, unidadeId, limite,
      agrupar: agruparRaw as 'terapia' | undefined,
    },
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback
  const n = parseInt(raw, 10)
  return isNaN(n) ? fallback : Math.min(max, Math.max(min, n))
}

function parseOptionalInt(raw: string | null, campo: string, errors: string[]): number | undefined {
  if (raw === null) return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n)) {
    errors.push(`${campo} deve ser inteiro`)
    return undefined
  }
  return n
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}
