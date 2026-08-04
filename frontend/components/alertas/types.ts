// Central de Alertas — tipos compartilhados.
// Espelham as RPCs de 20260730100100_alertas_rpcs.sql.

export type AlertaOrigem = 'sistema' | 'manual'
export type AlertaStatus = 'aberto' | 'em_andamento' | 'resolvido'
export type AlertaPrioridade = 'baixa' | 'media' | 'alta' | 'critica'

/**
 * Snapshot desnormalizado do atendimento, gravado em alertas.entidade_ref.
 *
 * token/guia/codigo_erro/situacao existem para a tabela mostrar esses números
 * INLINE, como na planilha que este módulo substitui. Todos opcionais: alertas
 * gerados antes de 20260730100200 (e os de origem manual) não os têm, e a UI
 * precisa degradar para "—" em vez de quebrar.
 */
export type AlertaEntidadeRef = {
  paciente_nome?: string | null
  data?: string | null
  hora?: string | null
  terapia?: string | null
  profissional?: string | null
  tuss?: string | null
  token?: string | null
  guia?: string | null
  codigo_erro?: string | null
  situacao?: string | null
}

/** Retorno de get_alertas(). */
export type Alerta = {
  id: string
  modulo: string
  regra_codigo: string | null
  regra_nome: string | null
  origem: AlertaOrigem
  entidade_tipo: string
  entidade_id: string
  entidade_ref: AlertaEntidadeRef
  titulo: string
  descricao: string | null
  prioridade: AlertaPrioridade
  status: AlertaStatus
  setor_destino: string | null
  criado_por: string | null
  criado_por_nome: string | null
  criado_em: string
  resolvido_em: string | null
  resolucao: 'automatico' | 'manual' | null
  total_eventos: number
}

/** Retorno de get_alertas_contadores(). */
export type AlertasContadores = {
  abertos: number
  em_andamento: number
  criticos: number
  total_pendente: number
  /** Fechadas hoje (hora local). É o registro de "conferi tudo". */
  conferidas_hoje: number
}

/**
 * Retorno de get_alerta_historico().
 *
 * `status` e `created_at` têm esses nomes de propósito: o componente
 * components/central/Timeline.tsx já consome esse contrato, então a timeline
 * renderiza sem alteração nenhuma nele.
 */
export type AlertaEvento = {
  id: number
  alerta_id: string | null
  status: string
  tipo: string
  autor_tipo: 'sistema' | 'usuario' | 'robo'
  autor_nome: string | null
  descricao: string
  metadata: Record<string, unknown>
  created_at: string
  erro: string | null
}
