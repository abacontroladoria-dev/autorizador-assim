'use client'

import { useState } from 'react'
import { Clock, ChevronDown, ChevronUp } from 'lucide-react'
import type { PacientePendencia } from './types'

interface AcompanhamentoProps {
  pacientes: PacientePendencia[]
  loading?: boolean
  onPacienteClick?: (nomePaciente: string) => void
}

const PREVIEW_COUNT = 5

export default function Acompanhamento({ pacientes, loading, onPacienteClick }: AcompanhamentoProps) {
  const [expandido, setExpandido] = useState(false)

  const total = pacientes.length
  const visiveis = expandido ? pacientes : pacientes.slice(0, PREVIEW_COUNT)
  const temMais = total > PREVIEW_COUNT

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-card p-5 flex flex-col gap-4 dark:border-amber-900/50">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">Acompanhamento</p>
            <p className="text-xs text-foreground/50">Até 4 dias</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
          {total} pacientes
        </span>
      </div>

      {/* Lista */}
      {total === 0 ? (
        <p className="text-xs text-foreground/40 text-center py-2">
          Nenhum paciente nesta categoria
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {visiveis.map((p) => (
            <li
              key={p.pacienteNome}
              className="flex items-center justify-between gap-3 py-2 min-w-0"
            >
              <button
                onClick={() => onPacienteClick?.(p.pacienteNome)}
                className="text-sm text-foreground truncate overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer hover:underline hover:text-primary transition-colors text-left"
                title={p.pacienteNome}
              >
                {p.pacienteNome}
              </button>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0 whitespace-nowrap">
                {p.diasAtraso} {p.diasAtraso === 1 ? 'dia' : 'dias'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Botão expandir/recolher */}
      {temMais && (
        <button
          onClick={() => setExpandido((v) => !v)}
          aria-label={expandido ? "Recolher lista de pacientes" : "Expandir lista de pacientes"}
          className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground transition-colors self-start"
        >
          {expandido ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Ver todos ({total})
            </>
          )}
        </button>
      )}
    </div>
  )
}
