import type { AtendimentoTerapeutico } from '@/services/central-terapeutas.service'

export type ControleFilters = {
  data: string
  horario: string
  unidade: string
  terapeuta: string
  paciente: string
}

export type ControleTerapeuticoItem = AtendimentoTerapeutico
