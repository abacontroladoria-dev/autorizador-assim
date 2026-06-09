'use client'

import { AlertTriangle, RefreshCw, Clock, Users, Activity } from 'lucide-react'
import type { CCOKpis } from './types'

interface Props {
  kpis: CCOKpis
  pctProntas: string
  loading?: boolean
  onConciliadosClick?: () => void
  onPendentesClick?: () => void
  onRevisaoClick?: () => void
}

export default function CCOKpiCards({ kpis, pctProntas, loading, onConciliadosClick, onPendentesClick, onRevisaoClick }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

      {/* Total de Pacientes ASSIM — Static */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-slate-50 w-fit">
          <Users size={16} className="text-slate-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.total_pacientes_assim.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Total de Pacientes</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">universo ASSIM</p>
        </div>
      </div>

      {/* Total de Sessões ASSIM — Static */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-slate-50 w-fit">
          <Activity size={16} className="text-slate-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.total_sessoes_assim.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Total de Sessões</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">universo ASSIM</p>
        </div>
      </div>

      {/* Pendências — Interactive */}
      <button
        onClick={onPendentesClick}
        data-kpi="amber"
        className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 hover:shadow-sm transition-all duration-200 cursor-pointer text-left group hover:border-chart-4"
        style={{
          '--hover-bg': 'color-mix(in oklch, var(--chart-4) 8%, var(--card) 92%)',
          '--icon-bg': 'color-mix(in oklch, var(--chart-4) 12%, var(--card) 88%)',
        } as React.CSSProperties}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'color-mix(in oklch, var(--chart-4) 8%, var(--card) 92%)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
      >
        <div className="p-2 rounded-lg w-fit transition-colors" style={{ backgroundColor: 'color-mix(in oklch, var(--chart-4) 12%, var(--card) 88%)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--chart-4)' }} />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.pacientes_pendentes.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Pendências</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2 line-clamp-2">{kpis.sessoes_pendentes.toLocaleString('pt-BR')} sessões bloqueadas</p>
        </div>
      </button>

      {/* Substituição de Terapeuta — Interactive */}
      <button
        onClick={onRevisaoClick}
        data-kpi="blue"
        className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 hover:shadow-sm transition-all duration-200 cursor-pointer text-left group hover:border-chart-1"
        style={{
          '--hover-bg': 'color-mix(in oklch, var(--chart-1) 8%, var(--card) 92%)',
          '--icon-bg': 'color-mix(in oklch, var(--chart-1) 12%, var(--card) 88%)',
        } as React.CSSProperties}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'color-mix(in oklch, var(--chart-1) 8%, var(--card) 92%)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
      >
        <div className="p-2 rounded-lg w-fit transition-colors" style={{ backgroundColor: 'color-mix(in oklch, var(--chart-1) 12%, var(--card) 88%)' }}>
          <RefreshCw size={16} style={{ color: 'var(--chart-1)' }} />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.pacientes_em_revisao.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Substituição de Terapeuta</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">{kpis.sessoes_em_revisao.toLocaleString('pt-BR')} sessões</p>
        </div>
      </button>

      {/* Evoluções Pendentes — Static */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-indigo-50 w-fit">
          <Clock size={16} className="text-indigo-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.evolucoes_pendentes.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Evoluções Pendentes</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">operacional</p>
        </div>
      </div>

    </div>
  )
}
