export type AuditoriaAssimItem = {
  bloco_id: string | null
  paciente_id: string | null
  paciente_nome: string | null
  /**
   * A carteirinha pontuada (`empresa.matricula.dep`) que a RPC monta a partir de
   * `agenda_tita.numero_carteirinha`. É a chave que casa com
   * `autorizacoes_assim.matricula`, e por isso a Análise de Reincidência depende
   * dela. Nula nas linhas de falta, que são sintetizadas no serviço.
   */
  carteirinha: string | null
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
  /**
   * Glosas que uma autorização externa passou a cobrir (aba Reconciliação).
   * Fora de `glosas` de propósito: aquele card dimensiona trabalho a fazer, e
   * estas não pedem nada. Aparece como dica no card de Glosas — ver a nota em
   * situacoes.ts.
   */
  glosas_resolvidas: number
  tokens: number
}

export type AuditoriaFilters = {
  paciente: string
  situacao: string
  data: string
  horario_bloco: string
}

/**
 * Uma autorização como a ASSIM a registrou, lida direto de `autorizacoes_assim`.
 *
 * Existe separada de `AuditoriaAssimItem` porque a auditoria é dirigida pela
 * SESSÃO: ela só mostra autorização que casou com uma sessão agendada. A que
 * sobrou — a excedente, que é justamente a que estoura a cota semanal e provoca
 * a glosa 1601 — não tem sessão para se pendurar e por isso não existe em
 * `AuditoriaAssimItem` nenhum.
 *
 * `data_execucao` é `timestamp without time zone` guardando hora de São Paulo.
 * Lido cru pelo PostgREST chega sem sufixo de fuso: formatar por fatia de
 * string, nunca via `new Date()`.
 */
export type AutorizacaoAssimSemana = {
  guia: string
  matricula: string | null
  paciente_nome: string | null
  data_execucao: string | null
  status: string | null
  codigo_tuss: string | null
  codigo_erro: string | null
  descricao_erro: string | null
  teve_token: boolean | null
  token: string | null
}

/**
 * O placar de um TUSS na semana: a cota (o que estava agendado) contra o que a
 * ASSIM de fato processou.
 *
 * `excedente` mede sobre `liberadas`, não sobre `autorizadas` — recusa não
 * consome cota. Os dois números ficam visíveis para que a diferença entre
 * "pediram demais" e "pediram e levaram demais" não se perca.
 */
export type PlacarTuss = {
  codigo_tuss: string
  terapias: string
  agendadas: number
  autorizadas: number
  liberadas: number
  excedente: number
}

/** O que a Análise de Reincidência precisa saber para abrir já resolvida. */
export type AlvoAnalise = {
  pacienteNome: string | null
  /** Vem preenchida quando se abre pela linha; pela busca livre, nasce nula. */
  carteirinha: string | null
  /** Qualquer dia da semana a exibir — o hook recua até a segunda. */
  data: string
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
