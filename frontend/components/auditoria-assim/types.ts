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

/**
 * Uma guia da ASSIM que sobrou do match posicional da Conferência.
 *
 * `ordem_autorizacao` / `sessoes_na_particao` não são enfeite de depuração: são
 * a prova do porquê a guia está aqui. "ordem 2 de 1 sessão" diz, na própria
 * linha, que a partição tinha uma sessão só e esta é a segunda autorização —
 * exatamente o caso da glosa reautorizada por fora.
 */
export type GuiaOrfa = {
  guia: string
  /** Carteirinha pontuada `empresa.matricula.dep`, como vem de autorizacoes_assim. */
  carteirinha: string | null
  paciente_id: number | null
  paciente_nome: string | null
  /** Instante da autorização no portal — NÃO é a data do atendimento. */
  data_execucao: string | null
  codigo_tuss: string | null
  status: string | null
  teve_token: boolean | null
  token: string | null
  biofacial: string | null
  ordem_autorizacao: number | null
  sessoes_na_particao: number | null
}

/** Uma sessão que a guia órfã selecionada poderia estar cobrindo. */
export type CandidataVinculo = {
  bloco_id: string
  paciente_id: string | null
  paciente_nome: string | null
  data_atendimento: string | null
  hora_inicial: string | null
  codigo_tuss: string | null
  terapias: string | null
  profissionais: string | null
  quantidade_sessoes: number | null
  /** Mesma `situacao` que a Conferência mostra — vem da mesma RPC. */
  situacao: string | null
  /** A guia que hoje está casada com esta sessão (a glosada, tipicamente). */
  guia_atual: string | null
  status_assim: string | null
  motivo_glosa_codigo: string | null
  motivo_glosa_descricao: string | null
  /** Anotação escrita à mão no modal da Conferência (auditoria_glosa_motivos). */
  nota_manual: string | null
  observacao: string | null
  /** Solicitação original do Pulsar, quando existe. Nula no cenário sem solicitação. */
  fila_id: string | null
  /** Negativo = autorização saiu ANTES da sessão. */
  distancia_horas: number | null
  ja_vinculado: boolean | null
  /** Falso para sessão já LIBERADA ou já vinculada: visível, mas não escolhível. */
  elegivel: boolean | null
}
