'use client'

import { memo } from 'react'
import { CheckCircle2, Loader2, UserMinus, UserX, AlertTriangle, Ban, Repeat2 } from 'lucide-react'

export interface Indicadores {
  total: number
  autorizados: number
  em_processo: number
  falta_paciente: number
  falta_terapeuta: number
  sem_autorizacao: number
  /**
   * Recusas da ASSIM ainda de pé. A glosa que um vínculo cobriu NÃO entra aqui —
   * ela conta em `autorizados`, como a Auditoria faz: este número dimensiona
   * trabalho a fazer, e ela não pede nada. Ver `severity.ts`.
   */
  glosa: number
  substituicoes: number
}

interface Props {
  indicadores: Indicadores
  foco: string
  setFoco: (v: string) => void
}

/**
 * Cabeçalho operacional: o "sinal vital" do dia.
 *  - Total + resumo em uma frase.
 *  - Pulse: barra proporcional empilhada (saúde do dia num relance).
 *  - Chips clicáveis = filtro por situação (substituem os 5 KPI-cards iguais).
 */
function DayPulse({ indicadores: i, foco, setFoco }: Props) {
  const segmentos = [
    { key: 'resolvido', valor: i.autorizados, cor: 'bg-emerald-500' },
    { key: 'andamento', valor: i.em_processo, cor: 'bg-slate-300' },
    { key: 'falta_paciente', valor: i.falta_paciente, cor: 'bg-amber-400' },
    { key: 'falta_terapeuta', valor: i.falta_terapeuta, cor: 'bg-rose-500' },
    // Violeta é a família semântica da glosa em todo o sistema (ver a nota do
    // topo de SituacaoBadge.tsx) e não disputa a barra com nenhum outro estado.
    { key: 'glosa', valor: i.glosa, cor: 'bg-violet-500' },
    { key: 'erro', valor: i.sem_autorizacao, cor: 'bg-rose-600' },
  ].filter((s) => s.valor > 0)

  const pendencias =
    i.falta_paciente + i.falta_terapeuta + i.sem_autorizacao + i.glosa

  const chips = [
    {
      key: 'erro',
      label: 'Sem autorização',
      valor: i.sem_autorizacao,
      icon: AlertTriangle,
      text: 'text-rose-700',
      dot: 'bg-rose-500',
      ring: 'ring-rose-200 bg-rose-50',
    },
    // A glosa era invisível no cabeçalho: não entrava em chip, nem na barra, nem
    // nas pendências. Uma recusa da ASSIM some do topo da tela é justamente o
    // tipo de lacuna que esta página existe para não deixar acontecer — e sem
    // este chip a glosa resolvida não tem de onde descer.
    {
      key: 'glosa',
      label: 'Glosa',
      valor: i.glosa,
      icon: Ban,
      text: 'text-violet-700',
      dot: 'bg-violet-500',
      ring: 'ring-violet-200 bg-violet-50',
    },
    {
      key: 'falta_paciente',
      label: 'Falta paciente',
      valor: i.falta_paciente,
      icon: UserMinus,
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      ring: 'ring-amber-200 bg-amber-50',
    },
    {
      key: 'falta_terapeuta',
      label: 'Falta terapeuta',
      valor: i.falta_terapeuta,
      icon: UserX,
      text: 'text-rose-700',
      dot: 'bg-rose-500',
      ring: 'ring-rose-200 bg-rose-50',
    },
    {
      key: 'substituicao',
      label: 'Substituições',
      valor: i.substituicoes,
      icon: Repeat2,
      text: 'text-slate-700',
      dot: 'bg-slate-400',
      ring: 'ring-slate-300 bg-slate-100',
    },
    {
      key: 'andamento',
      label: 'Em processo',
      valor: i.em_processo,
      icon: Loader2,
      text: 'text-slate-700',
      dot: 'bg-slate-300',
      ring: 'ring-slate-300 bg-slate-100',
    },
    {
      key: 'resolvido',
      label: 'Autorizados',
      valor: i.autorizados,
      icon: CheckCircle2,
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      ring: 'ring-emerald-200 bg-emerald-50',
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      {/* Total + resumo */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
          {i.total}
        </span>
        <span className="text-sm text-slate-500">atendimentos</span>

        {pendencias > 0 && (
          <span className="text-sm text-slate-400">
            ·{' '}
            <span className="font-medium text-slate-600 tabular-nums">
              {pendencias}
            </span>{' '}
            {pendencias === 1 ? 'pendência' : 'pendências'}
          </span>
        )}
      </div>

      {/* Pulse */}
      <div
        className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${i.autorizados} autorizados, ${i.em_processo} em processo, ${pendencias} pendências`}
      >
        {segmentos.map((s) => (
          <div
            key={s.key}
            className={s.cor}
            style={{ width: `${(s.valor / Math.max(i.total, 1)) * 100}%` }}
          />
        ))}
      </div>

      {/* Chips / filtros */}
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((c) => {
          const ativo = foco === c.key
          const Icon = c.icon
          return (
            <button
              key={c.key}
              onClick={() => setFoco(ativo ? '' : c.key)}
              aria-pressed={ativo}
              className={`
                inline-flex items-center gap-2
                rounded-full px-3 py-1.5
                text-xs font-medium
                transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300
                ${ativo
                  ? `ring-1 ${c.ring} ${c.text}`
                  : 'text-slate-500 hover:bg-slate-50 ring-1 ring-transparent'}
              `}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden />
              {c.label}
              <span className="tabular-nums font-semibold">{c.valor}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default memo(DayPulse)
