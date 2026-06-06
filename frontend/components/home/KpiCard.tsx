"use client"

import { LucideIcon, MoreVertical } from "lucide-react"

interface UnitValue {
  label: string
  value: number | null
}

type Variant = "blue" | "purple" | "amber" | "rose"

const V: Record<
  Variant,
  {
    accent: string
    iconBg: string
    chipBg: string
  }
> = {
  blue:   { accent: "#2563EB", iconBg: "#EFF6FF", chipBg: "#F8FAFC" },
  amber:  { accent: "#F59E0B", iconBg: "#FFF4E5", chipBg: "#FFFBF0" },
  purple: { accent: "#7C3AED", iconBg: "#F3EBFF", chipBg: "#FAF8FF" },
  rose:   { accent: "#E11D48", iconBg: "#FEF2F2", chipBg: "#FFF5F5" },
}

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
      className="relative bg-white rounded-2xl overflow-hidden h-full flex flex-col hover:-translate-y-0.5 transition-all duration-200"
      style={{
        border: `1px solid ${s.accent}30`,
        boxShadow: "0 2px 8px rgba(16,24,40,0.06), 0 0 0 0 transparent",
      }}
    >
      {/* Accent bar */}
      <div className="absolute top-0 left-0 w-0.75 h-full rounded-l-2xl" style={{ backgroundColor: s.accent }} />

      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col gap-4">

        {/* ── Top row ──────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">

          {/* Icon circle */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: s.iconBg }}
          >
            <Icon size={20} style={{ color: s.accent }} />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{title}</p>
            <p className="text-xs text-slate-400 mt-0.5">Resumo do dia</p>
          </div>

          {/* Divider */}
          <div className="self-stretch w-px border-l border-dashed border-slate-200 mx-1 shrink-0" />

          {/* Total */}
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold tracking-[0.12em] text-slate-400 uppercase mb-1">Total Geral</p>
            {loading ? (
              <div className="h-10 w-14 bg-slate-100 rounded-lg animate-pulse" />
            ) : (
              <p className="text-3xl font-bold tracking-tight leading-none" style={{ color: s.accent }}>{total}</p>
            )}
          </div>

          {/* Menu */}
          <button className="text-slate-300 hover:text-slate-500 transition-colors ml-1 mt-0.5 shrink-0">
            <MoreVertical size={15} />
          </button>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <div className="border-t border-slate-100" />

        {/* ── Unit chips ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {units.map((unit) => (
            <div
              key={unit.label}
              className="flex flex-col items-center rounded-xl px-2 py-2.5"
              style={{ backgroundColor: s.chipBg, border: `1px solid ${s.accent}20` }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.accent }} />
                <span className="text-[10px] text-slate-500 leading-none truncate">{unit.label}</span>
              </div>
              {loading ? (
                <div className="h-5 w-8 bg-slate-200 rounded animate-pulse" />
              ) : (
                <span className="text-lg font-bold leading-none" style={{ color: s.accent }}>
                  {unit.value ?? "—"}
                </span>
              )}
            </div>
          ))}
        </div>

      </div>

      {/* ── Wave ─────────────────────────────────────────────────────────── */}
      <div className="h-8 w-full pointer-events-none select-none" style={{ opacity: 0.12 }}>
        <svg viewBox="0 0 400 28" preserveAspectRatio="none" className="w-full h-full">
          <path
            d="M0,14 C40,4 80,24 120,14 C160,4 200,24 240,14 C280,4 320,24 360,14 C380,9 392,18 400,14 L400,28 L0,28 Z"
            fill={s.accent}
          />
        </svg>
      </div>
    </div>
  )
}
