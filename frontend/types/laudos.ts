// Tipos para laudos de pacientes e altas/individualidades.
//
// Tabelas: cadastros_pacientes_laudos, cadastros_pacientes_laudo_especialidades,
// cadastros_pacientes_altas, cadastros_pacientes_altas_individualidades.
// Ver supabase/migrations/20260826140000, 140100, 140200 e o rename em 140400.
//
// Os nomes de coluna acompanham o banco de propósito: `id_laudo` em vez de
// `id`, `id_paciente_pulsar` em vez de `paciente_id`. `paciente_id` era ambíguo
// — public.pacientes tem id_paciente (PK do Pulsar) E tita_paciente_id (id do
// TiTa), as duas numéricas, e trocar uma pela outra não dá erro: aponta para
// outro paciente em silêncio.

export type NivelSuporte = "1" | "2" | "3" | "NA"
export type SituacaoLaudo = "Vigente" | "Vencido"

// ─── LAUDO ────────────────────────────────────────────────────────────────────

export type LaudoEspecialidade = {
  id_laudo_especialidade: number
  id_laudo: number
  especialidade: string
  qt_laudo: number | null
  qt_autorizacao: number | null
  criado_em: string
}

/** Linha do banco — `situacao` é calculada no service, não é coluna. */
export type PacienteLaudo = {
  id_laudo: number
  id_paciente_pulsar: number
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
  id_laudo_especialidade?: number
  especialidade: string
  qt_laudo: string   // string para o input controlado
  qt_autorizacao: string
}

// ─── ALTAS E INDIVIDUALIDADES ──────────────────────────────────────────────────

/** 0 ou 1 por paciente: descreve o paciente, não um evento. */
export type AltaIndividualidade = {
  id_individualidade: number
  id_paciente_pulsar: number
  comp_agressivo: boolean | null
  paciente_verbal: boolean | null
  ambiente_natural: boolean | null
  nivel_suporte: NivelSuporte | null
}

export type AltaIndividualidadeForm = Omit<
  AltaIndividualidade,
  "id_individualidade" | "id_paciente_pulsar"
>

/** 1:N — uma alta por especialidade. */
export type PacienteAlta = {
  id_alta: number
  id_paciente_pulsar: number
  data_alta: string
  especialidade_alta: string
  arquivo_alta_path: string | null
}

export type PacienteAltaForm = Omit<PacienteAlta, "id_alta" | "id_paciente_pulsar">
