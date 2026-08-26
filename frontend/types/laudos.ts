// Tipos para laudos de pacientes e altas/individualidades.
// Tabelas: paciente_laudos, paciente_laudo_especialidades, paciente_altas_individualidades
// Ver MIGRATION_LAUDOS_ALTAS.sql

export type NivelSuporte = "1" | "2" | "3" | "NA"
export type SituacaoLaudo = "Vigente" | "Vencido"

// ─── LAUDO ────────────────────────────────────────────────────────────────────

export type LaudoEspecialidade = {
  id: number
  laudo_id: number
  especialidade: string
  qt_laudo: number | null
  qt_autorizacao: number | null
  criado_em: string
}

/** Linha do banco — inclui o campo gerado `situacao`. */
export type PacienteLaudo = {
  id: number
  paciente_id: number
  data_laudo: string        // ISO date "YYYY-MM-DD"
  validade: string | null   // se null → data_laudo + 6 meses
  situacao: SituacaoLaudo
  autorizado_em: string | null
  comp_agressivo: boolean | null
  paciente_verbal: boolean | null
  ambiente_natural: boolean | null
  nivel_suporte: NivelSuporte | null
  alta: boolean
  data_alta: string | null
  especialidade_alta: string | null
  arquivo_path: string | null
  observacoes: string | null
  em_uso?: boolean
  criado_em: string
  atualizado_em: string
  /** Populado pelo service, vazio se não selecionado. */
  especialidades: LaudoEspecialidade[]
}

/** Formulário de criação/edição — sem campos gerados pelo banco. */
export type LaudoForm = {
  data_laudo: string
  validade: string          // string vazia = calcular automaticamente
  autorizado_em: string
  arquivo_path: string | null
  observacoes: string
  em_uso: boolean
  especialidades: LaudoEspecialidadeForm[]
}

export type LaudoEspecialidadeForm = {
  /** Presente apenas em edição. */
  id?: number
  especialidade: string
  qt_laudo: string   // string para o input controlado
  qt_autorizacao: string
}

// ─── ALTAS E INDIVIDUALIDADES ──────────────────────────────────────────────────

export type AltaIndividualidade = {
  id: number
  paciente_id: number
  comp_agressivo: boolean | null
  paciente_verbal: boolean | null
  ambiente_natural: boolean | null
  nivel_suporte: NivelSuporte | null
}

export type AltaIndividualidadeForm = Omit<AltaIndividualidade, "id" | "paciente_id">

export type PacienteAlta = {
  id: number
  paciente_id: number
  data_alta: string
  especialidade_alta: string
  arquivo_alta_path: string | null
}

export type PacienteAltaForm = Omit<PacienteAlta, "id" | "paciente_id">
