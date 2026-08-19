"use client"

import { StatusChip, TONE_PANEL } from "@/components/ui/tones"
import { fmt } from "@/lib/remuneracao/formatacao"
import type { CotacaoCompra } from "@/services/insumos.service"

// Tabela de cotações da solicitação. Porta CotacoesTable.tsx do AXIUM.
//
// O backend já devolve `cotacoes` ordenado por valor_decisao asc (ver
// buscarSolicitacao em modules/insumos/services/), então a posição na lista já
// É o rank — não reordena aqui.

const FORMA_PAGAMENTO_LABEL: Record<CotacaoCompra["forma_pagamento_decisao"], string> = {
  AVISTA: "À vista",
  PARCELADO_SEM_JUROS: "Parcelado sem juros",
  PARCELADO_COM_JUROS: "Parcelado com juros",
}

const STATUS_COTACAO_LABEL: Record<CotacaoCompra["status_cotacao"], string> = {
  VALIDADA: "Validada",
  DESCARTADA: "Descartada",
  REVISAO_MANUAL: "Revisão manual",
}

/** Entre as não descartadas, a mais barata — para destacar como sugestão. */
function encontrarMelhorId(cotacoes: CotacaoCompra[]): string | null {
  const candidatas = cotacoes.filter((c) => c.status_cotacao !== "DESCARTADA")
  if (candidatas.length === 0) return null
  return candidatas.reduce((melhor, atual) =>
    Number(atual.valor_decisao) < Number(melhor.valor_decisao) ? atual : melhor
  ).id
}

export function CotacoesTable({ cotacoes }: { cotacoes: CotacaoCompra[] }) {
  if (cotacoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma cotação registrada ainda.</p>
  }

  const melhorId = encontrarMelhorId(cotacoes)

  return (
    <div className="scroll-fade-x overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {["#", "Fornecedor", "Produto encontrado", "Valor decisão", "Pagamento", "Prazo", "Score", "Status"].map(
              (rotulo) => (
                <th key={rotulo} className="px-3 py-2 text-left">
                  <span className="text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                    {rotulo}
                  </span>
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {cotacoes.map((cotacao, indice) => (
            <tr
              key={cotacao.id}
              className={`border-b border-border/60 last:border-0 ${cotacao.selecionada ? TONE_PANEL.green.bg : ""}`}
            >
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{indice + 1}º</td>
              <td className="px-3 py-2 whitespace-nowrap">{cotacao.fornecedor}</td>
              <td className="px-3 py-2">
                <a
                  href={cotacao.link_produto}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {cotacao.produto_encontrado}
                </a>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cotacao.id === melhorId && <StatusChip tone="green">🏆 melhor oferta</StatusChip>}
                  {cotacao.criada_manualmente && <StatusChip tone="gray">manual</StatusChip>}
                </div>
              </td>
              <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${cotacao.id === melhorId ? "font-semibold" : ""}`}>
                {fmt(Number(cotacao.valor_decisao))}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{FORMA_PAGAMENTO_LABEL[cotacao.forma_pagamento_decisao]}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <span className="whitespace-nowrap">{cotacao.prazo_entrega_descricao ?? "—"}</span>
                  {cotacao.prazo_excedido && <StatusChip tone="amber">prazo excedido</StatusChip>}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {cotacao.score_compatibilidade !== null ? (
                  <StatusChip tone="blue">{Number(cotacao.score_compatibilidade).toFixed(0)} pts</StatusChip>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {cotacao.selecionada && <StatusChip tone="green">selecionada</StatusChip>}
                  <StatusChip tone={cotacao.status_cotacao === "DESCARTADA" ? "red" : "gray"}>
                    {STATUS_COTACAO_LABEL[cotacao.status_cotacao]}
                  </StatusChip>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
