'use client'

import { X } from 'lucide-react'
import type { AgendaFilterOptions, AgendaFilters } from '@/types/agenda'
import AgendaLegend from './AgendaLegend'

interface AgendaFiltersProps {
  filters: AgendaFilters
  setFilters: (f: AgendaFilters) => void
  opcoes: AgendaFilterOptions
}

const FILTER_FIELDS: { key: keyof AgendaFilters; label: string; optionsKey: keyof AgendaFilterOptions }[] = [
  { key: 'unidade',   label: 'Unidade',   optionsKey: 'unidades'   },
  { key: 'terapeuta', label: 'Terapeuta', optionsKey: 'terapeutas' },
  { key: 'terapia',   label: 'Terapia',   optionsKey: 'terapias'   },
]

export default function AgendaFilters({ filters, setFilters, opcoes }: AgendaFiltersProps) {
  const hasFilters = Object.values(filters).some(Boolean)

  function clear() {
    setFilters({ unidade: '', terapeuta: '', terapia: '', sala: '' })
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col gap-3">
      {/* Filtros rápidos */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtros rápidos</p>
          {hasFilters && (
            <button
              onClick={clear}
              className="flex items-center gap-1 text-xs text-[#3A8FB7] hover:underline"
            >
              <X size={11} />
              Limpar
            </button>
          )}
        </div>

        <div className="space-y-3">
          {FILTER_FIELDS.map(({ key, label, optionsKey }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <select
                value={filters[key]}
                onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/30 focus:border-[#3A8FB7]"
              >
                <option value="">Todos</option>
                {(opcoes[optionsKey] as string[]).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <AgendaLegend />
    </aside>
  )
}
