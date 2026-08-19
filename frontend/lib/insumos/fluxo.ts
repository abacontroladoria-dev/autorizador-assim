import type { StatusSolicitacaoCompra } from "./tipos"

// Gating de status do fluxo de compra — a partição e as regras de "o que dá para
// fazer neste status".
//
// MAPA ÚNICO, de propósito. Estas listas nasceram duplicadas no AXIUM: uma cópia
// em `src/compras/compras.service.ts` (backend) e outra em
// `frontend/src/lib/statusFlow.ts` (UI), com o comentário "espelha o gating do
// service". Aqui elas moram num lugar só, consumido pelos services de
// `modules/insumos/` e pelas telas. Duplicar isso é como as duas cópias
// divergentes do CASE do TUSS neste projeto: funciona até uma das duas mudar.
//
// A checagem da UI é conveniência (habilita/desabilita botão); a que VALE é a do
// banco, nas RPCs de 20260818090000 — chamada direta à API não passa por aqui.

/** Depois que a decisão foi tomada ou a compra começou, não se edita mais. */
export const STATUS_NAO_EDITAVEIS: StatusSolicitacaoCompra[] = [
  "APROVADA",
  "REPROVADA",
  "COMPRA_REALIZADA",
  "AGUARDANDO_ENTREGA",
  "ENTREGUE",
  "CANCELADA",
]

/** Pausa é operacional — estado final não pausa, só se retoma. */
export const STATUS_PAUSAVEIS: StatusSolicitacaoCompra[] = [
  "SOLICITACAO_CRIADA",
  "COTACAO_EM_ANDAMENTO",
  "COTACAO_FINALIZADA",
  "REVISAO_MANUAL",
  "AGUARDANDO_APROVACAO",
]

/** Status em que uma cotação manual boa ainda destrava a aprovação sozinha. */
export const STATUS_ANTES_DA_APROVACAO: StatusSolicitacaoCompra[] = [
  "SOLICITACAO_CRIADA",
  "COTACAO_EM_ANDAMENTO",
  "COTACAO_FINALIZADA",
  "REVISAO_MANUAL",
]

export function podeEditar(status: StatusSolicitacaoCompra): boolean {
  return !STATUS_NAO_EDITAVEIS.includes(status)
}

export function podePausar(status: StatusSolicitacaoCompra): boolean {
  return STATUS_PAUSAVEIS.includes(status)
}

export function podeRetomar(status: StatusSolicitacaoCompra): boolean {
  return status === "PAUSADA"
}

export function podeCotarManualmente(status: StatusSolicitacaoCompra): boolean {
  return status !== "PAUSADA" && !STATUS_NAO_EDITAVEIS.includes(status)
}

export function podeDecidirAprovacao(status: StatusSolicitacaoCompra): boolean {
  return status === "AGUARDANDO_APROVACAO"
}

export function podeRegistrarCompra(status: StatusSolicitacaoCompra): boolean {
  return status === "APROVADA"
}

export function podeConfirmarEntrega(status: StatusSolicitacaoCompra): boolean {
  return status === "AGUARDANDO_ENTREGA"
}

export function podeReenviarParaCotacao(status: StatusSolicitacaoCompra): boolean {
  return !STATUS_NAO_EDITAVEIS.includes(status) && status !== "PAUSADA"
}

// ─────────────────────────────────────────────────────────────────────────────
// Partição em duas telas
// ─────────────────────────────────────────────────────────────────────────────
// Os 12 status se dividem em "Cotações" (da criação até a decisão, incluindo os
// desfechos negativos) e "Compras" (da aprovação até a entrega). Toda solicitação
// cai em EXATAMENTE um dos dois grupos — é partição, não filtro sobreposto (ver
// docs/padrao-detalhamento-modal.md §3.3: aba que é subconjunto de outra é
// armadilha aritmética).

export const STATUS_COTACAO: StatusSolicitacaoCompra[] = [
  "SOLICITACAO_CRIADA",
  "COTACAO_EM_ANDAMENTO",
  "COTACAO_FINALIZADA",
  "REVISAO_MANUAL",
  "AGUARDANDO_APROVACAO",
  "PAUSADA",
  "REPROVADA",
  "CANCELADA",
]

export const STATUS_COMPRA: StatusSolicitacaoCompra[] = [
  "APROVADA",
  "COMPRA_REALIZADA",
  "AGUARDANDO_ENTREGA",
  "ENTREGUE",
]

// ─────────────────────────────────────────────────────────────────────────────
// Alerta de solicitação parada
// ─────────────────────────────────────────────────────────────────────────────

/** Finais ou intencionais — nunca contam como "parada": já se decidiu parar ali. */
const STATUS_SEM_ALERTA_DE_PARADA: StatusSolicitacaoCompra[] = [
  "ENTREGUE",
  "REPROVADA",
  "CANCELADA",
  "PAUSADA",
]

export const LIMITE_DIAS_PARADA = 3

/**
 * Aproximação herdada do AXIUM: usa `atualizado_em` como proxy de "há quanto
 * tempo está neste status". Não existe campo de "entrou no status em", e
 * qualquer edição também mexe nesse timestamp — serve para alerta gerencial,
 * não para SLA.
 *
 * Se um dia precisar ser exato, o dado está em `historico_status_compra`: o
 * `criado_em` da última linha é o instante real da entrada no status.
 */
export function diasParada(atualizadoEm: string, agora: Date = new Date()): number {
  return Math.floor((agora.getTime() - new Date(atualizadoEm).getTime()) / 86_400_000)
}

export function estaParada(
  solicitacao: { status: StatusSolicitacaoCompra; atualizado_em: string },
  agora: Date = new Date()
): boolean {
  if (STATUS_SEM_ALERTA_DE_PARADA.includes(solicitacao.status)) return false
  return diasParada(solicitacao.atualizado_em, agora) >= LIMITE_DIAS_PARADA
}
