'use client'

import { ChevronDown } from 'lucide-react'
import type { Competencia } from './types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ANOS = [2024, 2025, 2026]

interface Props {
  value: Competencia
  onChange: (c: Competencia) => void
}

export default function CompetenciaFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
        Competência
      </span>
      <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 shadow-xs">
        <div className="relative flex items-center">
          <select
            value={value.mes}
            onChange={e => onChange({ ...value, mes: Number(e.target.value) })}
            className="appearance-none bg-transparent text-sm font-medium text-foreground pr-5 cursor-pointer focus:outline-none"
          >
            {MESES.map((label, i) => (
              <option key={i + 1} value={i + 1}>{label}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-0 text-foreground/40 pointer-events-none" />
        </div>
        <span className="text-foreground/30 text-sm">/</span>
        <div className="relative flex items-center">
          <select
            value={value.ano}
            onChange={e => onChange({ ...value, ano: Number(e.target.value) })}
            className="appearance-none bg-transparent text-sm font-medium text-foreground pr-5 cursor-pointer focus:outline-none"
          >
            {ANOS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-0 text-foreground/40 pointer-events-none" />
        </div>
      </div>
    </div>
  )
}
