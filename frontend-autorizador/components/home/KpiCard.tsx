"use client"

import { LucideIcon } from "lucide-react"

interface UnitValue {
  label: string
  value: number | null
}

type Variant = "blue" | "purple"

const V = {
  blue: {
    leftBorder: "#3A8FB7",
    iconBg: "bg-[#eaf4fb]",
    iconColor: "text-[#3A8FB7]",
    numberColor: "text-[#3A8FB7]",
    dotBg: "bg-[#3A8FB7]",
    ghostColor: "#3A8FB7",
  },
  purple: {
    leftBorder: "#7c3aed",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    numberColor: "text-purple-600",
    dotBg: "bg-purple-400",
    ghostColor: "#7c3aed",
  },
} as const

interface KpiCardProps {
  title: string
  icon: LucideIcon
  total: number | null
  units: UnitValue[]
  variant?: Variant
}

export default function KpiCard({
  title,
  icon: Icon,
  total,
  units,
  variant = "blue",
}: KpiCardProps) {
  const s = V[variant]
  const loading = total === null

  return (
    <div
      className="relative bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
      style={{ borderLeft: `4px solid ${s.leftBorder}` }}
    >
      {/* Ghost icon */}
      <div
        className="absolute right-3 top-3 pointer-events-none select-none"
        style={{ color: s.ghostColor, opacity: 0.06 }}
      >
        <Icon size={100} strokeWidth={1} />
      </div>

      <div className="p-6">
        {/* Icon + Title + Number */}
        <div className="flex items-start gap-3 mb-5">
          <div className={`${s.iconBg} ${s.iconColor} p-2.5 rounded-xl shrink-0`}>
            <Icon size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 leading-snug">{title}</p>
            {loading ? (
              <div className="h-10 w-24 bg-slate-100 rounded-lg animate-pulse mt-1.5" />
            ) : (
              <p className={`text-5xl font-bold leading-none mt-1.5 ${s.numberColor}`}>
                {total}
              </p>
            )}
          </div>
        </div>

        {/* Unit breakdown */}
        <div className="border-t border-slate-50 pt-3 space-y-2.5">
          {units.map((unit) => (
            <div key={unit.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.dotBg}`} />
                <span className="text-xs text-slate-500">{unit.label}</span>
              </div>
              {loading ? (
                <div className="h-3 w-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                <span className="text-xs font-bold text-slate-700">{unit.value ?? "—"}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
