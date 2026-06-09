'use client'

import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { CCOSessaoDetalhada } from './types'
import TratativasBadges from './TratativasBadges'

interface Props {
  sessao: CCOSessaoDetalhada
}

function formatTime(time: string): string {
  return time
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function TimelineSessao({ sessao }: Props) {
  const [expanded, setExpanded] = useState(false)

  const statusConfig = {
    EVOLUIDA: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'Evoluída' },
    PENDENTE: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Sem evolução' },
    NENHUMA: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Nenhuma' },
  }

  const config = statusConfig[sessao.evolucaoStatus]
  const Icon = config.icon

  return (
    <div className="border-l-2 border-foreground/10 pl-6 pb-6 relative">
      {/* Timeline dot */}
      <div className="absolute -left-[13px] top-1 w-6 h-6 rounded-full bg-card border-2 border-foreground/10 flex items-center justify-center">
        <div className={`w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-')}`} />
      </div>

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left mb-2 group"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{formatData(sessao.data)}</span>
            <span className="text-sm text-foreground/60">·</span>
            <span className="text-sm text-foreground/60">{formatTime(sessao.horario)}</span>
          </div>
          <span className="text-foreground/40 group-hover:text-foreground/60 text-xs font-medium">
            {expanded ? '▼' : '▶'}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-medium text-foreground">{sessao.terapia}</span>
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bg}`}>
            <Icon size={14} className={config.color} />
            <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-foreground/5 space-y-2 text-sm">
          {sessao.profissional && (
            <div className="flex items-start justify-between">
              <span className="text-foreground/60">Profissional:</span>
              <span className="font-medium text-foreground text-right">{sessao.profissional}</span>
            </div>
          )}

          {sessao.evolucaoStatus === 'EVOLUIDA' && sessao.evolucaoAutor && (
            <>
              <div className="flex items-start justify-between">
                <span className="text-foreground/60">Evoluído por:</span>
                <span className="font-medium text-foreground text-right">{sessao.evolucaoAutor}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-foreground/60">Em:</span>
                <span className="font-medium text-foreground text-right">{formatData(sessao.evolucaoDataHora!.split(' ')[0])} {sessao.evolucaoDataHora!.split(' ')[1]}</span>
              </div>
            </>
          )}

          {(sessao.substituicao || sessao.glosa || (sessao.tratativas && sessao.tratativas.length > 0)) && (
            <div className="pt-2 mt-2 border-t border-foreground/5">
              <TratativasBadges
                substituicao={sessao.substituicao}
                glosa={sessao.glosa}
                tratativas={sessao.tratativas}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
