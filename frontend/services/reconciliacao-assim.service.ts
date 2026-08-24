import { getSupabaseClient } from '@/lib/supabase/client'
import type { CandidataVinculo, GuiaOrfa } from '@/components/auditoria-assim/types'

const supabase = getSupabaseClient()

/**
 * Guias da ASSIM que sobraram do match posicional da Conferência.
 *
 * "Sobraram" é literal: dentro da partição (empresa, matrícula, dep, dia, TUSS),
 * a n-ésima autorização casa com a n-ésima sessão. Uma glosa que depois foi
 * reautorizada no portal deixa a partição com uma guia a mais que sessões — e é
 * essa guia excedente que aparece aqui.
 *
 * O critério inteiro vive na RPC, de propósito: ele depende do mesmo recorte de
 * agenda que a Conferência usa (convênio, blacklist de terapias, exclusão de
 * falta), e uma segunda cópia dele no cliente divergiria na primeira mudança.
 */
export async function listarGuiasOrfas(de: string, ate: string): Promise<GuiaOrfa[]> {
  const { data, error } = await supabase.rpc('get_guias_orfas', { p_de: de, p_ate: ate })

  if (error) {
    console.error('Erro ao buscar guias órfãs:', error.message, error.details)
    throw error
  }
  return (data || []) as GuiaOrfa[]
}

/**
 * Sessões que a guia selecionada poderia estar cobrindo.
 *
 * Janela retroativa: a autorização externa vem DEPOIS da sessão. O default de 7
 * dias saiu da medição de 2026-08-20 — distância máxima observada +3,16 dias
 * (p99 +3,15d) sobre as 18 órfãs reais do período. 3 dias perderia o lote de
 * reautorização em bloco; 5 e 7 dão resultado idêntico.
 *
 * Pode demorar alguns segundos: a RPC chama get_auditoria_assim_periodo uma
 * fatia de dia por vez, porque em janela de 7 dias ela estoura o
 * statement_timeout. É o preço de a `situacao` daqui ser exatamente a mesma que
 * a Conferência mostra, em vez de uma segunda implementação do mesmo CASE.
 */
export async function listarCandidatasVinculo(
  guia: string,
  janelaDias = 7
): Promise<CandidataVinculo[]> {
  const { data, error } = await supabase.rpc('get_candidatas_vinculo', {
    p_guia: guia,
    p_janela_dias: janelaDias,
  })

  if (error) {
    console.error('Erro ao buscar candidatas:', error.message, error.details)
    throw error
  }
  return (data || []) as CandidataVinculo[]
}

/**
 * Grava o vínculo guia -> sessão.
 *
 * Nenhuma validação aqui: beneficiário, TUSS, janela e unicidade são checados
 * dentro da RPC. O vínculo muda o que o faturamento considera coberto, então a
 * regra tem de estar onde o cliente não alcança.
 *
 * `filaId` é rastreabilidade da solicitação original, não cobertura — vem nulo
 * quando a sessão nunca foi solicitada pelo Pulsar.
 */
export async function vincularAutorizacao(params: {
  guia: string
  blocoId: string
  filaId?: string | null
  observacao?: string | null
  janelaDias?: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('vincular_autorizacao', {
    p_guia: params.guia,
    p_bloco_id: params.blocoId,
    p_fila_id: params.filaId ?? null,
    p_observacao: params.observacao ?? null,
    p_janela_dias: params.janelaDias ?? 7,
  })

  if (error) throw error
  return data as string
}

/**
 * Marca a guia como autorização extra, sem sessão correspondente.
 *
 * Não é enfeite: 7 das 18 órfãs medidas na Etapa 0 têm como candidata mais
 * próxima uma sessão JÁ liberada. Vinculá-las afirmaria uma cobertura que não
 * existe; sem esta ação elas voltariam à fila de trabalho todo dia, para sempre.
 */
export async function marcarGuiaSemSessao(
  guia: string,
  observacao?: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc('marcar_guia_sem_sessao', {
    p_guia: guia,
    p_observacao: observacao ?? null,
  })

  if (error) throw error
  return data as string
}

/** Desfaz por soft delete: guarda quem desfez e por quê, e a guia volta à fila. */
export async function desvincularAutorizacao(
  vinculoId: string,
  motivo?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('desvincular_autorizacao', {
    p_vinculo_id: vinculoId,
    p_motivo: motivo ?? null,
  })

  if (error) throw error
}
