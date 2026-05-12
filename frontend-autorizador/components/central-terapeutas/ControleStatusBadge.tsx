import { CheckCircle2, Clock, RefreshCcw, UserX } from 'lucide-react'

const statusConfig: Record<
  string,
  {
    label: string
    className: string
    icon: typeof Clock
  }
> = {
  pendente: {
    label: 'Pendente',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: Clock,
  },
  presente: {
    label: 'Presente',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  faltou: {
    label: 'Faltou',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: UserX,
  },
  cobertura_planejada: {
    label: 'Cobertura planejada',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: RefreshCcw,
  },
  cobertura_confirmada: {
    label: 'Cobertura confirmada',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: CheckCircle2,
  },
}

export default function ControleStatusBadge({
  status,
}: {
  status?: string | null
}) {
  const config = statusConfig[status || 'pendente'] || statusConfig.pendente
  const Icon = config.icon

  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-md
        border
        px-2
        py-1
        text-[11px]
        font-semibold
        ${config.className}
      `}
    >
      <Icon size={13} />
      {config.label}
    </span>
  )
}
