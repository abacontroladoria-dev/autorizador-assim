// ─── Tipos — agendamento-terapia-tita ──────────────────────────────────────────
// Contratos usados pela integração com a API TiTa (POST /integracao/agendamento/create)
// para implantar, na agenda oficial, sessões aceitas no fluxo de Ocupação de Paciente.

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export type SupabaseClient = ReturnType<typeof createClient>

/** Sessão individual aceita no frontend (mesmo shape de AceiteSessao do módulo Cronograma). */
export interface SessaoInput {
  dia: string
  hora: string
  tP: string
  prof: string
  unidade: string
}

/** Corpo da requisição recebida pela edge function. */
export interface CriarAgendamentoRequestBody {
  pac: string
  sessoes: SessaoInput[]
}

/**
 * Payload final enviado ao endpoint TiTa POST /integracao/agendamento/create.
 * id_favorecido, id_terapia_clinica, id_terapia_exibicao e id_sala vêm prontos do
 * registro de csv_grades_profissionais (paciente_id, terapia_id,
 * terapia_exibicao_id, sala_id). id_tipo_agenda é fixo (ID_TIPO_AGENDA em
 * payload.ts). id_grade_terapeuta NÃO vem dessa tabela — é resolvido à parte
 * (ver mappings.ts) a partir de grade_profissionais_tita.
 */
export interface AgendamentoTitaPayload {
  data_inicial: string
  data_final: string
  id_grade_terapeuta: number
  id_favorecido: number
  id_sala: number
  frequencia: string
  id_tipo_agenda: number
  id_terapia_clinica: number
  id_terapia_exibicao: number
}

/** Resultado bruto da chamada HTTP à API TiTa. */
export interface TitaApiResult {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

/** Resultado do processamento de uma sessão individual. */
export interface AgendamentoResultado {
  sessao: SessaoInput
  ok: boolean
  payload?: AgendamentoTitaPayload
  resposta?: TitaApiResult
  erro?: string
}

/** Resposta final retornada pela edge function. */
export interface CriarAgendamentoResponseBody {
  ok: boolean
  pac: string
  resultados: AgendamentoResultado[]
}

// ─── Busca de grade (paciente_id + csv_grade_profissional_id) ─────────────────

/** Corpo da requisição para buscar um registro de grade por paciente + registro. */
export interface BuscarGradeRequestBody {
  paciente_id: number
  /** UUID da linha (coluna id) em csv_grades_profissionais — identificador único do registro. */
  csv_grade_profissional_id: string
}

/** Registro da tabela csv_grades_profissionais (grade sincronizada da API TiTa). */
export interface GradeProfissionalRow {
  id: string
  tita_agendamento_id: number | null
  paciente_id: number | null
  paciente_nome: string | null
  data: string
  dia_semana: string | null
  hora_inicial: string | null
  hora_final: string | null
  profissional_id: number | null
  profissional_nome: string | null
  profissional_cpf: string | null
  terapia_id: number | null
  terapia_nome: string | null
  terapia_exibicao_id: number | null
  terapia_exibicao_nome: string | null
  sala_id: number | null
  sala_nome: string | null
  sala_observacoes: string | null
  unidade_id: number | null
  unidade_nome: string | null
  convenio_nome: string | null
  status_agendamento: string | null
  updated_at: string
}

/** Resposta da busca de grade. */
export interface BuscarGradeResponseBody {
  ok: boolean
  grade?: GradeProfissionalRow
  error?: string
}
