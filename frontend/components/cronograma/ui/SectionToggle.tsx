"use client"

// SectionToggle — cabeçalho de seção colapsável: ícone Lucide tonal + label +
// pill de contagem + régua + chevron. Extraído do padrão local de
// AcompanhamentoTab (§4 Aba 3 do plano). `color` é uma string de accent (hex ou
// var) para o ícone/pill — mantém flexibilidade com a paleta B do módulo.
//
// (AcompanhamentoTab ainda tem uma cópia local desse padrão; migrar para esta
// primitiva num passe de limpeza futuro — fora do escopo desta fase.)

import type { LucideIcon } from "lucide-react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface SectionToggleProps {
  icon: LucideIcon
  label: string
  color: string
  count: number
  open: boolean
  onToggle: () => void
  /** Quando false, some o chevron e o botão fica não-interativo (ex.: sem itens). */
  interactive?: boolean
  controls?: string
}

export function SectionToggle({
  icon: Icon, label, color, count, open, onToggle, interactive = true, controls,
}: SectionToggleProps) {
  return (
    <button
      type="button"
      onClick={() => interactive && onToggle()}
      aria-expanded={open}
      aria-controls={controls}
      className="flex items-center gap-2 w-full py-1.5 px-0.5 bg-transparent border-none text-left"
      style={{ cursor: interactive ? "pointer" : "default" }}
    >
      <Icon size={14} style={{ color, flexShrink: 0 }} />
      <span className="text-sm font-semibold text-foreground whitespace-nowrap">{label}</span>
      <span
        className="text-xs font-bold rounded-full px-1.5 py-px shrink-0 tabular-nums"
        style={{ color, background: `${color}18` }}
      >
        {count}
      </span>
      <div className="flex-1 h-px bg-border" />
      {interactive && (open
        ? <ChevronUp size={14} className="text-muted-foreground shrink-0" />
        : <ChevronDown size={14} className="text-muted-foreground shrink-0" />)}
    </button>
  )
}