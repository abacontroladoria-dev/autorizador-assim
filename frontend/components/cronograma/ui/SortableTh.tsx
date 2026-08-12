"use client"

// SortableTh — cabeçalho de coluna clicável pra ordenar tabelas (mesmo padrão
// já usado em ComparativoSessoesShell.tsx). Extraído aqui pra reaproveitar em
// qualquer tabela nova sem duplicar a lógica de comparação/ordenação.

import { useState, type ReactNode } from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { InfoTooltip } from "./InfoTooltip"

export type SortDir = "asc" | "desc"

export function compararValores(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR")
  const an = typeof a === "number" ? a : -Infinity
  const bn = typeof b === "number" ? b : -Infinity
  return an - bn
}

export function ordenarPor<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const sorted = [...rows].sort((a, b) => compararValores(a[key], b[key]))
  return dir === "asc" ? sorted : sorted.reverse()
}

interface SortableThProps {
  label: string
  sortKey: string
  activeKey: string
  dir: SortDir
  align?: "left" | "right"
  title?: string
  /** Explicação da coluna exibida num painel ao clique/toque no ícone de lâmpada (em vez do `title` nativo, que não funciona em touch). */
  info?: ReactNode
  onClick: (key: string) => void
}

export function SortableTh({ label, sortKey, activeKey, dir, align = "left", title, info, onClick }: SortableThProps) {
  const active = sortKey === activeKey
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown
  const [infoOpen, setInfoOpen] = useState(false)
  const labelEl = (
    <span className={`rounded transition-shadow ${infoOpen ? "ring-2 ring-amber-400" : ""}`}>
      {label}
    </span>
  )
  return (
    <th
      className={`py-1.5 ${align === "right" ? "px-2 text-right" : "pr-2"} font-semibold cursor-pointer select-none hover:text-foreground transition-colors`}
      title={title}
      onClick={() => onClick(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
        {align === "right" && info && <InfoTooltip ariaLabel={`Explicação da coluna ${label}`} onOpenChange={setInfoOpen}>{info}</InfoTooltip>}
        {labelEl}
        <Icon size={12} className={active ? "text-foreground" : "opacity-40"} />
        {align !== "right" && info && <InfoTooltip ariaLabel={`Explicação da coluna ${label}`} onOpenChange={setInfoOpen}>{info}</InfoTooltip>}
      </span>
    </th>
  )
}
