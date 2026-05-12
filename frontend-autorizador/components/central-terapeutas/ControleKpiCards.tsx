'use client'

import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  RefreshCcw,
  ShieldCheck,
  UserX,
} from 'lucide-react'
import type { ControleTerapeuticoItem } from './types'
import { getStatus, normalizarStatus } from './helpers'

type Props = {
  dados: ControleTerapeuticoItem[]
  loading?: boolean
}

type KpiConfig = {
  key: string
  title: string
  value: number
  tone: string
  iconTone: string
  barTone: string
  icon: typeof Clock
}

export default function ControleKpiCards({
  dados,
  loading,
}: Props) {
  const total = dados.length

  const presentes = contarStatus(dados, 'presente')
  const faltas = contarStatus(dados, 'faltou')
  const coberturasPlanejadas = contarStatus(dados, 'cobertura_planejada')
  const coberturasConfirmadas = contarStatus(dados, 'cobertura_confirmada')
  const pendentes = contarStatus(dados, 'pendente')

  const cards: KpiConfig[] = [
    {
      key: 'total',
      title: 'Total de atendimentos',
      value: total,
      tone: 'text-slate-700',
      iconTone: 'bg-slate-100 text-slate-600',
      barTone: 'bg-slate-300',
      icon: CalendarCheck2,
    },
    {
      key: 'presentes',
      title: 'Presentes',
      value: presentes,
      tone: 'text-emerald-700',
      iconTone: 'bg-emerald-50 text-emerald-700',
      barTone: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    {
      key: 'faltas',
      title: 'Faltas',
      value: faltas,
      tone: 'text-rose-700',
      iconTone: 'bg-rose-50 text-rose-700',
      barTone: 'bg-rose-500',
      icon: UserX,
    },
    {
      key: 'cobertura-planejada',
      title: 'Coberturas planejadas',
      value: coberturasPlanejadas,
      tone: 'text-amber-700',
      iconTone: 'bg-amber-50 text-amber-700',
      barTone: 'bg-amber-500',
      icon: RefreshCcw,
    },
    {
      key: 'cobertura-confirmada',
      title: 'Coberturas confirmadas',
      value: coberturasConfirmadas,
      tone: 'text-sky-700',
      iconTone: 'bg-sky-50 text-sky-700',
      barTone: 'bg-sky-500',
      icon: ShieldCheck,
    },
    {
      key: 'pendentes',
      title: 'Pendentes',
      value: pendentes,
      tone: 'text-slate-600',
      iconTone: 'bg-slate-100 text-slate-600',
      barTone: 'bg-slate-400',
      icon: Clock,
    },
  ]

  return (
    <section
      className="
        grid
        grid-cols-2
        gap-3
        xl:grid-cols-6
      "
    >
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          card={card}
          total={total}
          loading={loading}
        />
      ))}
    </section>
  )
}

function KpiCard({
  card,
  total,
  loading,
}: {
  card: KpiConfig
  total: number
  loading?: boolean
}) {
  const Icon = card.icon
  const percent = total > 0 ? Math.round((card.value / total) * 100) : 0

  return (
    <div
      className="
        group
        bg-white/95
        border border-slate-200
        rounded-xl
        p-3
        shadow-sm
        transition
        hover:-translate-y-[1px]
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
            <span className="pb-0.5 text-[11px] font-semibold text-slate-400">
              {loading ? '' : `${percent}%`}
            </span>
          </div>
        </div>

        <div
          className={`
            h-9
            w-9
            shrink-0
            rounded-xl
            flex
            items-center
            justify-center
            ${card.iconTone}
          `}
        >
          <Icon size={18} />
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${card.barTone}`}
          style={{ width: `${loading ? 0 : percent}%` }}
        />
      </div>
    </div>
  )
}

function contarStatus(
  dados: ControleTerapeuticoItem[],
  status: string
) {
  return dados.filter((item) => normalizarStatus(getStatus(item)) === status).length
}
