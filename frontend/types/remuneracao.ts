export type FeriadoInfo = {
  nome: string
  tipo: "integral" | "parcial"
  parcial_a_partir?: string
}

export type RemuneracaoConfig = {
  id: string
  taxas_pa: Record<string, number>
  diarias: Record<string, number>
  cc_pa_default: number
  cc_pe_default: number
  cc_lim_default: number
  eta_bonus_default: number
  dow_pt: Record<string, string>
  feriados: Record<string, FeriadoInfo>
  presenca_padrao: number
  updated_at: string
  updated_by: string | null
}

export type ContratoAntigo = {
  id: string
  profissional_nome: string
  salario: number
  ch_semanal: number
  contrato: string | null
  created_at: string
  updated_at: string
}

export type ContratoAtualItem = {
  numero: string
  funcao: string
  valorPA: number
  vigente: boolean
}

export type ContratoAtual = {
  id: string
  profissional_nome: string
  documento_tipo: string | null
  cpf: string | null
  cnpj: string | null
  contratos_atuais: ContratoAtualItem[]
  observacoes: string | null
  created_at: string
  updated_at: string
}

export type CapacidadeProfissional = {
  id: string
  profissional_nome: string
  dias: Record<string, number>
  padrao: number | null
  limite_cc: number | null
  created_at: string
  updated_at: string
}

export type HistoricoSnapshot = {
  id: string
  mes_ano: string
  profissional_nome: string | null
  dados: Record<string, unknown>
  created_at: string
  created_by: string | null
}
