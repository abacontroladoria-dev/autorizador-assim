export type AuditoriaAssimItem = {
  bloco_id: string | null
  paciente_id: string | null
  paciente_nome: string | null
  data_atendimento: string | null
  hora_inicial: string | null
  codigo_tuss: string | null
  convenio_nome: string | null
  terapias: string | null
  profissionais: string | null
  quantidade_sessoes: number | null
  guia: string | null
  status_assim: string | null
  codigo_erro: string | null
  descricao_erro: string | null
  data_execucao: string | null
  situacao: string | null
  prioridade: number | null
  dias_atraso: number | null
  possui_autorizacao: boolean | null
  possui_solicitacao: boolean | null
  observacao: string | null
  motivo_glosa: string | null
  teve_token: boolean | null
  token: string | null
  criado_por: string | null
  forma_autorizacao: string | null
  horario_autorizacao: string | null
  observacao_manual: string | null
  observacao_manual_atualizado_em: string | null
  observacao_manual_atualizado_por_nome: string | null
  token_conferido: boolean | null
  token_conferido_em: string | null
  token_conferido_por_nome: string | null
}

export type KpisAuditoriaAssim = {
  total: number
  liberadas: number
  faltas: number
  faltas_terapeuta: number
  nao_solicitadas: number
  sincronizando: number
  retorno_nao_confirmado: number
  canceladas: number
  glosas: number
  tokens: number
}

export type AuditoriaFilters = {
  paciente: string
  situacao: string
  data: string
  horario_bloco: string
}

export type TokenMensalItem = {
  bloco_id: string | null
  paciente_id: string | null
  paciente_nome: string | null
  data_atendimento: string | null
  hora_inicial: string | null
  codigo_tuss: string | null
  terapias: string | null
  profissionais: string | null
  guia: string | null
  token: string | null
  data_execucao: string | null
  criado_por: string | null
  forma_autorizacao: string | null
  token_conferido: boolean | null
  token_conferido_em: string | null
  token_conferido_por_nome: string | null
}
