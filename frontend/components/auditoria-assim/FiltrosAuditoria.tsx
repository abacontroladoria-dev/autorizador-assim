'use client'

import { CalendarDays, Hash, Search, SlidersHorizontal } from 'lucide-react'
import type { AuditoriaFilters } from './types'

type Props = {
  filters: AuditoriaFilters
  onChange: (filters: AuditoriaFilters) => void
}

const SITUACOES = [
  { value: 'NAO_SOLICITADA', label: 'Não Solicitada' },
  { value: 'SINCRONIZANDO', label: 'Sincronizando' },
  { value: 'RETORNO_NAO_CONFIRMADO', label: 'Retorno Não Confirmado' },
  { value: 'LIBERADA', label: 'Liberada' },
  { value: 'GLOSA', label: 'Glosa' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'FALTA', label: 'Falta Paciente' },
  { value: 'FALTA_TERAPEUTA', label: 'Falta Terapeuta' },
]

export default function FiltrosAuditoria({ filters, onChange }: Props) {
  function update<K extends keyof AuditoriaFilters>(key: K, value: AuditoriaFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="bg-white/90 backdrop-blur border border-white/50 rounded-2xl p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_200px_160px]">

        <label className="relative">
          <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={filters.data}
            onChange={(e) => update('data', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar paciente"
            value={filters.paciente}
            onChange={(e) => update('paciente', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <SlidersHorizontal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={filters.situacao}
            onChange={(e) => update('situacao', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Todas as situações</option>
            {SITUACOES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="relative">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Código TUSS"
            value={filters.tuss}
            onChange={(e) => update('tuss', e.target.value)}
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
