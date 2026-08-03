export type FeriadoInfo = {
  nome: string
  tipo: "integral" | "parcial"
  horario_inicio: string
  horario_fim: string
}

export type TaxaEspecialidade = {
  id: string
  especialidade: string
  taxa_pa: number
  diaria: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type ParametrosGerais = {
  id: string
  cc_pa_default: number
  cc_pe_default: number
  cc_lim_default: number
  eta_bonus_default: number
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
  /**
   * Nota deste contrato específico. Desceu do profissional para o item na
   * migration 20260803120000 — antes era uma nota por profissional, então quem
   * tinha dois contratos tinha uma nota falando de um deles sem dizer qual.
   */
  observacoes?: string | null
}

export type ContratoAtual = {
  id: string
  profissional_nome: string
  documento_tipo: string | null
  cpf: string | null
  cnpj: string | null
  contratos: ContratoAtualItem[]
  /**
   * BACKUP CONGELADO — não é mais escrito. A observação virou por-contrato em
   * `ContratoAtualItem.observacoes` (migration 20260803120000); a coluna
   * continua existindo e `select('*')` continua trazendo, mas o app parou de
   * gravar aqui de propósito. Não ler como fonte de verdade.
   */
  observacoes: string | null
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
