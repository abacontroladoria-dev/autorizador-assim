import type { SupabaseClient } from "@supabase/supabase-js"
import type { Ator } from "@/lib/insumos/auth"
import { SolicitacaoNaoEncontradaError, TransicaoInvalidaError, traduzirErroDoBanco } from "@/lib/insumos/erros"
import { resolvedorDeterministico } from "@/lib/insumos/item-padrao"
import type { StatusSolicitacaoCompra } from "@/lib/insumos/tipos"
import type {
  AtualizarSolicitacaoInput,
  CriarSolicitacaoInput,
} from "../dto/solicitacao.dto"

// ----------------------------------------------------------------------------
// Service de solicitações. Porta ComprasService do AXIUM.
//
// DUAS SIMPLIFICAÇÕES QUE O PORTE PERMITIU — não são omissões:
//
// 1. Sumiu o loop por `unidadesVisiveis`. No AXIUM, `listar` e `buscarPorId`
//    varriam as empresas visíveis uma a uma chamando `forTenant` em cada, porque
//    a RLS de lá dependia de um `set_config` por transação e não sabia sozinha o
//    que o usuário podia ver. A RLS de 20260817200000 sabe: as policies filtram
//    por `insumos_empresas_do_usuario()`. Um SELECT direto já devolve só o
//    permitido, de todas as empresas do usuário de uma vez.
//
// 2. Escritas compostas viraram RPC. `forTenant(async tx => …)` era transação de
//    verdade; o PostgREST não tem. As funções de 20260818090000 fazem esse papel.
//    Regra para quem for estender: se a operação escreve em mais de uma tabela,
//    ela pertence a uma RPC, não a duas chamadas seguidas daqui.
// ----------------------------------------------------------------------------

// Só não dá para editar depois que a decisão foi tomada ou a compra começou.
const STATUS_NAO_EDITAVEIS: StatusSolicitacaoCompra[] = [
  "APROVADA", "REPROVADA", "COMPRA_REALIZADA", "AGUARDANDO_ENTREGA", "ENTREGUE", "CANCELADA",
]

// Pausa é operacional — estado final não pausa, só se retoma.
const STATUS_PAUSAVEIS: StatusSolicitacaoCompra[] = [
  "SOLICITACAO_CRIADA", "COTACAO_EM_ANDAMENTO", "COTACAO_FINALIZADA", "REVISAO_MANUAL", "AGUARDANDO_APROVACAO",
]

const SELECT_LISTA = `
  id, empresa_id, setor, categoria, categoria_outro, prioridade, status,
  nome_item, descricao_detalhada, quantidade, unidade_medida,
  valor_maximo_estimado, prazo_maximo_entrega_dias,
  solicitante_id, solicitante_externo_nome, data_solicitacao, criado_em, atualizado_em,
  solicitante:usuarios!solicitacoes_compra_solicitante_id_fkey(nome),
  empresa:empresas(nome_fantasia),
  item_padrao:itens_padrao_compra(nome)
`

const SELECT_DETALHE = `
  *,
  solicitante:usuarios!solicitacoes_compra_solicitante_id_fkey(nome),
  empresa:empresas(nome_fantasia),
  item_padrao:itens_padrao_compra(nome),
  cotacoes:cotacoes_compra(*),
  historico:historico_status_compra(*),
  jobs:cotacao_jobs(id, status, erro, tentativas, criado_em, iniciado_em, concluido_em)
`

/** camelCase da API -> snake_case do banco. Um lugar só, para o de-para não divergir. */
const DE_PARA: Record<string, string> = {
  setor: "setor",
  categoria: "categoria",
  categoriaOutro: "categoria_outro",
  prioridade: "prioridade",
  justificativaCompra: "justificativa_compra",
  nomeItem: "nome_item",
  descricaoDetalhada: "descricao_detalhada",
  quantidade: "quantidade",
  unidadeMedida: "unidade_medida",
  marcaDesejada: "marca_desejada",
  modeloDesejado: "modelo_desejado",
  cor: "cor",
  tamanhoMedidaCapacidade: "tamanho_medida_capacidade",
  material: "material",
  imagemAnexoUrl: "imagem_anexo_url",
  linkReferencia: "link_referencia",
  marketplacePermitido: "marketplace_permitido",
  prazoMaximoEntregaDias: "prazo_maximo_entrega_dias",
  valorMaximoEstimado: "valor_maximo_estimado",
  fornecedorSugerido: "fornecedor_sugerido",
  aceitaSimilar: "aceita_similar",
  aceitaOutraMarca: "aceita_outra_marca",
  somenteNovo: "somente_novo",
  aceitaUsado: "aceita_usado",
  somenteCompraNacional: "somente_compra_nacional",
}

