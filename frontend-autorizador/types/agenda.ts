export type AgendaMode = 'pacientes' | 'terapeutas' | 'salas'

export interface AgendaEvent {
  id: string
  title: string
  start: string
  end: string
  resourceId?: string
  backgroundColor: string
  borderColor: string
  textColor: string
  extendedProps: {
    paciente: string
    terapeuta: string
    terapeuta_id?: string | number
    sala?: string
    terapia: string
    status: string
    unidade?: string
    observacao?: string
    // Future-ready
    tipo?: 'regular' | 'encaixe' | 'livre'
    checkin?: boolean
    presenca?: boolean
    overlapCount?: number
    overlapEvents?: { paciente: string; terapeuta: string; terapia: string; sala: string; unidade: string; borderColor: string }[]
  }
}

export interface AgendaResource {
  id: string
  title: string
  eventColor?: string
}

export interface AgendaFilters {
  unidade:  string
  terapeuta: string
  terapia:  string
  sala:     string
  paciente?: string
}

export interface AgendaKpis {
  ocupacaoPercent: number
  horasLivresTotal: string
  totalAtendimentos: number
  proximoAtendimento: { hora: string; paciente: string } | null
}

export interface AgendaFilterOptions {
  unidades: string[]
  terapeutas: string[]
  terapias: string[]
  salas: string[]
  pacientes: string[]
}
