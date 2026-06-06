'use client'

import { Check, UserX } from 'lucide-react'
import ControleStatusBadge from './ControleStatusBadge'
import type { ControleTerapeuticoItem } from './types'
import {
  getHorario,
  getPaciente,
  getSala,
  getStatus,
  getTerapeuta,
  getTerapia,
} from './helpers'

type Props = {
  item: ControleTerapeuticoItem
  onSelect: () => void
}

export default function ControleMobileCard({
  item,
  onSelect,
}: Props) {
  return (
    <article
      className="
        bg-white
        rounded-xl
        border border-slate-200
        shadow-sm
        p-4
        space-y-4
      "
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#3A8FB7]">
            {getHorario(item)}
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-800 leading-tight">
            {getPaciente(item)}
          </h3>
        </div>

        <ControleStatusBadge status={getStatus(item)} />
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm text-slate-600">
        <Info label="Terapeuta" value={getTerapeuta(item)} />
        <Info label="Terapia" value={getTerapia(item)} />
        <Info label="Sala" value={getSala(item)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="
            h-12
            rounded-xl
            bg-emerald-600
            text-white
            text-sm
            font-bold
            flex
            items-center
            justify-center
            gap-2
            active:scale-[0.98]
            transition
          "
        >
          <Check size={17} />
          PRESENTE
        </button>

        <button
          type="button"
          className="
            h-12
            rounded-xl
            bg-rose-600
            text-white
            text-sm
            font-bold
            flex
            items-center
            justify-center
            gap-2
            active:scale-[0.98]
            transition
          "
        >
          <UserX size={17} />
          FALTOU
        </button>
      </div>
    </article>
  )
}

function Info({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  )
}