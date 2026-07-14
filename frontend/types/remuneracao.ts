export type FeriadoInfo = {
  nome: string
  tipo: "integral" | "parcial"
  horario_inicio?: string
  horario_fim?: string
  /** @deprecated usar horario_inicio — mantido só para não perder registros antigos já salvos. */
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

export type ContratoAtualItem = {
  numero: string
  funcao: string
  valorPA: number
  vigente: boolean
  /** Ausente/undefined = "atendimento" (comportamento padrão, contratos antigos). */
  modeloFaturamento?: "atendimento" | "banco_horas"
  /**
   * Só relevante quando modeloFaturamento === "banco_horas": valor total pago
   * (mês ou período do contrato). O valor/hora é derivado em tempo de
   * execução (valorTotal ÷ horas agendadas na grade), não é armazenado.
   * Um contrato "antigo" é apenas um item com vigente=false.
   */
  valorTotal?: number
}

export type ContratoAtual = {
  id: string
  profissional_nome: string
  documento_tipo: string | null
  cpf: string | null
  cnpj: string | null
  contratos: ContratoAtualItem[]
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
