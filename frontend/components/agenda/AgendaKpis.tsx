'use client'

import { CheckSquare, Clock, Users, CalendarCheck } from 'lucide-react'
import type { AgendaKpis } from '@/types/agenda'
import { cn } from '@/lib/utils'

interface AgendaKpisProps {
  kpis: AgendaKpis
}

export default function AgendaKpis({ kpis }: AgendaKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={<CheckSquare size={18} />}
        label="Ocupação (semana)"
        value={`${kpis.ocupacaoPercent}%`}
        sub="da capacidade utilizada"
        color="blue"
      />
      <KpiCard
        icon={<Clock size={18} />}
        label="Horários livres"
        value={kpis.horasLivresTotal}
        sub="disponíveis na semana"
        color="emerald"
      />
      <KpiCard
        icon={<Users size={18} />}
        label="Atendimentos"
        value={String(kpis.totalAtendimentos)}
        sub="total de sessões"
        color="violet"
      />
      <KpiCard
        icon={<CalendarCheck size={18} />}
        label="Próximo atendimento"
        value={kpis.proximoAtendimento?.hora ?? '—'}
        sub={kpis.proximoAtendimento?.paciente ?? 'Nenhum hoje'}
        color="amber"
      />
    </div>
  )
}

type Color = 'blue' | 'emerald' | 'violet' | 'amber'

const COLOR_MAP: Record<Color, { icon: string; bg: string; value: string }> = {
  blue:    { icon: 'bg-blue-100 text-blue-600',    bg: 'bg-blue-50',    value: 'text-blue-700'    },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', bg: 'bg-emerald-50', value: 'text-emerald-700' },
  violet:  { icon: 'bg-violet-100 text-violet-600', bg: 'bg-violet-50',  value: 'text-violet-700'  },
  amber:   { icon: 'bg-amber-100 text-amber-600',   bg: 'bg-amber-50',   value: 'text-amber-700'   },
}

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: Color
}) {
  const c = COLOR_MAP[color]
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-4 flex items-start gap-3 shadow-sm')}>
      <div className={cn('p-2 rounded-xl shrink-0', c.icon)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className={cn('text-xl font-bold leading-tight mt-0.5', c.value)}>{value}</p>
        <p className="text-xs text-slate-400 truncate mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
