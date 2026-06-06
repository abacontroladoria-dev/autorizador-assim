'use client'

import {
  AlertCircle,
  CalendarX2,
  Clock,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import type { GrupoTerapeutaMobile } from './types'

type Props = {
  grupos: GrupoTerapeutaMobile[]
  loading?: boolean
}

type KpiConfig = {
  key: string
  title: string
  value: number
  total: number
  tone: string
  iconTone: string
  barTone: string
  icon: typeof UserCheck
  hideProgress?: boolean
}

export default function ControleKpiCards({ grupos, loading }: Props) {
  const totalGrupos = grupos.length

  const totalSessoes = grupos.reduce((acc, g) => acc + g.atendimentos.length, 0)

  const pendentes = grupos.filter((g) => g.status === 'pendente').length
  const disponiveis = grupos.filter((g) => g.status === 'disponivel').length
  const indisponibilidades = grupos.filter((g) => g.status === 'indisponivel').length
  const coberturasPendentes = grupos.filter(
    (g) => g.status === 'indisponivel' && !g.substituto
  ).length
  const semCobertura = grupos.reduce(
    (acc, g) =>
      acc +
      g.atendimentos.filter(
        (a) =>
          a.status === 'indisponivel' && !a.profissional_substituto_nome
      ).length,
    0
  )

  const cards: KpiConfig[] = [
    {
      key: 'total',
      title: 'Total de terapeutas',
      value: totalGrupos,
      total: 0,
      tone: 'text-slate-700',
      iconTone: 'bg-slate-100 text-slate-600',
      barTone: 'bg-slate-400',
      icon: Users,
      hideProgress: true,
    },
    {
      key: 'disponiveis',
      title: 'Disponíveis',
      value: disponiveis,
      total: totalGrupos,
      tone: 'text-emerald-700',
      iconTone: 'bg-emerald-50 text-emerald-700',
      barTone: 'bg-emerald-500',
      icon: UserCheck,
    },
    {
      key: 'pendentes',
      title: 'Pendentes',
      value: pendentes,
      total: totalGrupos,
      tone: 'text-slate-600',
      iconTone: 'bg-slate-100 text-slate-500',
      barTone: 'bg-slate-400',
      icon: Clock,
    },
    {
      key: 'indisponibilidades',
      title: 'Indisponibilidades',
      value: indisponibilidades,
      total: totalGrupos,
      tone: 'text-rose-700',
      iconTone: 'bg-rose-50 text-rose-700',
      barTone: 'bg-rose-500',
      icon: UserX,
    },
    {
      key: 'cobertura-pendente',
      title: 'Coberturas pendentes',
      value: coberturasPendentes,
      total: totalGrupos,
      tone: 'text-amber-700',
      iconTone: 'bg-amber-50 text-amber-700',
      barTone: 'bg-amber-500',
      icon: AlertCircle,
    },
    {
      key: 'sem-cobertura',
      title: 'Sessões sem cobertura',
      value: semCobertura,
      total: totalSessoes,
      tone: 'text-orange-700',
      iconTone: 'bg-orange-50 text-orange-700',
      barTone: 'bg-orange-500',
      icon: CalendarX2,
    },
  ]

  return (
    <section className="flex-1 grid grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <KpiCard key={card.key} card={card} loading={loading} />
      ))}
    </section>
  )
}

function KpiCard({
  card,
  loading,
}: {
  card: KpiConfig
  loading?: boolean
}) {
  const Icon = card.icon
  const percent =
    card.total > 0 ? Math.round((card.value / card.total) * 100) : 0

  return (
    <div
      className="
        bg-white/95
        border border-slate-200
        rounded-xl
        p-3
        shadow-sm
        transition
        hover:-translate-y-px
        hover:shadow-md
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 leading-tight">
            {card.title}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className={`text-2xl font-bold leading-none ${card.tone}`}>
              {loading ? '--' : card.value}
            </span>
            {!card.hideProgress && (
              <span className="pb-0.5 text-[11px] font-semibold text-slate-400">
                {loading ? '' : `${percent}%`}
              </span>
            )}
          </div>
        </div>

        <div
          className={`
            h-9 w-9 shrink-0 rounded-xl
            flex items-center justify-center
            ${card.iconTone}
          `}
        >
          <Icon size={18} />
        </div>
      </div>

      {!card.hideProgress && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${card.barTone}`}
            style={{ width: `${loading ? 0 : percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
