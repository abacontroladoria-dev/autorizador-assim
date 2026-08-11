import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  PaginatedResult,
} from '../types/central.types'
import { STATUS_QUE_OCUPAM_VAGA } from '../types/central.types'

// ============================================================================
// AppointmentRepository
//
// Acesso à tabela:
//   central.appointments — agendamentos originados no canal de mensageria
//
// A identidade da vaga (profissional_id + date + time) é o que amarra o
// agendamento à grade real do TiTa. Ver 20260810100000 para o porquê de a
// tupla natural ser a chave, e não tita_session_id.
//
// Indexes utilizados:
//   list (por janela de data)  → idx_appointments_org_date
//   listByProfissional         → idx_appointments_org_profissional
//   listByContact              → idx_appointments_org_contact
//   create (guarda de vaga)    → uq_appointments_slot_ocupada
// ============================================================================

// Código SQLSTATE de unique_violation. É assim que a corrida entre duas
// reservas simultâneas da mesma vaga chega até aqui: as duas passam pela
// checagem prévia, e o índice reprova a segunda no commit.
export const PG_UNIQUE_VIOLATION = '23505'

export interface CreateAppointmentInput {
  organization_id:    string
  contact_id?:        string | null
  conversation_id?:   string | null
  title:              string
  description?:       string | null
  date:               string
  time?:              string | null
  duration?:          number | null
  type?:              AppointmentType
  attendees?:         string[] | null
  meeting_url?:       string | null
  status?:            AppointmentStatus
  created_by_ai?:     boolean
  profissional_id?:   number | null
  profissional_nome?: string | null
  terapia_id?:        number | null
  terapia_nome?:      string | null
  unidade_id?:        number | null
  sala_nome?:         string | null
  tita_paciente_id?:  number | null
  tita_session_id?:   number | null
}

export interface UpdateAppointmentInput {
  title?:             string
  description?:       string | null
  date?:              string
  time?:              string | null
  duration?:          number | null
  type?:              AppointmentType
  attendees?:         string[] | null
  meeting_url?:       string | null
  status?:            AppointmentStatus
  profissional_id?:   number | null
  profissional_nome?: string | null
  terapia_id?:        number | null
  terapia_nome?:      string | null
  unidade_id?:        number | null
  sala_nome?:         string | null
  tita_paciente_id?:  number | null
  tita_session_id?:   number | null
}

export interface ListAppointmentsInput {
  orgId:        string
  // Janela de datas inclusiva nas duas pontas ('YYYY-MM-DD').
  from?:        string
  to?:          string
  status?:      AppointmentStatus[]
  contactId?:   string
  type?:        AppointmentType
  // Por padrão os cancelados NÃO vêm: o calendário não deve mostrar buraco
  // preenchido. Quem quiser auditar passa includeCancelled.
  includeCancelled?: boolean
  limit:        number
  offset:       number
}

const COLUNAS = '*'

export class AppointmentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(input: ListAppointmentsInput): Promise<PaginatedResult<Appointment>> {
    let query = (this.supabase as any)
      .schema('central')
      .from('appointments')
      .select(COLUNAS, { count: 'exact' })
      .eq('organization_id', input.orgId)

    if (input.from)      query = query.gte('date', input.from)
    if (input.to)        query = query.lte('date', input.to)
    if (input.contactId) query = query.eq('contact_id', input.contactId)
    if (input.type)      query = query.eq('type', input.type)

    if (input.status?.length) {
      query = query.in('status', input.status)
    } else if (!input.includeCancelled) {
      query = query.not('status', 'in', '("cancelled")')
    }

    const { data, error, count } = await query
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: false })
      .range(input.offset, input.offset + input.limit - 1)

    if (error) throw error
    return { data: (data ?? []) as Appointment[], count: count ?? 0 }
  }

  async findById(id: string): Promise<Appointment | null> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('appointments')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return (data ?? null) as Appointment | null
  }

  // Agendamentos que OCUPAM vaga do profissional numa janela.
  // Usado para conferir a agenda de um profissional sem passar pela grade.
  async listOcupacaoProfissional(
    orgId: string,
    profissionalId: number,
    from: string,
    to: string,
  ): Promise<Appointment[]> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('appointments')
      .select(COLUNAS)
      .eq('organization_id', orgId)
      .eq('profissional_id', profissionalId)
      .gte('date', from)
      .lte('date', to)
      .in('status', STATUS_QUE_OCUPAM_VAGA as unknown as string[])
      .order('date', { ascending: true })
      .order('time', { ascending: true })

    if (error) throw error
    return (data ?? []) as Appointment[]
  }

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('appointments')
      .insert({
        organization_id:   input.organization_id,
        contact_id:        input.contact_id        ?? null,
        conversation_id:   input.conversation_id   ?? null,
        title:             input.title,
        description:       input.description       ?? null,
        date:              input.date,
        time:              input.time              ?? null,
        duration:          input.duration          ?? null,
        type:              input.type              ?? 'other',
        attendees:         input.attendees         ?? null,
        meeting_url:       input.meeting_url       ?? null,
        status:            input.status            ?? 'scheduled',
        created_by_ai:     input.created_by_ai     ?? false,
        profissional_id:   input.profissional_id   ?? null,
        profissional_nome: input.profissional_nome ?? null,
        terapia_id:        input.terapia_id        ?? null,
        terapia_nome:      input.terapia_nome      ?? null,
        unidade_id:        input.unidade_id        ?? null,
        sala_nome:         input.sala_nome         ?? null,
        tita_paciente_id:  input.tita_paciente_id  ?? null,
        tita_session_id:   input.tita_session_id   ?? null,
      })
      .select(COLUNAS)
      .single()

    if (error) throw error
    return data as Appointment
  }

  async update(id: string, input: UpdateAppointmentInput): Promise<Appointment> {
    const patch: Record<string, unknown> = {}
    const campos: (keyof UpdateAppointmentInput)[] = [
      'title', 'description', 'date', 'time', 'duration', 'type', 'attendees',
      'meeting_url', 'status', 'profissional_id', 'profissional_nome',
      'terapia_id', 'terapia_nome', 'unidade_id', 'sala_nome',
      'tita_paciente_id', 'tita_session_id',
    ]
    for (const campo of campos) {
      if (input[campo] !== undefined) patch[campo] = input[campo]
    }

    const { data, error } = await (this.supabase as any)
      .schema('central')
      .from('appointments')
      .update(patch)
      .eq('id', id)
      .select(COLUNAS)
      .single()

    if (error) throw error
    return data as Appointment
  }

  // Cancelamento é UPDATE de status, não DELETE: a vaga volta a ser oferecível
  // (o predicado de uq_appointments_slot_ocupada exclui 'cancelled') e o
  // histórico de quem desmarcou continua auditável.
  async cancel(id: string): Promise<Appointment> {
    return this.update(id, { status: 'cancelled' })
  }

  // DELETE físico existe apenas para a rota de admin. Preferir cancel().
  async remove(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .schema('central')
      .from('appointments')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