function paraColunas(input: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(input)) {
    const coluna = DE_PARA[chave]
    if (coluna && valor !== undefined) saida[coluna] = valor
  }
  return saida
}

/**
 * Resolve o item padrão pelo nome + descrição, usando os sinônimos curados.
 * Item sem sinônimo que bata fica sem item padrão — não inventa categoria.
 */
async function resolverItemPadrao(
  supabase: SupabaseClient,
  nomeItem: string,
  descricaoDetalhada: string
): Promise<string | null> {
  const { data, error } = await supabase.from("sinonimos_item_compra").select("item_padrao_id, termo")
  if (error) throw traduzirErroDoBanco(error)

  const sinonimos = (data ?? []).map((s: { item_padrao_id: string; termo: string }) => ({
    itemPadraoId: s.item_padrao_id,
    termo: s.termo,
  }))
  return resolvedorDeterministico.resolver(`${nomeItem} ${descricaoDetalhada}`, sinonimos)
}

export async function criarSolicitacao(
  supabase: SupabaseClient,
  ator: Ator,
  input: CriarSolicitacaoInput,
  externo?: { nome: string; email: string }
) {
  const itemPadraoId = await resolverItemPadrao(supabase, input.nomeItem, input.descricaoDetalhada)

  const { data, error } = await supabase.rpc("insumos_criar_solicitacao", {
    p_dados: {
      ...paraColunas(input as unknown as Record<string, unknown>),
      empresa_id: ator.empresaId,
      solicitante_id: ator.usuarioId,
      item_padrao_id: itemPadraoId,
      solicitante_externo_nome: externo?.nome ?? null,
      solicitante_externo_email: externo?.email ?? null,
    },
  })

  if (error) throw traduzirErroDoBanco(error)
  return data
}

