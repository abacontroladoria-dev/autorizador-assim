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
  /**
   * Das `agendadas`, as que já aconteceram (data <= hoje, ou a semana inteira se
   * ela já passou). É sobre estas — nunca sobre a semana toda — que "autorização
   * faltando" faz sentido: numa segunda-feira, cobrar cobertura do que a clínica
   * ainda vai atender na sexta transformaria toda a agenda em pendência.
   */
  decorridas: number
  autorizadas: number
  liberadas: number
  /** `Liberado *` — saiu e foi desfeita. Não entra em `liberadas`. */
  canceladas: number
  /** Positivo = autorização a mais do que sessão agendada. Mede sobre `liberadas`. */
  excedente: number
  /**
   * Sessão já ocorrida sem liberação que a cubra, contada UMA A UMA por
   * `sessaoSemCobertura` — não é `decorridas − liberadas`. A diferença é o que
   * permite a grade apontar o cartão: cada unidade deste número é uma sessão
   * que existe na tela. Nunca negativo.
   */
  faltante: number
}

/**
 * As cinco espécies de pendência que a listagem mensal indexa.
 *
 * Três vêm do `ledger` (o estado das guias) e duas do `placar` (a cota por
 * TUSS). Ficam num tipo só porque a listagem as trata igual: cada uma é uma
 * coluna, um contador e um filtro — e um sexto valor entrando aqui tem de
 * ganhar as três formas de uma vez.
 */
export type TipoPendencia = 'glosa' | 'cancelamento' | 'sem-vinculo' | 'faltando' | 'sobrando'

/** Os cinco contadores de um paciente no mês, mais o total. */
export type ContagemPendencias = Record<TipoPendencia, number> & { total: number }

/**
 * Uma linha da listagem "Autorizações com pendências".
 *
 * `carteirinhas` é plural porque a carteirinha, e não o nome, é o que casa com
 * `autorizacoes_assim.matricula` — e um mesmo paciente pode ter mais de uma
 * (dependente que troca de titular, recadastro). Somá-las aqui é o que faz o
 * modal abrir sem buscar nada: ele recorta, dentro do mês já carregado, a
 * semana a mostrar por estas chaves.
 *
 * `pacienteIds` com mais de um elemento significa homônimos somados na mesma
 * linha — dito em tela, nunca escolhido em silêncio.
 */
export type PacientePendencias = {
  /** Carteirinha quando existe, `nome:<NOME>` quando o paciente só tem falta. */
  chave: string
  nome: string
  carteirinhas: string[]
  pacienteIds: string[]
  /** `convenio_nome` da agenda. Nesta aba é sempre um plano da ASSIM. */
  plano: string | null
  /** Inferida da sala agendada. Nula quando a origem não informou. */
  unidade: string | null
  contagem: ContagemPendencias
  sessoes: number
  /** Instante da autorização mais recente do mês. Não é a data do atendimento. */
  ultimaAutorizacao: string | null
}

/**
 * Um cartão dentro de uma célula da grade semanal.
 *
 * Duas espécies, porque a grade mostra duas coisas no mesmo eixo: a SESSÃO que a
 * clínica agendou (posicionada pelo horário do atendimento) e a AUTORIZAÇÃO que
 * não casou com sessão nenhuma (posicionada pelo dia em que a ASSIM a
 * registrou). A segunda é justamente a que não aparece em tela nenhuma do
 * sistema — é ela que estoura a cota semanal.
 *
 * As duas carregam `terapia` porque a grade é indexada por HORÁRIO, não por
 * terapia: o nome dela deixou de ser o cabeçalho da linha e passou a ser
 * informação do cartão, senão o atendimento chega ao olho como um par de números
 * sem assunto.
 */
export type CartaoGrade =
  | {
      tipo: 'sessao'
      chave: string
      /** `hora_inicial` do atendimento. */
      hora: string
      codigo_tuss: string | null
      guia: string | null
      situacao: string | null
      terapia: string | null
      /** Profissional, ou o motivo quando a linha é uma falta. */
      legenda: string | null
      /**
       * A sessão já ocorreu e ninguém a liberou. É o "faltando" da listagem
       * virado objeto: sem esta marca o número existia e a sessão não, e a
       * pessoa tinha de adivinhar qual das cinco do dia era a descoberta.
       */
      semCobertura: boolean
      /**
       * O texto da recusa, ainda cru. Pode vir já decomposto pela RPC
       * (`descricao_erro`) ou no formato "1601-REINCIDENCIA NO ATEN" cortado em
       * 25 caracteres (`motivo_glosa`) — quem resolve é `lib/glosa`, no cartão,
       * porque só lá existe o de-para de códigos.
       */
      motivoBruto: string | null
      teve_token: boolean | null
      token: string | null
    }
  | {
      tipo: 'autorizacao'
      chave: string
      /** Hora de `data_execucao` — quando a ASSIM registrou, não quando atendeu. */
      hora: string
      codigo_tuss: string | null
      guia: string
      /**
       * O nome da terapia do TUSS da guia, quando a semana o revela. Guia de um
       * TUSS sem sessão nenhuma (a "sobrando" pura) não tem de onde tirar nome —
       * fica nula, e o cartão mostra só o código.
       */
      terapia: string | null
      /** Ver `EstadoAutorizacao` em reconciliacao/LinhaAutorizacao.tsx. */
      estado: 'sem-vinculo' | 'fora-da-semana'
      /**
       * Esta liberação passou da cota do TUSS na semana. O "sobrando" da
       * listagem virado objeto, por atribuição posicional em `data_execucao` —
       * ver `guiasExcedentes` em useAnaliseReincidencia.
       */
      excedente: boolean
      status: string | null
      descricao_erro: string | null
      teve_token: boolean | null
      token: string | null
    }

/**
 * Uma linha da grade: uma faixa de horário e os 5 dias úteis dela.
 *
 * A linha é a HORA CHEIA ("14:00"), não o horário exato do atendimento. A sessão
 * da clínica cai em passos de 40 minutos e `data_execucao` de uma guia é o
 * instante em que a ASSIM respondeu — 14:34, 09:07. Uma linha por horário exato
 * daria uma escala de dezenas de faixas com um cartão em cada, que é o oposto de
 * uma agenda: o horário cheio agrupa, e o minuto exato continua impresso no
 * cartão.
 */
export type LinhaGrade = {
  /** "08:00" … "18:00", ou "—" na faixa dos atendimentos sem horário. */
  hora: string
  /** Indexado pela data ISO do dia útil. */
  celulas: Record<string, CartaoGrade[]>
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
