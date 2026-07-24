"use client"

// SegmentedTabs — sub-navegação em pílula. Substitui os toggles de sub-aba
// (Inconsistências: Regras/Exceções) e a barra de pills de filtro segmentado.
// Padrão de pill ativo/inativo do §2.6 do plano.

import type { ReactNode } from "react"

export interface SegmentedTab<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

interface SegmentedTabsProps<T extends string> {
  value: T
  onChange: (v: T) => void
  tabs: SegmentedTab<T>[]
  className?: string
  ariaLabel?: string
}

export function SegmentedTabs<T extends string>({
  value, onChange, tabs, className = "", ariaLabel,
}: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`inline-flex flex-wrap gap-1.5 ${className}`}>
      {tabs.map(t => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              active
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white"
                : "bg-transparent text-foreground border-border hover:bg-muted/50"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 tabular-nums ${active ? "opacity-70" : "text-muted-foreground"}`}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}