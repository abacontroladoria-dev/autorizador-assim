import type { SupabaseClient } from "@supabase/supabase-js"
import { TransicaoInvalidaError, traduzirErroDoBanco } from "@/lib/insumos/erros"
import { SCORE_MINIMO_COMPATIBILIDADE, calcularScoreCompatibilidade } from "@/lib/insumos/compatibilidade"
import { arredondarMetadeParaCima, calcularValorDecisao } from "@/lib/insumos/precificacao"
import type { StatusSolicitacaoCompra } from "@/lib/insumos/tipos"
import type { CriarCotacaoManualInput, DecidirAprovacaoInput, RegistrarCompraInput } from "../dto/fluxo.dto"
import { buscarSolicitacao } from "./solicitacoes.service"

// Fluxo: aprovação, cotação manual, compra e entrega.
// Porta AprovacaoService e CompraService do AXIUM.
//
// A validação de status aparece aqui E dentro das RPCs de propósito. Aqui ela dá
// erro claro antes de tocar o banco; lá ela é a que vale, porque uma chamada
// direta à API não passa por este arquivo.

// Status em que uma cotação manual boa ainda destrava a aprovação sozinha.
const STATUS_ANTES_DA_APROVACAO: StatusSolicitacaoCompra[] = [
  "SOLICITACAO_CRIADA", "COTACAO_EM_ANDAMENTO", "COTACAO_FINALIZADA", "REVISAO_MANUAL",
]

