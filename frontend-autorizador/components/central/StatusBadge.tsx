'use client'

import {
  CheckCircle2,
  Clock3,
  Loader2,
  AlertTriangle,
  XCircle,
  UserCheck,
} from 'lucide-react'

interface Props {
  status?: string
}

export default function StatusBadge({
  status,
}: Props) {

  const config =
    getStatusConfig(status)

  return (
    <div
      className={`
        inline-flex
        items-center
        gap-2
        px-3 py-1.5
        rounded-full
        text-xs
        font-semibold
        whitespace-nowrap
        border
        ${config.className}
      `}
    >

      <config.icon
        className={`
          w-3.5 h-3.5
          ${config.animate ? 'animate-spin' : ''}
        `}
      />

      {config.label}

    </div>
  )
}

function getStatusConfig(status?: string) {

  const normalized =
    status?.toLowerCase()

  switch (normalized) {

    // =========================
    // AUTORIZADO
    // =========================

    case 'autorizado':

    case 'concluido':

      return {
        label: 'Autorizado',

        className:
          'bg-emerald-50 text-emerald-700 border-emerald-200',

        icon: CheckCircle2,
      }

    // =========================
    // PRESENÇA
    // =========================

    case 'presenca_confirmada':

      return {
        label: 'Presença confirmada',

        className:
          'bg-blue-50 text-blue-700 border-blue-200',

        icon: UserCheck,
      }

    // =========================
    // PROCESSANDO
    // =========================

    case 'executando':

    case 'processando':

      return {
        label: 'Processando',

        className:
          'bg-amber-50 text-amber-700 border-amber-200',

        icon: Loader2,

        animate: true,
      }

    // =========================
    // FALTA
    // =========================

    case 'falta':

      return {
        label: 'Falta',

        className:
          'bg-orange-50 text-orange-700 border-orange-200',

        icon: XCircle,
      }

    case 'falta_terapeuta':

      return {
        label: 'Falta terapeuta',

        className:
          'bg-red-50 text-red-700 border-red-200',

        icon: XCircle,
      }

    // =========================
    // ERRO
    // =========================

    case 'erro':

      return {
        label: 'Erro operacional',

        className:
          'bg-red-50 text-red-700 border-red-200',

        icon: AlertTriangle,
      }

    // =========================
    // PENDENTE
    // =========================

    case 'pendente':

      return {
        label: 'Pendente',

        className:
          'bg-slate-100 text-slate-700 border-slate-200',

        icon: Clock3,
      }

    // =========================
    // DEFAULT
    // =========================

    default:

      return {
        label: status || 'Sem status',

        className:
          'bg-slate-100 text-slate-700 border-slate-200',

        icon: Clock3,
      }
  }
}