export async function listarSolicitacoes(
  supabase: SupabaseClient,
  filtro: { status?: StatusSolicitacaoCompra; limit: number; offset: number }
) {
  let query = supabase
    .from("solicitacoes_compra")
    .select(SELECT_LISTA, { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(filtro.offset, filtro.offset + filtro.limit - 1)

  if (filtro.status) query = query.eq("status", filtro.status)

  const { data, error, count } = await query
  if (error) throw traduzirErroDoBanco(error)
  return { data: data ?? [], count: count ?? 0 }
}

/**
 * Detalhe de uma solicitação. Tipado à mão porque o client é
 * `createBrowserClient<any>` (convenção do projeto — não há `Database` gerado
 * alcançável pelo alias `@/*`). Só os campos que o service e as rotas realmente
 * leem estão declarados; o resto passa pela index signature.
 */
export type SolicitacaoDetalhe = Record<string, unknown> & {
  id: string
  empresa_id: string
  status: StatusSolicitacaoCompra
  categoria: string
  categoria_outro: string | null
  nome_item: string
  descricao_detalhada: string
  tamanho_medida_capacidade: string | null
  cotacoes: { valor_decisao: number }[]
  historico: { status_novo: string; status_anterior: string | null; criado_em: string }[]
  jobs: { criado_em: string }[]
}

export async function buscarSolicitacao(
  supabase: SupabaseClient,
  id: string
): Promise<SolicitacaoDetalhe> {
  const { data, error } = await supabase
    .from("solicitacoes_compra")
    .select(SELECT_DETALHE)
    .eq("id", id)
    .maybeSingle()

  if (error) throw traduzirErroDoBanco(error)
  if (!data) throw new SolicitacaoNaoEncontradaError()

  // Ordenação das coleções feita aqui, e não no PostgREST: ordenar tabela
  // embutida depende da versão da API, e uma mudança silenciosa de ordem
  // quebraria o `retomar`, que lê a última pausa do histórico.
  const registro = data as unknown as SolicitacaoDetalhe

  return {
    ...registro,
    cotacoes: [...(registro.cotacoes ?? [])].sort(
      (a, b) => Number(a.valor_decisao) - Number(b.valor_decisao)
    ),
    historico: [...(registro.historico ?? [])].sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    jobs: [...(registro.jobs ?? [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
  }
}

export async function atualizarSolicitacao(
  supabase: SupabaseClient,
  id: string,
  input: AtualizarSolicitacaoInput
) {
  const atual = await buscarSolicitacao(supabase, id)
  const status = atual.status

  if (STATUS_NAO_EDITAVEIS.includes(status)) {
    throw new TransicaoInvalidaError(`Não é possível editar uma solicitação com status "${status}".`)
  }

  const categoria = input.categoria ?? atual.categoria
  const categoriaOutro =
    categoria === "OUTROS" ? (input.categoriaOutro ?? atual.categoria_outro)?.trim() : null
  if (categoria === "OUTROS" && !categoriaOutro) {
    throw new TransicaoInvalidaError("Informe qual é a categoria da compra.")
  }

  const nomeItem = input.nomeItem ?? atual.nome_item
  const descricao = input.descricaoDetalhada ?? atual.descricao_detalhada
  const itemPadraoId = await resolverItemPadrao(supabase, nomeItem, descricao)

  const { data, error } = await supabase
    .from("solicitacoes_compra")
    .update({
      ...paraColunas(input as Record<string, unknown>),
      categoria_outro: categoriaOutro,
      item_padrao_id: itemPadraoId,
    })
    .eq("id", id)
    .select()
    .maybeSingle()

  if (error) throw traduzirErroDoBanco(error)
  if (!data) throw new SolicitacaoNaoEncontradaError()

  // Editar serve para melhorar a busca com mais detalhe, então dispara nova
  // cotação. Exceção: PAUSADA foi intencional e não destrava sozinha.
  if (status !== "PAUSADA") {
    const { error: erroFila } = await supabase.rpc("insumos_reenviar_cotacao", {
      p_solicitacao_id: id,
      p_observacao: "Solicitação editada — nova cotação solicitada",
    })
    if (erroFila) throw traduzirErroDoBanco(erroFila)
  }

  return { antes: atual, depois: data }
}

export async function excluirSolicitacao(supabase: SupabaseClient, id: string) {
  const atual = await buscarSolicitacao(supabase, id)
  const { error } = await supabase.rpc("insumos_excluir_solicitacao", { p_solicitacao_id: id })
  if (error) throw traduzirErroDoBanco(error)
  return atual
}

export async function pausarSolicitacao(supabase: SupabaseClient, id: string, motivo?: string) {
  const atual = await buscarSolicitacao(supabase, id)
  const status = atual.status

  if (!STATUS_PAUSAVEIS.includes(status)) {
    throw new TransicaoInvalidaError(`Não é possível pausar uma solicitação com status "${status}".`)
  }

  const { data, error } = await supabase.rpc("insumos_atualizar_status", {
    p_solicitacao_id: id,
    p_novo_status: "PAUSADA",
    p_origem: "USUARIO",
    p_observacao: motivo ?? null,
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: atual, depois: data }
}

export async function retomarSolicitacao(supabase: SupabaseClient, id: string) {
  const atual = await buscarSolicitacao(supabase, id)
  if (atual.status !== "PAUSADA") throw new TransicaoInvalidaError("Solicitação não está pausada.")

  // Para onde voltar sai do histórico: a última entrada que levou a PAUSADA
  // guarda de onde viemos. É por isso que a troca de status e o histórico têm
  // de ser atômicos — sem o registro, a solicitação fica presa em PAUSADA.
  const historico = atual.historico as { status_novo: string; status_anterior: string | null }[]
  const ultimaPausa = [...historico].reverse().find((h) => h.status_novo === "PAUSADA")

  if (!ultimaPausa?.status_anterior) {
    throw new TransicaoInvalidaError("Não foi possível determinar para qual status retomar.")
  }

  const { data, error } = await supabase.rpc("insumos_atualizar_status", {
    p_solicitacao_id: id,
    p_novo_status: ultimaPausa.status_anterior,
    p_origem: "USUARIO",
    p_observacao: null,
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: atual, depois: data }
}

export async function reenviarParaCotacao(supabase: SupabaseClient, id: string) {
  const atual = await buscarSolicitacao(supabase, id)
  const status = atual.status

  if (STATUS_NAO_EDITAVEIS.includes(status) || status === "PAUSADA") {
    throw new TransicaoInvalidaError(`Não é possível reenviar uma solicitação com status "${status}".`)
  }

  const { data, error } = await supabase.rpc("insumos_reenviar_cotacao", {
    p_solicitacao_id: id,
    p_observacao: "Cotação reenviada para processamento",
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: atual, depois: data }
}

/**
 * Escape hatch: não valida a transição, de propósito — serve para destravar uma
 * solicitação presa. No AXIUM exigia permissão em escopo CONSOLIDADO; aqui a
 * rota é gated pela permissão do Pulsar. Sempre auditado.
 */
export async function alterarStatusManualmente(
  supabase: SupabaseClient,
  id: string,
  status: StatusSolicitacaoCompra,
  observacao?: string
) {
  const atual = await buscarSolicitacao(supabase, id)
  const { data, error } = await supabase.rpc("insumos_atualizar_status", {
    p_solicitacao_id: id,
    p_novo_status: status,
    p_origem: "USUARIO",
    p_observacao: observacao ?? null,
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: atual, depois: data }
}
