'use client'

import { CalendarDays, Clock3, MapPin, Search, Stethoscope } from 'lucide-react'
import { unidadesControle } from './helpers'
import type { ControleFilters } from './types'

type Props = {
  filters: ControleFilters
  horarios: string[]
  terapias: string[]
  onChange: (filters: ControleFilters) => void
}

export default function ControleFiltersBar({
  filters,
  horarios,
  terapias,
  onChange,
}: Props) {
  function updateFilter<K extends keyof ControleFilters>(
    key: K,
    value: ControleFilters[K]
  ) {
    onChange({ ...filters, [key]: value })
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
          md:grid-cols-[160px_1fr_140px_180px_180px]
        "
      >
        {/* Data */}
        <label className="relative">
          <CalendarDays className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="date"
            value={filters.data}
            onChange={(e) => updateFilter('data', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        {/* Busca unificada — terapeuta ou paciente */}
        <label className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Buscar terapeuta ou paciente"
            value={filters.busca}
            onChange={(e) => updateFilter('busca', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        {/* Horário */}
        <label className="relative">
          <Clock3 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <select
            value={filters.horario}
            onChange={(e) => updateFilter('horario', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Horários</option>
            {horarios.map((horario) => (
              <option key={horario} value={horario}>
                {horario.slice(0, 5)}
              </option>
            ))}
          </select>
        </label>

        {/* Unidade */}
        <label className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <select
            value={filters.unidade}
            onChange={(e) => updateFilter('unidade', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Unidades</option>
            {unidadesControle.map((unidade) => (
              <option key={unidade} value={unidade}>
                {unidade}
              </option>
            ))}
          </select>
        </label>

        {/* Terapia */}
        <label className="relative">
          <Stethoscope className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <select
            value={filters.terapia}
            onChange={(e) => updateFilter('terapia', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Terapias</option>
            {terapias.map((terapia) => (
              <option key={terapia} value={terapia}>
                {terapia}
              </option>
            ))}
          </select>
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
