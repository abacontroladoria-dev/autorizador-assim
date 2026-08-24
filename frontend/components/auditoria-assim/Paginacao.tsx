'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Números com reticências: 1 … 4 5 6 … 20, nunca a régua inteira. */
export function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const delta = 1
  const range: (number | '…')[] = []
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i)
  }
  if (current - delta > 2) range.unshift('…')
  if (current + delta < total - 1) range.push('…')
  range.unshift(1)
  if (range[range.length - 1] !== total) range.push(total)
  return range
}

/**
 * Paginação numerada com reticências — padrão nascido em `TabelaAuditoria.tsx`
 * e extraído para uso comum, sem mudar o desenho original.
 */
export default function Paginacao({
  pagina,
  totalPaginas,
  totalFiltrados,
  onChange,
  rotuloItem = 'registro(s)',
}: {
  pagina: number
  totalPaginas: number
  totalFiltrados: number
  onChange: (p: number) => void
  rotuloItem?: string
}) {
  if (totalPaginas <= 1) return null
  const pages = getPageNumbers(pagina, totalPaginas)

  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs text-slate-400">{totalFiltrados} {rotuloItem}</span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(pagina - 1)}
          disabled={pagina === 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p as number)}
              className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-semibold transition ${
                p === pagina
                  ? 'bg-brand-fg text-white border border-brand-fg shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(pagina + 1)}
          disabled={pagina === totalPaginas}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <span className="text-xs text-slate-400">Página {pagina} de {totalPaginas}</span>
    </div>
  )
}
