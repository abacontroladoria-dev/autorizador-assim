'use client'

import { CalendarDays, Clock, Hash, Search, SlidersHorizontal } from 'lucide-react'
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

const HORARIOS_BLOCOS = [
  { value: '08:00-08:40', label: '08:00 - 08:40' },
  { value: '08:40-09:20', label: '08:40 - 09:20' },
  { value: '09:20-10:00', label: '09:20 - 10:00' },
  { value: '10:00-10:40', label: '10:00 - 10:40' },
  { value: '10:40-11:20', label: '10:40 - 11:20' },
  { value: '11:20-12:00', label: '11:20 - 12:00' },
  { value: '13:00-13:40', label: '13:00 - 13:40' },
  { value: '13:40-14:20', label: '13:40 - 14:20' },
  { value: '14:20-15:00', label: '14:20 - 15:00' },
  { value: '15:00-15:40', label: '15:00 - 15:40' },
  { value: '15:40-16:20', label: '15:40 - 16:20' },
  { value: '16:20-17:00', label: '16:20 - 17:00' },
  { value: '17:00-17:40', label: '17:00 - 17:40' },
]

export default function FiltrosAuditoria({ filters, onChange }: Props) {
  function update<K extends keyof AuditoriaFilters>(key: K, value: AuditoriaFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="bg-white/90 backdrop-blur border border-white/50 rounded-2xl p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_200px_160px_180px]">

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

        <label className="relative">
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={filters.horario_bloco}
            onChange={(e) => update('horario_bloco', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Todos os horários</option>
            {HORARIOS_BLOCOS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
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
