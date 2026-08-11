import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  VagaDisponivel,
} from '@/modules/atendimento/types/central.types'

// ============================================================================
// Cliente das rotas /api/central/appointments
//
// As rotas autenticam por cookie de sessão (extractUser → createClient do
// servidor), então fetch same-origin já vai autenticado — não há token para
// anexar aqui.
//
// Por que não falar com o Supabase direto do browser: o schema central não é
// exposto ao PostgREST em produção, e a regra de disponibilidade precisa somar
// duas fontes. As rotas são o único caminho.
// ============================================================================

// A barra final não é cosmética: next.config.ts usa trailingSlash: true, então
// pedir /api/central/appointments devolve 308 e o browser refaz a requisição.
// Duas viagens por chamada, em toda navegação do calendário.
const BASE = '/api/central/appointments/'

// Erro que preserva o código de domínio da API. A UI precisa distinguir
// "vaga acabou de ser tomada" (oferecer outro horário) de "essa vaga não
// existe na grade" (o pedido está errado) — as duas coisas são falhas de
// agendamento mas pedem reações diferentes.
export class AgendamentoApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AgendamentoApiError'
  }

  // true quando vale a pena o usuário escolher outro horário e tentar de novo
  get vagaIndisponivel(): boolean {
    return this.code === 'SLOT_ALREADY_BOOKED'
        || this.code === 'SLOT_NOT_IN_GRADE'
        || this.code === 'SLOT_IN_PAST'
  }
}

type Envelope<T> = { data: T; pagination?: unknown }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  const body = await resp.json().catch(() => null)

  if (!resp.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new AgendamentoApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Falha na requisição (HTTP ${resp.status})`,
      resp.status,
    )
  }

  return (body as Envelope<T>).data
}

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

export interface ListarAgendamentosParams {
  from?:              string
  to?:                string
  status?:            AppointmentStatus[]
  contactId?:         string
  type?:              AppointmentType
  includeCancelled?:  boolean
  limit?:             number
}

export async function listarAgendamentos(
  params: ListarAgendamentosParams = {},
): Promise<Appointment[]> {
  const q = new URLSearchParams()
  if (params.from)             q.set('from', params.from)
  if (params.to)               q.set('to', params.to)
  if (params.status?.length)   q.set('status', params.status.join(','))
  if (params.contactId)        q.set('contactId', params.contactId)
  if (params.type)             q.set('type', params.type)
  if (params.includeCancelled) q.set('includeCancelled', 'true')
  // 500 é o teto da rota. O calendário mensal precisa do mês inteiro de uma vez.
  q.set('limit', String(params.limit ?? 500))

  return request<Appointment[]>(`${BASE}?${q}`)
}

export interface ListarVagasParams {
  dataInicio?:     string
  dataFim?:        string
  terapiaId?:      number
  profissionalId?: number
  unidadeId?:      number
  limite?:         number
}

// Vagas ofertáveis de verdade: grade do TiTa com status 'Livre', menos o que já
// foi prometido, menos o passado.
export async function listarVagas(params: ListarVagasParams = {}): Promise<VagaDisponivel[]> {
  const q = new URLSearchParams()
  if (params.dataInicio)     q.set('dataInicio', params.dataInicio)
  if (params.dataFim)        q.set('dataFim', params.dataFim)
  if (params.terapiaId)      q.set('terapiaId', String(params.terapiaId))
  if (params.profissionalId) q.set('profissionalId', String(params.profissionalId))
  if (params.unidadeId)      q.set('unidadeId', String(params.unidadeId))
  q.set('limite', String(params.limite ?? 500))

  return request<VagaDisponivel[]>(`${BASE}availability/?${q}`)
}

export interface TerapiaComVaga {
  terapiaId:   number
  terapiaNome: string | null
  vagas:       number
}

// Resumo por especialidade — responde "o que vocês têm disponível?" sem
// despejar centenas de horários.
export async function listarTerapiasComVaga(
  dataInicio?: string,
  dataFim?: string,
): Promise<TerapiaComVaga[]> {
  const q = new URLSearchParams({ agrupar: 'terapia' })
  if (dataInicio) q.set('dataInicio', dataInicio)
  if (dataFim)    q.set('dataFim', dataFim)

  return request<TerapiaComVaga[]>(`${BASE}availability/?${q}`)
}

// ----------------------------------------------------------------------------
// Escrita
// ----------------------------------------------------------------------------

export interface ReservarVagaInput {
  profissionalId:  number
  data:            string
  hora:            string
  titulo?:         string
  descricao?:      string
  tipo?:           AppointmentType
  duracao?:        number
  contactId?:      string
  titaPacienteId?: number
  participantes?:  string[]
}

// Reserva uma vaga real da grade. Pode falhar com SLOT_ALREADY_BOOKED (409),
// SLOT_NOT_IN_GRADE ou SLOT_IN_PAST (422).
export async function reservarVaga(input: ReservarVagaInput): Promise<Appointment> {
  return request<Appointment>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export interface CriarAdministrativoInput {
  titulo:         string
  data:           string
  hora?:          string
  duracao?:       number
  tipo?:          AppointmentType
  descricao?:     string
  contactId?:     string
  participantes?: string[]
}

// Agendamento que não consome vaga de grade (reunião com responsável, followup).
export async function criarAgendamentoAdministrativo(
  input: CriarAdministrativoInput,
): Promise<Appointment> {
  return request<Appointment>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export interface AtualizarAgendamentoInput {
  titulo?:        string
  descricao?:     string | null
  duracao?:       number | null
  tipo?:          AppointmentType
  status?:        AppointmentStatus
  participantes?: string[] | null
}

export async function atualizarAgendamento(
  id: string,
  input: AtualizarAgendamentoInput,
): Promise<Appointment> {
  return request<Appointment>(`${BASE}${id}/`, { method: 'PATCH', body: JSON.stringify(input) })
}

// Reagenda para outra vaga. O backend valida a vaga nova ANTES de liberar a
// atual, então uma falha aqui deixa o agendamento original intacto.
export async function reagendar(
  id: string,
  destino: { profissionalId: number; data: string; hora: string },
  motivo?: string,
): Promise<Appointment> {
  return request<Appointment>(`${BASE}${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ ...destino, motivo }),
  })
}

// Cancela (status = 'cancelled'), devolvendo a vaga à grade.
// Não apaga: o rastro de quem desmarcou continua auditável.
export async function cancelarAgendamento(id: string, motivo?: string): Promise<Appointment> {
  const q = motivo ? `?motivo=${encodeURIComponent(motivo)}` : ''
  return request<Appointment>(`${BASE}${id}/${q}`, { method: 'DELETE' })
}
