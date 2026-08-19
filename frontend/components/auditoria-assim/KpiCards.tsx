'use client'

import { AlertCircle, AlertTriangle, Ban, Calendar, CheckCircle2, RefreshCw, UserMinus, UserX, XCircle, Ticket } from 'lucide-react'
import type { KpisAuditoriaAssim } from './types'

type Props = {
  kpis: KpisAuditoriaAssim | null
  loading?: boolean
  activeFilter: string
  totalFiltrados?: number
  onFilter: (situacao: string) => void
}

type KpiConfig = {
  key: string
  title: string
  hint?: string
  value: number
  tone: string
  iconTone: string
  barTone: string
  borderActive: string
  hoverBorder: string
  bgActive: string
  icon: typeof RefreshCw
  situacao: string
}

export default function KpiCards({ kpis, loading, activeFilter, totalFiltrados, onFilter }: Props) {
  const total = (kpis?.total ?? 0) + (kpis?.faltas ?? 0) + (kpis?.faltas_terapeuta ?? 0)

  const cards: KpiConfig[] = [
    {
      key: 'nao-solicitadas',
      situacao: 'NAO_SOLICITADA',
      title: 'Não Solicitadas',
      value: kpis?.nao_solicitadas ?? 0,
      tone: 'text-rose-700',
      iconTone: 'bg-rose-50 text-rose-700',
      barTone: 'bg-rose-500',
      borderActive: 'border-rose-400',
      hoverBorder: 'hover:border-rose-300',
      bgActive: 'bg-rose-50/60',
      icon: AlertCircle,
    },
    {
      key: 'sincronizando',
      situacao: 'SINCRONIZANDO',
      title: 'Sincronizando',
      hint: 'até 10 min',
      value: kpis?.sincronizando ?? 0,
      tone: 'text-sky-700',
      iconTone: 'bg-sky-50 text-sky-700',
      barTone: 'bg-sky-500',
      borderActive: 'border-sky-400',
      hoverBorder: 'hover:border-sky-300',
      bgActive: 'bg-sky-50/60',
      icon: RefreshCw,
    },
    {
      key: 'retorno-nao-confirmado',
      situacao: 'RETORNO_NAO_CONFIRMADO',
      title: 'Retorno Não\nConfirmado',
      hint: 'mais de 10 min',
      value: kpis?.retorno_nao_confirmado ?? 0,
      tone: 'text-amber-700',
      iconTone: 'bg-amber-50 text-amber-700',
      barTone: 'bg-amber-500',
      borderActive: 'border-amber-400',
      hoverBorder: 'hover:border-amber-300',
      bgActive: 'bg-amber-50/60',
      icon: AlertTriangle,
    },
    {
      key: 'liberadas',
      situacao: 'LIBERADA',
      title: 'Liberadas',
      value: kpis?.liberadas ?? 0,
      tone: 'text-emerald-700',
      iconTone: 'bg-emerald-50 text-emerald-700',
      barTone: 'bg-emerald-500',
      borderActive: 'border-emerald-400',
      hoverBorder: 'hover:border-emerald-300',
      bgActive: 'bg-emerald-50/60',
      icon: CheckCircle2,
    },
    {
      // "Com Token" não é uma situação — é um atributo transversal (toda
      // liberada pode ter filipeta) e o contador da feature que o botão
      // Token Mensal abre. Fica no steel da marca, fora da régua de situação,
      // justamente para não parecer mais um estado do ciclo.
      key: 'tokens',
      situacao: 'TOKENS',
      title: 'Com Token',
      value: kpis?.tokens ?? 0,
      tone: 'text-brand-fg',
      iconTone: 'bg-brand-surface text-brand-fg',
      barTone: 'bg-brand',
      borderActive: 'border-brand',
      hoverBorder: 'hover:border-brand/50',
      bgActive: 'bg-brand-surface',
      icon: Ticket,
    },
    {
      key: 'glosas',
      situacao: 'GLOSA',
      title: 'Glosas',
      value: kpis?.glosas ?? 0,
      tone: 'text-violet-700',
      iconTone: 'bg-violet-50 text-violet-700',
      barTone: 'bg-violet-500',
      borderActive: 'border-violet-400',
      hoverBorder: 'hover:border-violet-300',
      bgActive: 'bg-violet-50/60',
      icon: XCircle,
    },
    {
      key: 'canceladas',
      situacao: 'CANCELADA',
      title: 'Canceladas',
      value: kpis?.canceladas ?? 0,
      tone: 'text-slate-600',
      iconTone: 'bg-slate-100 text-slate-600',
      barTone: 'bg-slate-400',
      borderActive: 'border-slate-400',
      hoverBorder: 'hover:border-slate-300',
      bgActive: 'bg-slate-50/80',
      icon: Ban,
    },
    {
      // As duas faltas vivem em stone, fora da régua de autorização: sessão que
      // não aconteceu é outra categoria. Distinguem-se por peso (stone-600 vs
      // stone-700), ícone e título — não por matiz. Antes, "Faltas Terapeuta"
      // era red-600, idêntico a "Não Solicitadas".
      key: 'faltas',
      situacao: 'FALTA',
      title: 'Faltas Paciente',
      value: kpis?.faltas ?? 0,
      tone: 'text-stone-600',
      iconTone: 'bg-stone-100 text-stone-600',
      barTone: 'bg-stone-400',
      borderActive: 'border-stone-400',
      hoverBorder: 'hover:border-stone-300',
      bgActive: 'bg-stone-50',
      icon: UserX,
    },
    {
      key: 'faltas-terapeuta',
      situacao: 'FALTA_TERAPEUTA',
      title: 'Faltas Terapeuta',
      value: kpis?.faltas_terapeuta ?? 0,
      tone: 'text-stone-700',
      iconTone: 'bg-stone-200 text-stone-700',
      barTone: 'bg-stone-500',
      borderActive: 'border-stone-500',
      hoverBorder: 'hover:border-stone-400',
      bgActive: 'bg-stone-100/80',
      icon: UserMinus,
    },
  ]

  return (
    <section className="flex flex-col gap-2 xl:flex-row pt-0.5">
      <TotalCard
        total={total}
        loading={loading}
        active={activeFilter === ''}
        totalFiltrados={totalFiltrados}
        onFilter={() => onFilter('')}
      />
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-9 flex-1">
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            card={card}
            total={total}
            loading={loading}
            active={activeFilter === card.situacao}
            onFilter={() => onFilter(activeFilter === card.situacao ? '' : card.situacao)}
          />
        ))}
      </div>
    </section>
  )
}

