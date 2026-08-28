'use client'

import { memo } from 'react'
import { Clock3 } from 'lucide-react'
import OrigemTag from './OrigemTag'
import type { Alerta } from './types'

type Props = {
  alerta: Alerta
  selecionado?: boolean
  onClick?: () => void
  /** Compacto = item do painel do sino; largo = linha da aba Pendências. */
  compacto?: boolean
}

const PRIORIDADE_BARRA: Record<string, string> = {
  critica: 'bg-red-500',
  alta:    'bg-orange-500',
  media:   'bg-amber-400',
  baixa:   'bg-slate-300',
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  aberto:       { label: 'Aberta',       cls: 'bg-red-50 text-red-600 ring-red-200' },
  em_andamento: { label: 'Em andamento', cls: 'bg-blue-50 text-blue-600 ring-blue-200' },
  resolvido:    { label: 'Resolvida',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}

function AlertaLinha({ alerta, selecionado, onClick, compacto }: Props) {
  const ref = alerta.entidade_ref ?? {}
  const pill = STATUS_PILL[alerta.status] ?? STATUS_PILL.aberto

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex w-full flex-col gap-1.5 overflow-hidden rounded-xl border p-3 text-left transition
        ${selecionado
          ? 'border-indigo-300 bg-indigo-50/50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
        }
      `}
    >
      {/* Barra de prioridade */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${PRIORIDADE_BARRA[alerta.prioridade] ?? PRIORIDADE_BARRA.media}`}
      />

      <div className="flex items-start justify-between gap-2 pl-1.5">
        <span className="truncate text-sm font-semibold text-slate-800">
          {ref.paciente_nome || alerta.titulo}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${pill.cls}`}>
          {pill.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1.5">
        <OrigemTag
          origem={alerta.origem}
          detalhe={alerta.origem === 'sistema' ? alerta.regra_nome : alerta.criado_por_nome}
        />
        {ref.hora && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock3 size={11} />
            {ref.hora}
          </span>
        )}
        {ref.data && (
          <span className="text-[11px] text-slate-400">{formatarData(ref.data)}</span>
        )}
        {alerta.total_eventos > 0 && (
          <span className="text-[11px] text-slate-400">
            {alerta.total_eventos} evento{alerta.total_eventos > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!compacto && (
        <p className="pl-1.5 text-xs text-slate-500 line-clamp-2">
          {alerta.descricao || alerta.titulo}
        </p>
      )}

      {compacto && ref.terapia && (
        <p className="truncate pl-1.5 text-[11px] text-slate-400">{ref.terapia}</p>
      )}
    </button>
  )
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split('-')
  if (!ano || !mes || !dia) return data
  return `${dia}/${mes}`
}

export default memo(AlertaLinha)
