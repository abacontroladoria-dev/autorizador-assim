'use client'

import { Check, UserX } from 'lucide-react'
import type { ControleTerapeuticoItem } from './types'
import {
  getPaciente,
  getSala,
  getTerapeuta,
  getTerapia,
} from './helpers'

type Props = {
  item: ControleTerapeuticoItem
}

export default function ControlePresencaCard({
  item,
}: Props) {
  return (
    <article
      className="
        bg-white
        rounded-xl
        border border-slate-200
        shadow-sm
        p-4
        space-y-3
      "
    >
      <div>
        <h2 className="text-base font-bold text-slate-800 leading-tight">
          {getTerapeuta(item)}
        </h2>
        <p className="mt-1 text-sm font-medium text-[#3A8FB7]">
          {getTerapia(item)}
        </p>
      </div>

      <div className="space-y-1 text-sm text-slate-600">
        <p className="font-medium text-slate-700">
          {getPaciente(item)}
        </p>
        <p>{getSala(item)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
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
          presente
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
          falta
        </button>
      </div>
    </article>
  )
}
