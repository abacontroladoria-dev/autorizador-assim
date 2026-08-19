import {
  CATEGORIAS_COMPRA,
  PRIORIDADES,
  STATUS_SOLICITACAO,
  type CategoriaCompra,
  type Prioridade,
  type StatusSolicitacaoCompra,
} from "@/lib/insumos/tipos"
import { Coletor, type Validado } from "./validacao"

// DTOs da solicitação de compra. Portados de src/compras/dto/ do AXIUM,
// preservando as mesmas regras (obrigatoriedade, positivos, URL, categoria
// OUTROS exigindo texto livre).

export type CriarSolicitacaoInput = {
  setor: string
  categoria: CategoriaCompra
  categoriaOutro?: string
  prioridade: Prioridade
  justificativaCompra: string
  nomeItem: string
  descricaoDetalhada: string
  quantidade: number
  unidadeMedida: string
  marcaDesejada?: string
  modeloDesejado?: string
  cor?: string
  tamanhoMedidaCapacidade?: string
  material?: string
  imagemAnexoUrl?: string
  linkReferencia: string
  marketplacePermitido: string
  prazoMaximoEntregaDias: number
  valorMaximoEstimado?: number
  fornecedorSugerido?: string
  aceitaSimilar?: boolean
  aceitaOutraMarca?: boolean
  somenteNovo?: boolean
  aceitaUsado?: boolean
  somenteCompraNacional?: boolean
}

export function parseCriarSolicitacao(corpo: unknown): Validado<CriarSolicitacaoInput> {
  const c = new Coletor(corpo)

  const categoria = c.opcao("categoria", CATEGORIAS_COMPRA, { obrigatorio: true })
  // Só exigido quando a categoria é OUTROS — mesma regra do @ValidateIf do AXIUM.
  const categoriaOutro =
    categoria === "OUTROS" ? c.texto("categoriaOutro", { obrigatorio: true, min: 2 }) : undefined

  const dados = {
    setor: c.texto("setor", { obrigatorio: true })!,
    categoria: categoria!,
    categoriaOutro,
    prioridade: c.opcao("prioridade", PRIORIDADES, { obrigatorio: true })!,
    justificativaCompra: c.texto("justificativaCompra", { obrigatorio: true })!,
    nomeItem: c.texto("nomeItem", { obrigatorio: true })!,
    descricaoDetalhada: c.texto("descricaoDetalhada", { obrigatorio: true })!,
    quantidade: c.numero("quantidade", { obrigatorio: true, positivo: true })!,
    unidadeMedida: c.texto("unidadeMedida", { obrigatorio: true })!,
    marcaDesejada: c.texto("marcaDesejada"),
    modeloDesejado: c.texto("modeloDesejado"),
    cor: c.texto("cor"),
    tamanhoMedidaCapacidade: c.texto("tamanhoMedidaCapacidade"),
    material: c.texto("material"),
    imagemAnexoUrl: c.url("imagemAnexoUrl"),
    linkReferencia: c.url("linkReferencia", { obrigatorio: true })!,
    marketplacePermitido: c.texto("marketplacePermitido", { obrigatorio: true })!,
    prazoMaximoEntregaDias: c.inteiro("prazoMaximoEntregaDias", { obrigatorio: true, positivo: true })!,
    valorMaximoEstimado: c.numero("valorMaximoEstimado", { positivo: true }),
    fornecedorSugerido: c.texto("fornecedorSugerido"),
    aceitaSimilar: c.booleano("aceitaSimilar"),
    aceitaOutraMarca: c.booleano("aceitaOutraMarca"),
    somenteNovo: c.booleano("somenteNovo"),
    aceitaUsado: c.booleano("aceitaUsado"),
    somenteCompraNacional: c.booleano("somenteCompraNacional"),
  }

  return c.finalizar(dados)
}

/** Todos os campos opcionais — é PATCH. A regra de OUTROS é checada no service, que conhece o valor atual. */
export type AtualizarSolicitacaoInput = Partial<CriarSolicitacaoInput>

export function parseAtualizarSolicitacao(corpo: unknown): Validado<AtualizarSolicitacaoInput> {
  const c = new Coletor(corpo)

  const dados: AtualizarSolicitacaoInput = {
    setor: c.texto("setor"),
    categoria: c.opcao("categoria", CATEGORIAS_COMPRA),
    categoriaOutro: c.texto("categoriaOutro", { min: 2 }),
    prioridade: c.opcao("prioridade", PRIORIDADES),
    justificativaCompra: c.texto("justificativaCompra"),
    nomeItem: c.texto("nomeItem"),
    descricaoDetalhada: c.texto("descricaoDetalhada"),
    quantidade: c.numero("quantidade", { positivo: true }),
    unidadeMedida: c.texto("unidadeMedida"),
    marcaDesejada: c.texto("marcaDesejada"),
    modeloDesejado: c.texto("modeloDesejado"),
    cor: c.texto("cor"),
    tamanhoMedidaCapacidade: c.texto("tamanhoMedidaCapacidade"),
    material: c.texto("material"),
    imagemAnexoUrl: c.url("imagemAnexoUrl"),
    linkReferencia: c.url("linkReferencia"),
    marketplacePermitido: c.texto("marketplacePermitido"),
    prazoMaximoEntregaDias: c.inteiro("prazoMaximoEntregaDias", { positivo: true }),
    valorMaximoEstimado: c.numero("valorMaximoEstimado", { positivo: true }),
    fornecedorSugerido: c.texto("fornecedorSugerido"),
    aceitaSimilar: c.booleano("aceitaSimilar"),
    aceitaOutraMarca: c.booleano("aceitaOutraMarca"),
    somenteNovo: c.booleano("somenteNovo"),
    aceitaUsado: c.booleano("aceitaUsado"),
    somenteCompraNacional: c.booleano("somenteCompraNacional"),
  }

  // Remove as chaves ausentes para o UPDATE não zerar coluna não enviada.
  for (const chave of Object.keys(dados) as (keyof AtualizarSolicitacaoInput)[]) {
    if (dados[chave] === undefined) delete dados[chave]
  }

  return c.finalizar(dados)
}

export function parsePausar(corpo: unknown): Validado<{ motivo?: string }> {
  const c = new Coletor(corpo)
  return c.finalizar({ motivo: c.texto("motivo") })
}

/**
 * Escape hatch: troca o status sem validar a transição, para destravar uma
 * solicitação presa. No AXIUM era gated por permissão em escopo CONSOLIDADO.
 */
export function parseAlterarStatus(
  corpo: unknown
): Validado<{ status: StatusSolicitacaoCompra; observacao?: string }> {
  const c = new Coletor(corpo)
  return c.finalizar({
    status: c.opcao("status", STATUS_SOLICITACAO, { obrigatorio: true })!,
    observacao: c.texto("observacao"),
  })
}

export function parseFiltroListagem(
  params: URLSearchParams
): Validado<{ status?: StatusSolicitacaoCompra; limit: number; offset: number }> {
  const status = params.get("status") ?? undefined
  const errors: string[] = []

  if (status && !STATUS_SOLICITACAO.includes(status as StatusSolicitacaoCompra)) {
    errors.push(`status deve ser um de: ${STATUS_SOLICITACAO.join(", ")}`)
  }

  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50), 1), 200)
  const offset = Math.max(Number(params.get("offset") ?? 0), 0)
  if (!Number.isFinite(limit) || !Number.isFinite(offset)) errors.push("limit/offset inválidos")

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: { status: status as StatusSolicitacaoCompra | undefined, limit, offset } }
}
