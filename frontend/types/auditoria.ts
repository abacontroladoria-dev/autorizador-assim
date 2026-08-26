// Trilha de auditoria dos cadastros.
// Ver supabase/migrations/20260826120000_create_cadastros_auditoria.sql.

export type EntidadeAuditada =
  | "paciente"
  | "responsavel"
  | "ficha_medica"
  | "convenio"
  | "plano_saude"
  | "laudo"
  | "alta_individualidade"

export type AcaoAuditada = "criar" | "editar" | "excluir" | "inativar" | "reativar"

export type RegistroAuditoria = {
  id: string
  tabela: EntidadeAuditada
  registro_id: string
  acao: AcaoAuditada

  paciente_id: number | null
  paciente_nome: string | null
  convenio_nome: string | null
  alvo_nome: string | null

  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  resumo: string | null
  motivo: string | null

  usuario_id: string | null
  usuario_nome: string | null

  criado_em: string
  criado_em_brasilia: string | null
}

/** O que os services de escrita informam. `resumo` é calculado, não passado. */
export type EntradaAuditoria = {
  tabela: EntidadeAuditada
  registroId: string | number
  acao: AcaoAuditada
  pacienteId?: number | null
  pacienteNome?: string | null
  convenioNome?: string | null
  alvoNome?: string | null
  antes?: Record<string, unknown> | null
  depois?: Record<string, unknown> | null
  motivo?: string | null
}

export const ENTIDADE_LABEL: Record<EntidadeAuditada, string> = {
  paciente: "Paciente",
  responsavel: "Responsável",
  ficha_medica: "Ficha médica",
  convenio: "Convênio",
  plano_saude: "Plano de saúde",
  laudo: "Laudo",
  alta_individualidade: "Altas e Individualidades",
}

export const ACAO_LABEL: Record<AcaoAuditada, string> = {
  criar: "Criou",
  editar: "Editou",
  excluir: "Excluiu",
  inativar: "Inativou",
  reativar: "Reativou",
}
