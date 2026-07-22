// ─── TIPOS: VALORES POR CONVÊNIO ──────────────────────────────────────────────
// Cadastro de valores negociados por convênio (tabela cronograma_convenio_valores),
// com regra opcional por terapia dentro do convênio, e exceções pontuais por
// paciente (cronograma_convenio_valores_paciente). Cruzado com as sessões já
// calculadas em pacientesDashboard.ts pra projetar receita mensal.

export type CriterioAba = "com_aba" | "sem_aba"

/**
 * Linha de `cronograma_convenio_valores` — um dos 3 tipos, sempre mutuamente
 * exclusivos (nunca dois preenchidos na mesma linha):
 * - regra geral do convênio: terapia_id e criterio_aba nulos;
 * - regra por terapia específica: terapia_id preenchido;
 * - regra por critério ABA (o cronograma INTEIRO do paciente contém ou não
 *   Psicologia ABA — vale pra qualquer terapia dele nesse convênio, ex.:
 *   SEGUROS UNIMED): criterio_aba preenchido.
 */
export interface ConvenioValor {
  id: string
  convenio_nome: string
  /** Chave real do cruzamento — vem de csv_grades_profissionais.terapia_id. null = regra geral ou por critério ABA. */
  terapia_id: number | null
  /** Rótulo cosmético (nome no momento do cadastro) — NUNCA usado pra casar com sessões, só pra exibição. */
  terapia_nome: string | null
  /** null = não é regra por critério ABA. "com_aba"/"sem_aba" = vale pra todas as sessões do paciente nesse convênio, conforme o cronograma dele conter Psicologia ABA ou não. */
  criterio_aba: CriterioAba | null
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
  criterio_aba?: CriterioAba | null
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
  valor_sessao?: number | null
  observacoes?: string | null
}

/**
 * Terapias de Processo Diagnóstico cobradas em BLOCO (não por sessão de
 * 40min) que têm cadastro próprio de valor em
 * `cronograma_convenio_pacote_avaliacao` — hoje Avaliação Neuropsicológica
 * (pacote de 8 a 10 sessões, cobrado uma vez por paciente) e
 * Psiquiatra/Neurologista (consulta avulsa). IDs vêm de TERAPIA_ID
 * (lib/cronograma/constants.ts) — fonte de verdade dos IDs de terapia.
 * Triagem ainda não tem cadastro próprio.
 */
export const TERAPIAS_PACOTE: { terapia_id: number; terapia_nome: string }[] = [
  { terapia_id: 2268, terapia_nome: "Avaliação Neuropsicológica" },
  { terapia_id: 2695, terapia_nome: "Psiquiatra/Neurologista" },
]

/**
 * Linha de `cronograma_convenio_pacote_avaliacao` — valor de uma terapia de
 * `TERAPIAS_PACOTE` (Avaliação Neuropsicológica ou Psiquiatra/Neurologista)
 * por convênio. Cobrado UMA vez por paciente que tiver essa terapia no
 * cronograma, não por sessão. `valor_a_vista` é o que entra na Previsão de
 * Receitas; `valor_parcelado` é só referência/observação (parcelamento não é
 * receita líquida garantida, então não entra no cálculo de projeção).
 */
export interface ConvenioPacoteAvaliacao {
  id: string
  convenio_nome: string
  terapia_id: number
  terapia_nome: string
  valor_a_vista: number
  valor_parcelado: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** Payload de criação/edição de ConvenioPacoteAvaliacao (sem campos gerados pelo banco) */
export interface ConvenioPacoteAvaliacaoInput {
  convenio_nome: string
  terapia_id: number
  terapia_nome: string
  valor_a_vista: number
  valor_parcelado?: number | null
  observacoes?: string | null
}
