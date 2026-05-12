import type { ControleTerapeuticoItem } from './types'

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
