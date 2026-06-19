'use client'

import { Clock, RefreshCw, CheckCircle, Users } from 'lucide-react'
import type { CCOKpis } from './types'

interface Props {
  kpis: CCOKpis
  loading?: boolean
}

export default function CCOKpiCards({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const pctSessionsOnTime = kpis.total_sessoes > 0
    ? ((kpis.sessoes_prontas / kpis.total_sessoes) * 100).toFixed(0)
    : '0'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

      {/* Evoluções em Atraso */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-amber-50 w-fit">
          <Clock size={16} className="text-amber-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.evolucoes_atrasadas.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Evoluções em Atraso</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">Até o dia anterior</p>
        </div>
      </div>

      {/* Substituições */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-cyan-50 w-fit">
          <RefreshCw size={16} className="text-cyan-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.sessoes_em_revisao.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Substituições</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">Substituições realizadas</p>
        </div>
      </div>

      {/* Sessões em Dia */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-green-50 w-fit">
          <CheckCircle size={16} className="text-green-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {pctSessionsOnTime}%
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Sessões em Dia</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2 line-clamp-2">
            {kpis.sessoes_prontas.toLocaleString('pt-BR')} de {kpis.total_sessoes.toLocaleString('pt-BR')} sessões
          </p>
        </div>
      </div>

      {/* Pacientes Ativos */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 min-h-40 group">
        <div className="p-2 rounded-lg bg-slate-100 w-fit">
          <Users size={16} className="text-slate-600" />
        </div>
        <div className="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
              {kpis.total_pacientes.toLocaleString('pt-BR')}
            </p>
            <p className="text-xs md:text-sm font-medium text-foreground/80 mt-1 line-clamp-2">Pacientes Ativos</p>
          </div>
          <p className="text-xs text-foreground/40 mt-2">Em atendimento</p>
        </div>
      </div>

    </div>
  )
}
