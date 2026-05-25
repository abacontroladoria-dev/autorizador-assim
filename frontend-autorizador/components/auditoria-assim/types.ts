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
}

export type KpisAuditoriaAssim = {
  total: number
  liberadas: number
  faltas: number
  nao_solicitadas: number
  sincronizando: number
  retorno_nao_confirmado: number
  canceladas: number
  glosas: number
}

export type AuditoriaFilters = {
  paciente: string
  situacao: string
  data: string
  tuss: string
}