export async function decidirAprovacao(
  supabase: SupabaseClient,
  id: string,
  input: DecidirAprovacaoInput
) {
  const atual = await buscarSolicitacao(supabase, id)
  const status = atual.status

  if (status !== "AGUARDANDO_APROVACAO") {
    throw new TransicaoInvalidaError(
      `Não é possível decidir aprovação de uma solicitação com status "${status}".`
    )
  }

  const { data, error } = await supabase.rpc("insumos_decidir_aprovacao", {
    p_solicitacao_id: id,
    p_decisao: input.decisao,
    p_cotacao_escolhida_id: input.cotacaoEscolhidaId ?? null,
    p_justificativa: input.justificativa ?? null,
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: atual, depois: data }
}

/**
 * Cotação manual: os valores derivados são calculados aqui, em TypeScript, pela
 * mesma lógica que o worker usa (lib/insumos/precificacao + compatibilidade).
 * A RPC só persiste — precificação tem testes e não deve ser reescrita em SQL.
 */
export async function criarCotacaoManual(
  supabase: SupabaseClient,
  id: string,
  input: CriarCotacaoManualInput
) {
  const solicitacao = await buscarSolicitacao(supabase, id)

  // Mesma especificação usada pelo worker — a automação avalia a compatibilidade
  // também da cotação incluída à mão.
  const especificacaoTecnica = [
    solicitacao.nome_item,
    solicitacao.descricao_detalhada,
    solicitacao.tamanho_medida_capacidade,
  ]
    .filter(Boolean)
    .join(" ")

  const valorTotalProdutos = arredondarMetadeParaCima(input.valorUnitario * input.quantidade)
  const valorTotalComFrete = arredondarMetadeParaCima(valorTotalProdutos + (input.frete ?? 0))

  // Só uma das duas faz sentido: o anúncio ou oferece parcelamento sem juros, ou
  // com juros. Guardar as duas produziria ranking ambíguo.
  const valorTotalParcelasSemJuros = input.condicaoSemJuros ? (input.valorTotalParcelasSemJuros ?? null) : null
  const valorTotalParcelasComJuros = !input.condicaoSemJuros ? (input.valorTotalParcelasComJuros ?? null) : null

  const { valorDecisao, formaPagamentoDecisao } = calcularValorDecisao({
    valorAVista: valorTotalComFrete,
    valorParceladoSemJuros: valorTotalParcelasSemJuros,
    valorParceladoComJuros: valorTotalParcelasComJuros,
  })

  const parcelamentoComJuros = Boolean(input.parcelamentoDescricao) && !input.condicaoSemJuros
  const scoreCompatibilidade = calcularScoreCompatibilidade(especificacaoTecnica, input.produtoEncontrado)

  // Se bate o score mínimo e ainda não chegou em aprovação, destrava sozinha —
  // é assim que REVISAO_MANUAL sai de lá quando alguém inclui uma cotação melhor.
  const promover =
    scoreCompatibilidade >= SCORE_MINIMO_COMPATIBILIDADE &&
    STATUS_ANTES_DA_APROVACAO.includes(solicitacao.status)

  const { data, error } = await supabase.rpc("insumos_criar_cotacao_manual", {
    p_solicitacao_id: id,
    p_promover: promover,
    p_dados: {
      fornecedor: input.fornecedor,
      produto_encontrado: input.produtoEncontrado,
      valor_unitario: input.valorUnitario,
      quantidade: input.quantidade,
      valor_total_produtos: valorTotalProdutos,
      frete: input.frete ?? null,
      valor_total_com_frete: valorTotalComFrete,
      parcelamento_descricao: input.parcelamentoDescricao ?? null,
      condicao_sem_juros: input.condicaoSemJuros,
      valor_total_parcelas_sem_juros: valorTotalParcelasSemJuros,
      valor_total_parcelas_com_juros: valorTotalParcelasComJuros,
      valor_decisao: valorDecisao,
      forma_pagamento_decisao: formaPagamentoDecisao,
      parcelamento_com_juros: parcelamentoComJuros,
      prazo_entrega_descricao: input.prazoEntregaDescricao ?? null,
      prazo_entrega_ordem_dias: input.prazoEntregaOrdemDias ?? null,
      link_produto: input.linkProduto,
      origem: input.origem,
      score_compatibilidade: scoreCompatibilidade,
    },
  })

  if (error) throw traduzirErroDoBanco(error)
  return data
}

export async function registrarCompra(
  supabase: SupabaseClient,
  id: string,
  input: RegistrarCompraInput
) {
  const solicitacao = await buscarSolicitacao(supabase, id)
  const status = solicitacao.status

  if (status !== "APROVADA") {
    throw new TransicaoInvalidaError(
      `Não é possível registrar compra de uma solicitação com status "${status}".`
    )
  }

  const { data, error } = await supabase.rpc("insumos_registrar_compra", {
    p_solicitacao_id: id,
    p_dados: {
      data_compra: input.dataCompra,
      fornecedor_escolhido: input.fornecedorEscolhido,
      produto_comprado: input.produtoComprado,
      valor_unitario_final: input.valorUnitarioFinal,
      frete_final: input.freteFinal ?? null,
      valor_total_final: input.valorTotalFinal,
      forma_pagamento: input.formaPagamento,
      parcelamento_descricao: input.parcelamentoDescricao ?? null,
      cartao_ultimos_digitos: input.cartaoUltimosDigitos ?? null,
      numero_pedido: input.numeroPedido,
      previsao_entrega: input.previsaoEntrega,
      nf_comprovante_url: input.nfComprovanteUrl ?? null,
      observacoes: input.observacoes ?? null,
    },
  })

  if (error) throw traduzirErroDoBanco(error)
  return data
}

export async function confirmarEntrega(supabase: SupabaseClient, id: string) {
  const solicitacao = await buscarSolicitacao(supabase, id)
  const status = solicitacao.status

  if (status !== "AGUARDANDO_ENTREGA") {
    throw new TransicaoInvalidaError(
      `Não é possível confirmar entrega de uma solicitação com status "${status}".`
    )
  }

  const { data, error } = await supabase.rpc("insumos_atualizar_status", {
    p_solicitacao_id: id,
    p_novo_status: "ENTREGUE",
    p_origem: "USUARIO",
    p_observacao: null,
  })
  if (error) throw traduzirErroDoBanco(error)
  return { antes: solicitacao, depois: data }
}
