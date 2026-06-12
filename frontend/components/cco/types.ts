export interface Competencia {
  mes: number
  ano: number
}

export interface PacientePendencia {
  pacienteNome: string
  diasAtraso: number
}

export interface CCOKpis {
  pacientes_conciliados: number
  pacientes_pendentes: number
  pacientes_em_revisao: number
  total_pacientes: number
  sessoes_prontas: number
  sessoes_pendentes: number
  sessoes_em_revisao: number
  total_sessoes: number
  evolucoes_pendentes: number
  evolucoes_atrasadas: number
  total_pacientes_assim: number
  total_sessoes_assim: number
}

export interface CCOMotivoPendencia {
  motivo: string
  label: string
  quantidade: number
  percentual: number
  color: string
}

export interface CCOSessaoRevisao {
  id: string
  paciente: string
  terapeutaOriginal: string
  terapeutaSubstituto: string
  data: string
  status: 'EM_REVISAO'
}

export interface CCOEvolucaoPendente {
  terapeuta: string
  quantidade: number
}

export interface PacienteComPendencia {
  id: string
  nome: string
  ocorrencias: number
  tiposPendencia: string[]
}

export interface PacienteEvolucaoPendente {
  id: string
  nome: string
  quantidade: number
}

export interface EvolucaoPendentePorTerapeuta {
  terapeuta: string
  pacientes: PacienteEvolucaoPendente[]
}

export interface CCOSessaoDetalhada {
  id: string
  paciente: string
  data: string
  horario: string
  terapia: string
  profissional: string
  evolucaoStatus: 'EVOLUIDA' | 'PENDENTE' | 'NENHUMA'
  evolucaoAutor?: string
  evolucaoDataHora?: string
  substituicao?: {
    original: string
    substituto: string
  }
  glosa?: boolean
  tratativas?: string[]
}

export interface ResumoSessoesPaciente {
  total: number
  evoluidas: number
  pendentes: number
  substituicoes: number
  glosas: number
}

export interface CCOData {
  kpis: CCOKpis
  motivosPendencias: CCOMotivoPendencia[]
  sessoesRevisao: CCOSessaoRevisao[]
  evolucoesPendentes: CCOEvolucaoPendente[]
  pacientesComPendencias: PacienteComPendencia[]
  pacientesEvolucaoPendentePorTerapeuta: EvolucaoPendentePorTerapeuta[]
  pacientesSessoes: Record<string, CCOSessaoDetalhada[]>
  pacientesAcaoImediata: PacientePendencia[]
  pacientesAcompanhamento: PacientePendencia[]
}
