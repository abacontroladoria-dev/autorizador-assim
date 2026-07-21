// ─── TIPOS: VALORES POR CONVÊNIO ──────────────────────────────────────────────
// Cadastro de valores negociados por convênio (tabela cronograma_convenio_valores),
// com regra opcional por terapia dentro do convênio, e exceções pontuais por
// paciente (cronograma_convenio_valores_paciente). Cruzado com as sessões já
// calculadas em pacientesDashboard.ts pra projetar receita mensal.

/** Linha de `cronograma_convenio_valores` — regra geral do convênio (terapia_nome null) ou por terapia específica. */
export interface ConvenioValor {
  id: string
  convenio_nome: string
  /** Chave real do cruzamento — vem de csv_grades_profissionais.terapia_id. null = regra geral do convênio. */
  terapia_id: number | null
  /** Rótulo cosmético (nome no momento do cadastro) — NUNCA usado pra casar com sessões, só pra exibição. */
  terapia_nome: string | null
  valor_hora: number | null
  valor_sessao: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** Payload de criação/edição de ConvenioValor (sem campos gerados pelo banco) */
export interface ConvenioValorInput {
  convenio_nome: string
  terapia_id?: number | null
  terapia_nome?: string | null
  valor_hora?: number | null
  valor_sessao?: number | null
  observacoes?: string | null
}

/** Linha de `cronograma_convenio_valores_paciente` — exceção de valor pra um paciente específico dentro de um convênio. */
export interface ConvenioValorPaciente {
  id: string
  convenio_nome: string
  /** Chave real do cruzamento — vem de csv_grades_profissionais.paciente_id. */
  paciente_id: number | null
  /** Rótulo cosmético (nome no momento do cadastro) — NUNCA usado pra casar com sessões, só pra exibição. */
  paciente_nome: string
  valor_hora: number | null
  valor_sessao: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** Payload de criação/edição de ConvenioValorPaciente (sem campos gerados pelo banco) */
export interface ConvenioValorPacienteInput {
  convenio_nome: string
  paciente_id?: number | null
  paciente_nome: string
  valor_hora?: number | null
  valor_sessao?: number | null
  observacoes?: string | null
}
