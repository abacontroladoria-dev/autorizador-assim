import {
  DECISOES_APROVACAO,
  ORIGENS_PRODUTO,
  type DecisaoAprovacaoCompra,
  type OrigemProduto,
} from "@/lib/insumos/tipos"
import { Coletor, type Validado } from "./validacao"

// DTOs do fluxo: aprovação, cotação manual e registro de compra.

export type DecidirAprovacaoInput = {
  decisao: DecisaoAprovacaoCompra
  cotacaoEscolhidaId?: string
  justificativa?: string
}

export function parseDecidirAprovacao(corpo: unknown): Validado<DecidirAprovacaoInput> {
  const c = new Coletor(corpo)
  const decisao = c.opcao("decisao", DECISOES_APROVACAO, { obrigatorio: true })

  const dados: DecidirAprovacaoInput = {
    decisao: decisao!,
    cotacaoEscolhidaId: c.uuid("cotacaoEscolhidaId"),
    justificativa: c.texto("justificativa"),
  }

  // Mesmas duas regras de validarDecisaoAprovacao() em lib/insumos/status-solicitacao.ts.
  // Checadas aqui para dar 400 com mensagem boa; o banco tem os mesmos CHECK
  // (20260817200000) como rede de segurança contra chamada direta à API.
  if (dados.decisao === "APROVAR" && !dados.cotacaoEscolhidaId) {
    c.erros.push("cotacaoEscolhidaId é obrigatório para aprovar")
  }
  if (dados.decisao === "REPROVAR" && !dados.justificativa) {
    c.erros.push("justificativa é obrigatória para reprovar")
  }

  return c.finalizar(dados)
}

export type CriarCotacaoManualInput = {
  fornecedor: string
  produtoEncontrado: string
  valorUnitario: number
  quantidade: number
  frete?: number
  parcelamentoDescricao?: string
  condicaoSemJuros: boolean
  valorTotalParcelasSemJuros?: number
  valorTotalParcelasComJuros?: number
  prazoEntregaDescricao?: string
  prazoEntregaOrdemDias?: number
  linkProduto: string
  origem: OrigemProduto
}

export function parseCriarCotacaoManual(corpo: unknown): Validado<CriarCotacaoManualInput> {
  const c = new Coletor(corpo)

  const dados: CriarCotacaoManualInput = {
    fornecedor: c.texto("fornecedor", { obrigatorio: true })!,
    produtoEncontrado: c.texto("produtoEncontrado", { obrigatorio: true })!,
    valorUnitario: c.numero("valorUnitario", { obrigatorio: true, positivo: true })!,
    quantidade: c.numero("quantidade", { obrigatorio: true, positivo: true })!,
    frete: c.numero("frete", { minimo: 0 }),
    parcelamentoDescricao: c.texto("parcelamentoDescricao"),
    condicaoSemJuros: c.booleano("condicaoSemJuros", false)!,
    valorTotalParcelasSemJuros: c.numero("valorTotalParcelasSemJuros", { positivo: true }),
    valorTotalParcelasComJuros: c.numero("valorTotalParcelasComJuros", { positivo: true }),
    prazoEntregaDescricao: c.texto("prazoEntregaDescricao"),
    prazoEntregaOrdemDias: c.inteiro("prazoEntregaOrdemDias", { minimo: 0 }),
    linkProduto: c.url("linkProduto", { obrigatorio: true })!,
    origem: c.opcao("origem", ORIGENS_PRODUTO) ?? "NACIONAL",
  }

  return c.finalizar(dados)
}

export type RegistrarCompraInput = {
  dataCompra: string
  fornecedorEscolhido: string
  produtoComprado: string
  valorUnitarioFinal: number
  freteFinal?: number
  valorTotalFinal: number
  formaPagamento: string
  parcelamentoDescricao?: string
  cartaoUltimosDigitos?: string
  numeroPedido: string
  previsaoEntrega: string
  nfComprovanteUrl?: string
  observacoes?: string
}

export function parseRegistrarCompra(corpo: unknown): Validado<RegistrarCompraInput> {
  const c = new Coletor(corpo)

  const cartao = c.texto("cartaoUltimosDigitos")
  if (cartao !== undefined && !/^\d{4}$/.test(cartao)) {
    c.erros.push("cartaoUltimosDigitos deve ter 4 dígitos")
  }

  const dados: RegistrarCompraInput = {
    dataCompra: c.data("dataCompra", { obrigatorio: true })!,
    fornecedorEscolhido: c.texto("fornecedorEscolhido", { obrigatorio: true })!,
    produtoComprado: c.texto("produtoComprado", { obrigatorio: true })!,
    valorUnitarioFinal: c.numero("valorUnitarioFinal", { obrigatorio: true, positivo: true })!,
    freteFinal: c.numero("freteFinal", { minimo: 0 }),
    valorTotalFinal: c.numero("valorTotalFinal", { obrigatorio: true, positivo: true })!,
    formaPagamento: c.texto("formaPagamento", { obrigatorio: true })!,
    parcelamentoDescricao: c.texto("parcelamentoDescricao"),
    cartaoUltimosDigitos: cartao,
    numeroPedido: c.texto("numeroPedido", { obrigatorio: true })!,
    previsaoEntrega: c.data("previsaoEntrega", { obrigatorio: true })!,
    nfComprovanteUrl: c.url("nfComprovanteUrl"),
    observacoes: c.texto("observacoes"),
  }

  return c.finalizar(dados)
}
