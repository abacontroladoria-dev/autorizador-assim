"use client"

import { FileText, UserCheck, PlusCircle, Users, AlertCircle } from "lucide-react"

export interface RecentRecord {
  id: string
  paciente_nome: string | null
  status: string
  created_at: string
}

interface RecentRecordsProps {
  records: RecentRecord[]
  loading: boolean
}

const STATUS_META: Record<string, {
  label: string
  badgeBg: string
  badgeText: string
  iconBg: string
  iconColor: string
  icon: typeof FileText
  description: string
}> = {
  autorizado: {
    label: "Concluído",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    icon: FileText,
    description: "Guia emitida com sucesso",
  },
  processando: {
    label: "Em andamento",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    icon: UserCheck,
    description: "Atendimento iniciado",
  },
  pendente: {
    label: "Pendente",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    icon: PlusCircle,
    description: "Nova solicitação criada",
  },
  erro: {
    label: "Erro",
    badgeBg: "bg-red-50",
    badgeText: "text-red-600",
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    icon: AlertCircle,
    description: "Erro no processamento",
  },
  negado: {
    label: "Negado",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-500",
    iconBg: "bg-slate-50",
    iconColor: "text-slate-400",
    icon: Users,
    description: "Autorização negada",
  },
}

const FALLBACK = {
  label: "Registrado",
  badgeBg: "bg-slate-100",
  badgeText: "text-slate-500",
  iconBg: "bg-slate-50",
  iconColor: "text-slate-400",
  icon: FileText,
  description: "Registro atualizado",
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "—"
  }
}

export default function RecentRecords({ records, loading }: RecentRecordsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-slate-100 rounded w-2/3" />
              <div className="h-2.5 bg-slate-100 rounded w-1/2" />
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="h-2.5 w-10 bg-slate-100 rounded" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <FileText size={28} className="mb-2 opacity-40" />
        <p className="text-sm">Nenhum registro hoje</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {records.map((rec) => {
        const meta = STATUS_META[rec.status] ?? FALLBACK
        const Icon = meta.icon

        return (
          <div
            key={rec.id}
            className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-100"
          >
            {/* Icon square */}
            <div className={`${meta.iconBg} ${meta.iconColor} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
              <Icon size={18} />
            </div>

            {/* Name + description */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate leading-snug">
                {rec.paciente_nome ?? "Paciente não identificado"}
              </p>
              <p className="text-xs text-slate-400 truncate leading-snug">{meta.description}</p>
            </div>

            {/* Time + badge */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-slate-400">{formatTime(rec.created_at)}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText}`}>
                {meta.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
