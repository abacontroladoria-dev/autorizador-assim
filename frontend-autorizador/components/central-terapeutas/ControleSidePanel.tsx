'use client'

import {
  Check,
  Clock3,
  MapPin,
  RefreshCcw,
  Stethoscope,
  User,
  UserCheck,
  UserX,
} from 'lucide-react'
import ControleStatusBadge from './ControleStatusBadge'
import type { ControleTerapeuticoItem } from './types'
import {
  getHorario,
  getPaciente,
  getSala,
  getStatus,
  getTerapeuta,
  getTerapia,
  getUnidade,
} from './helpers'

type Props = {
  atendimento?: ControleTerapeuticoItem
}

export default function ControleSidePanel({
  atendimento,
}: Props) {
  if (!atendimento) {
    return (
      <aside
      className="
        h-full
        bg-white/90
        backdrop-blur-sm
        rounded-2xl
        border border-slate-200
        shadow-sm
        p-5
          text-sm
          text-slate-400
        "
      >
        Selecione um atendimento
      </aside>
    )
  }

  return (
    <aside
      className="
        h-full
        bg-white/90
        backdrop-blur-sm
        rounded-2xl
        border border-slate-200
        shadow-sm
        overflow-hidden
      "
    >
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400">
              Atendimento selecionado
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-800 leading-tight">
              {getTerapeuta(atendimento)}
            </h2>
          </div>

          <ControleStatusBadge status={getStatus(atendimento)} />
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">
          <Info
            icon={Stethoscope}
            label="Terapia"
            value={getTerapia(atendimento)}
          />
        </div>
      </div>

      <div className="p-4 space-y-5">
        <PanelSection title="Dados operacionais">
          <div className="grid grid-cols-1 gap-3">
            <Info
              icon={User}
              label="Paciente"
              value={getPaciente(atendimento)}
            />
            <Info
              icon={Clock3}
              label="Horário"
              value={getHorario(atendimento)}
            />
            <Info
              icon={MapPin}
              label="Sala"
              value={getSala(atendimento)}
            />
            <Info
              icon={MapPin}
              label="Unidade"
              value={getUnidade(atendimento) || '—'}
            />
          </div>
        </PanelSection>

        <PanelSection title="Ações rápidas">
          <div className="space-y-2">
          <button
            type="button"
            className={`${actionClass} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <Check size={17} />
            PRESENTE
          </button>

          <button
            type="button"
            className={`${actionClass} bg-rose-600 text-white hover:bg-rose-700`}
          >
            <UserX size={17} />
            FALTOU
          </button>

          <button
            type="button"
            className={`${actionClass} bg-white text-slate-700 border border-slate-200 hover:bg-slate-50`}
          >
            <RefreshCcw size={17} />
            COBERTURA
          </button>
          </div>
        </PanelSection>
      </div>
    </aside>
  )
}

const actionClass = `
  h-11
  w-full
  rounded-xl
  text-sm
  font-bold
  flex
  items-center
  justify-center
  gap-2
  transition
  hover:shadow-sm
`

function PanelSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
          <UserCheck size={15} />
        </div>
        <h3 className="text-sm font-bold text-slate-800">
          {title}
        </h3>
      </div>

      {children}
    </section>
  )
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-700 break-words">
          {value || '—'}
        </p>
      </div>
    </div>
  )
}
