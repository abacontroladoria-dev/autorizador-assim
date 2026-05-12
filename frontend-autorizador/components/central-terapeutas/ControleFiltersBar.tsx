'use client'

import { CalendarDays, Clock3, MapPin, Search, User } from 'lucide-react'
import { unidadesControle } from './helpers'
import type { ControleFilters } from './types'

type Props = {
  filters: ControleFilters
  horarios: string[]
  onChange: (filters: ControleFilters) => void
}

export default function ControleFiltersBar({
  filters,
  horarios,
  onChange,
}: Props) {
  function updateFilter<K extends keyof ControleFilters>(
    key: K,
    value: ControleFilters[K]
  ) {
    onChange({
      ...filters,
      [key]: value,
    })
  }

  return (
    <div
      className="
        bg-white/90
        backdrop-blur
        border border-white/50
        rounded-2xl
        p-3
        shadow-sm
      "
    >
      <div
        className="
          grid
          grid-cols-1
          gap-3
          md:grid-cols-[180px_170px_200px_1fr_1fr]
        "
      >
        <label className="relative">
          <CalendarDays className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="date"
            value={filters.data}
            onChange={(event) => updateFilter('data', event.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <Clock3 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <select
            value={filters.horario}
            onChange={(event) => updateFilter('horario', event.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Todos horários</option>
            {horarios.map((horario) => (
              <option key={horario} value={horario}>
                {horario.slice(0, 5)}
              </option>
            ))}
          </select>
        </label>

        <label className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <select
            value={filters.unidade}
            onChange={(event) => updateFilter('unidade', event.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Todas unidades</option>
            {unidadesControle.map((unidade) => (
              <option key={unidade} value={unidade}>
                {unidade}
              </option>
            ))}
          </select>
        </label>

        <label className="relative">
          <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Nome do terapeuta"
            value={filters.terapeuta}
            onChange={(event) => updateFilter('terapeuta', event.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Nome do paciente"
            value={filters.paciente}
            onChange={(event) => updateFilter('paciente', event.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>
      </div>
    </div>
  )
}

const inputClass = `
  h-11
  w-full
  rounded-2xl
  border border-slate-200
  bg-white
  px-4
  text-sm
  text-slate-700
  outline-none
  focus:ring-4
  focus:ring-violet-100
  focus:border-violet-300
  transition
`
