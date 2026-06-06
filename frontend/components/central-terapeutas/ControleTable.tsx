'use client'

import ControleStatusBadge from './ControleStatusBadge'
import type { ControleTerapeuticoItem } from './types'
import {
  getAtendimentoId,
  getHorarioInicial,
  getPaciente,
  getStatus,
  getTerapeuta,
  getTerapia,
} from './helpers'

type Props = {
  dados: ControleTerapeuticoItem[]
  selecionadoId: string | null
  loading: boolean
  onSelect: (item: ControleTerapeuticoItem) => void
}

export default function ControleTable({
  dados,
  selecionadoId,
  loading,
  onSelect,
}: Props) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
        Carregando atendimentos...
      </div>
    )
  }

  if (!dados.length) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-slate-400">
        Nenhum atendimento encontrado
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-[92px_1.15fr_1.2fr_1fr_112px] gap-3 px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-100 text-center">
        <span>Horário</span>
        <span>Terapeuta</span>
        <span>Paciente</span>
        <span>Terapia</span>
        <span>Status</span>
      </div>

      <div className="divide-y divide-slate-100">
        {dados.map((item) => {
          const itemId = getAtendimentoId(item)
          const ativo = itemId === selecionadoId

          return (
            <button
              key={itemId}
              type="button"
              onClick={() => onSelect(item)}
              className={`
                w-full
                grid
                grid-cols-[92px_1.15fr_1.2fr_1fr_112px]
                gap-3
                items-center
                px-4
                py-3
                text-left
                transition
                hover:bg-slate-50
                ${ativo ? 'bg-[#f0f8fd]' : 'bg-white'}
              `}
            >
              <span className="text-sm font-bold text-[#3A8FB7] text-center">
                {getHorarioInicial(item).slice(0, 5)}
              </span>
              <span className="text-sm text-slate-600 truncate">
                {getTerapeuta(item)}
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">
                {getPaciente(item)}
              </span>
              <span className="text-sm text-slate-600 truncate">
                {getTerapia(item)}
              </span>
              <span className="flex justify-center">
                <ControleStatusBadge status={getStatus(item)} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
