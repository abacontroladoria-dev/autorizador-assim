import type { ControleTerapeuticoItem } from './types'
import type { SlotModalSubstituicao } from '@/services/controle-terapeutico.service'

export const unidadesControle = [
  'Realengo',
  'Fazendinha',
  'Padre Miguel',
]

export const terapiasIgnoradas = [
  'Aplicador ABA Escola',
  'Aplicador Suporte',
  'Apoio Operacional',
  'Especialista Técnico de Área',
  'Estágio',
  'Facilitador Técnico',
  'Operações Clínicas',
  'Triagem',
]

export function getAtendimentoId(item: ControleTerapeuticoItem) {
  return String(
    item.tita_agendamento_id ||
      `${getData(item)}_${getHorarioInicial(item)}_${getPaciente(item)}_${getTerapeuta(item)}`
  )
}

export function getPaciente(item: ControleTerapeuticoItem) {
  return item.paciente_nome || item.nome_paciente || 'Paciente não informado'
}

export function getTerapeuta(item: ControleTerapeuticoItem) {
  return (
    item.profissional_nome ||
    item.nome_profissional ||
    item.nome_terapeuta ||
    'Terapeuta não informado'
  )
}

export function getTerapia(item: ControleTerapeuticoItem) {
  return item.nome_terapia || item.terapia_nome || 'Terapia não informada'
}

export function getData(item: ControleTerapeuticoItem) {
  return item.data || item.data_atendimento || ''
}

export function getHorarioInicial(item: ControleTerapeuticoItem) {
  return (
    item.hora_inicial ||
    item.horario ||
    ''
  )
    .toString()
    .slice(0, 5)
}

export function getHorarioFinal(item: ControleTerapeuticoItem) {
  return item.hora_final || ''
}

export function getHorario(item: ControleTerapeuticoItem) {
  const inicio = getHorarioInicial(item)?.slice(0, 5)
  const fim = getHorarioFinal(item)?.slice(0, 5)

  if (inicio && fim) {
    return `${inicio} - ${fim}`
  }

  return inicio || 'Horário não informado'
}

export function getSala(item: ControleTerapeuticoItem) {
  return item.sala_operacional || item.sala || item.sala_nome || 'Sala não informada'
}

export function getUnidade(item: ControleTerapeuticoItem) {
  return item.unidade || item.nome_unidade || ''
}

export function getStatus(item: ControleTerapeuticoItem) {
  return item.status_operacional || item.status || 'pendente'
}

export function normalizarStatus(status?: string | null) {
  return (status || 'pendente').toLowerCase()
}

export function terapiaDeveAparecer(item: ControleTerapeuticoItem) {
  return !terapiasIgnoradas.includes(getTerapia(item))
}

export function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return partes[0].slice(0, 2).toUpperCase()
}

export function getProfissionaisUnicos(
  slots: SlotModalSubstituicao[]
): { id: number; nome: string; unidade: string; terapia_nome: string }[] {
  const map = new Map<number, { id: number; nome: string; unidade: string; terapia_nome: string }>()
  for (const s of slots) {
    if (!map.has(s.profissional_id)) {
      map.set(s.profissional_id, {
        id: s.profissional_id,
        nome: s.profissional_nome,
        unidade: s.unidade,
        terapia_nome: s.terapia_nome,
      })
    }
  }
  return Array.from(map.values())
}

export function getStatusProfNaHora(
  profSlots: SlotModalSubstituicao[],
  hora: string
): { status: 'livre' | 'ocupado' | 'sem_agenda_hoje'; paciente: string | null } {
  if (profSlots.length > 0 && profSlots.every((s) => s.status_slot === 'sem_agenda_hoje')) {
    return { status: 'sem_agenda_hoje', paciente: null }
  }

  const hojeSlots = profSlots.filter((s) => s.status_slot !== 'sem_agenda_hoje')
  const horaNorm = hora.slice(0, 5)
  const slotNaHora = hojeSlots.find((s) => s.hora.slice(0, 5) === horaNorm)

  if (!slotNaHora) {
    return { status: 'livre', paciente: null }
  }

  if (slotNaHora.status_slot?.toLowerCase() === 'livre') {
    return { status: 'livre', paciente: null }
  }

  return { status: 'ocupado', paciente: slotNaHora.paciente_nome }
}
