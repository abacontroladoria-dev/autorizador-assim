"use client"

import { StatusChip, TONE_CHIP } from "@/components/ui/tones"
import { ICONE_POR_PRIORIDADE, ICONE_POR_STATUS } from "@/lib/insumos/icones"
import {
  PRIORIDADE_LABEL,
  STATUS_LABEL,
  TONE_POR_PRIORIDADE,
  TONE_POR_STATUS,
} from "@/lib/insumos/rotulos"
import type { Prioridade, StatusSolicitacaoCompra } from "@/lib/insumos/tipos"

// Vocabulário visual do módulo de insumos. Camada 2 do padrão de detalhamento
// (docs/padrao-detalhamento-modal.md §2): só apresenta, não decide nada — o mapa
// status→tom vive em lib/insumos/rotulos.ts, e status→ícone em lib/insumos/icones.ts.
//
// Reusa o StatusChip de components/ui/tones.tsx em vez de inventar chip próprio.
// No AXIUM cada badge trazia `style={{ color, background }}` com hex cravado, o
// que não sobreviveria ao tema escuro do Pulsar.

export function StatusInsumoChip({
  status,
  dense = false,
}: {
  status: StatusSolicitacaoCompra
  dense?: boolean
}) {
  const Icone = ICONE_POR_STATUS[status]
  return (
    <StatusChip tone={TONE_POR_STATUS[status]} dense={dense}>
      <Icone className={dense ? "size-2.5" : "size-3"} strokeWidth={2.25} />
      {STATUS_LABEL[status]}
    </StatusChip>
  )
}

/**
 * NORMAL não rende chip: é o padrão do formulário, então a maioria das linhas
 * seria tingida sem informar nada. Ausência de chip lê-se "prioridade normal",
 * e o que chama atenção passa a ser só o que de fato é exceção.
 */
export function PrioridadeChip({ prioridade }: { prioridade: Prioridade }) {
  if (prioridade === "NORMAL") {
    return <span className="text-muted-foreground text-xs">Normal</span>
  }
  const Icone = ICONE_POR_PRIORIDADE[prioridade]
  return (
    <StatusChip tone={TONE_POR_PRIORIDADE[prioridade]} dense>
      {Icone && <Icone className="size-2.5" strokeWidth={2.25} />}
      {PRIORIDADE_LABEL[prioridade]}
    </StatusChip>
  )
}

export const TODOS = "TODOS"

/**
 * Filtro por status. Só mostra chip de status que tem linha — um chip zerado é
 * ruído, e a contagem some junto com ele.
 *
 * `total` é contado sobre o mesmo conjunto dos demais chips, então a soma dos
 * chips fecha com "Todos" (docs/padrao-detalhamento-modal.md §3.3).
 */
export function StatusFilterChips({
  statusPermitidos,
  contagens,
  total,
  ativo,
  onSelecionar,
}: {
  statusPermitidos: StatusSolicitacaoCompra[]
  contagens: Partial<Record<StatusSolicitacaoCompra, number>>
  total: number
  ativo: string
  onSelecionar: (valor: string) => void
}) {
  const comDados = statusPermitidos.filter((s) => (contagens[s] ?? 0) > 0)

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por status">
      <ChipFiltro
        rotulo="Todos"
        contagem={total}
        ativo={ativo === TODOS}
        tone="gray"
        onClick={() => onSelecionar(TODOS)}
      />
      {comDados.map((status) => (
        <ChipFiltro
          key={status}
          rotulo={STATUS_LABEL[status]}
          contagem={contagens[status] ?? 0}
          ativo={ativo === status}
          tone={TONE_POR_STATUS[status]}
          icone={ICONE_POR_STATUS[status]}
          onClick={() => onSelecionar(status)}
        />
      ))}
    </div>
  )
}

function ChipFiltro({
  rotulo,
  contagem,
  ativo,
  tone,
  icone: Icone,
  onClick,
}: {
  rotulo: string
  contagem: number
  ativo: boolean
  tone: keyof typeof TONE_CHIP
  icone?: (typeof ICONE_POR_STATUS)[StatusSolicitacaoCompra]
  onClick: () => void
}) {
  const c = TONE_CHIP[tone]
  // O estado ativo é anel, não troca de cor: mudar a cor do chip ao selecionar
  // quebraria a associação status→tom que o resto da tela usa.
  const anel = ativo ? "ring-2 ring-foreground/40" : "ring-1 ring-transparent hover:ring-border"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${c.bg} ${c.text} ${anel}`}
    >
      {Icone && <Icone className="size-3" strokeWidth={2.25} />}
      {rotulo}
      <span className="tabular-nums opacity-70">{contagem}</span>
    </button>
  )
}
