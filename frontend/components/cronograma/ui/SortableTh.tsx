"use client"

// SortableTh — cabeçalho de coluna clicável pra ordenar tabelas (mesmo padrão
// já usado em ComparativoSessoesShell.tsx). Extraído aqui pra reaproveitar em
// qualquer tabela nova sem duplicar a lógica de comparação/ordenação.

import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"

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
  onClick: (key: string) => void
}

export function SortableTh({ label, sortKey, activeKey, dir, align = "left", title, onClick }: SortableThProps) {
  const active = sortKey === activeKey
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown
  return (
    <th
      className={`py-1.5 ${align === "right" ? "px-2 text-right" : "pr-2"} font-semibold cursor-pointer select-none hover:text-foreground transition-colors`}
      title={title}
      onClick={() => onClick(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
        {label}
        <Icon size={12} className={active ? "text-foreground" : "opacity-40"} />
      </span>
    </th>
  )
}
