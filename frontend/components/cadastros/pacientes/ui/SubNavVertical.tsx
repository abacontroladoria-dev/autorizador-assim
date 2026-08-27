"use client"

import type { ReactNode } from "react"

// Sub-navegação vertical à esquerda do formulário. Não existia no projeto: as
// abas horizontais reusam SegmentedTabs (components/cronograma/ui), mas nenhuma
// tela tinha o eixo vertical dos prints.
//
// Vira uma linha horizontal rolável no mobile, onde uma coluna fixa comeria
// metade da largura útil.

export interface ItemSubNav<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Marca a seção como tendo alterações não salvas. */
  alterado?: boolean
}

export function SubNavVertical<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  items: ItemSubNav<T>[]
  ariaLabel: string
}) {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className="flex shrink-0 gap-1 overflow-x-auto sm:w-56 sm:flex-col sm:overflow-visible"
    >
      {items.map((item) => {
        const ativo = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(item.value)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ativo
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {item.icon && (
              <span className={ativo ? "text-primary" : "text-muted-foreground"} aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.alterado && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                aria-label="alterações não salvas"
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
