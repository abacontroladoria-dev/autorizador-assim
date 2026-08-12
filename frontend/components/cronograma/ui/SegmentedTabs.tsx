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
  /** "sm" (padrão, densidade de dashboard) ou "lg" pra quando a escolha é uma
   *  decisão de destaque na tela, não um filtro secundário. */
  size?: "sm" | "lg"
}

const SIZE_CLS: Record<"sm" | "lg", string> = {
  sm: "px-3 py-1 text-xs",
  lg: "px-4 py-2 text-sm",
}

export function SegmentedTabs<T extends string>({
  value, onChange, tabs, className = "", ariaLabel, size = "sm",
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
            className={`inline-flex items-center gap-1 rounded-full font-semibold border transition-colors ${SIZE_CLS[size]} ${
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