function TotalCard({
  total,
  loading,
  active,
  totalFiltrados,
  onFilter,
}: {
  total: number
  loading?: boolean
  active: boolean
  totalFiltrados?: number
  onFilter: () => void
}) {
  const bars = [35, 55, 42, 68, 52, 78, 62, 88, 72, 95]
  const isFiltered = totalFiltrados !== undefined

  return (
    <button
      onClick={onFilter}
      className={`
        relative overflow-hidden
        xl:w-40 xl:shrink-0
        flex flex-col items-center justify-between
        rounded-2xl p-2.5 pt-3
        bg-linear-to-br from-[oklch(0.52_0.092_217)] to-[oklch(0.34_0.070_217)]
        shadow-md min-h-24
        cursor-pointer text-left
        transition hover:-translate-y-px hover:shadow-lg
        border-2
        ${active ? 'border-white/60' : 'border-transparent'}
      `}
    >
      <div className="relative z-10 flex flex-col items-center gap-1 w-full">
        <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center mb-1">
          <Calendar size={17} className="text-white" />
        </div>

        <span className="text-[10px] font-bold uppercase tracking-widest text-[oklch(0.86_0.040_217)] leading-tight text-center">
          Total de Sessões
        </span>

        {isFiltered ? (
          <div className="flex flex-col items-center mt-1">
            <span className="text-4xl font-bold text-white leading-none">
              {loading ? '—' : totalFiltrados}
            </span>
            <span className="text-[11px] text-[oklch(0.82_0.045_217)] mt-0.5">
              {loading ? '' : `/ ${total} no dia`}
            </span>
          </div>
        ) : (
          <>
            <span className="text-4xl font-bold text-white leading-none mt-1">
              {loading ? '—' : total}
            </span>
            <span className="text-[11px] text-[oklch(0.82_0.045_217)] mt-0.5">100% do total</span>
          </>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-end gap-0.75 px-3 z-0">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[3px] bg-white/10"
            style={{ height: `${h * 0.55}px` }}
          />
        ))}
      </div>
    </button>
  )
}

function KpiCard({
  card,
  total,
  loading,
  active,
  onFilter,
}: {
  card: KpiConfig
  total: number
  loading?: boolean
  active: boolean
  onFilter: () => void
}) {
  const Icon = card.icon
  const percent = total > 0 ? Math.round((card.value / total) * 100) : 0

  return (
    <button
      onClick={onFilter}
      className={`
        group flex flex-col items-center w-full
        rounded-xl p-1.5 shadow-sm
        cursor-pointer text-left
        transition hover:-translate-y-px hover:shadow-md
        border-2
        ${active
          ? `${card.borderActive} ${card.bgActive}`
          : `border-slate-200/80 bg-white ${card.hoverBorder}`
        }
      `}
    >
      <div className="w-full">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center mx-auto ${card.iconTone}`}>
          <Icon size={13} />
        </div>
        <div className="mt-1.5">
          <p className="text-[11px] font-semibold text-slate-600 leading-snug text-center whitespace-pre-line">
            {card.title}
          </p>
          {card.hint && (
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5 text-center">{card.hint}</p>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <span className={`text-2xl font-bold leading-none ${card.tone}`}>
          {loading ? '—' : card.value}
        </span>
      </div>

      <div className="w-full px-1">
        <div className="flex justify-center mb-1.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${card.iconTone}`}>
            {loading ? '' : `${percent}%`}
          </span>
        </div>
        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${card.barTone}`}
            style={{ width: `${loading ? 0 : percent}%` }}
          />
        </div>
      </div>
    </button>
  )
}
