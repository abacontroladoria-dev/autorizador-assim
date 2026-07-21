"use client"

// StatCard — card premium de métrica: faixa de gradiente no topo + ícone
// circular tonal + label uppercase + conteúdo. Extraído de
// AnaliseFuturaTab.StatCardShell / CardRemun.KpiStatCard (§3.2 do plano).
//
// Uso: <StatCard tone="green" icon={<Wallet size={15}/>} label="Total">…</StatCard>

import type { ReactNode } from "react"
import { ICON_BG, TONE_ACCENT, TONE_SOFT, type Tone } from "./tones"

interface StatCardProps {
  tone: Tone
  icon: ReactNode
  label: ReactNode
  /** Tinta o card com o par suave da tonalidade (senão usa bg-card neutro). */
  tinted?: boolean
  className?: string
  children: ReactNode
}

export function StatCard({ tone, icon, label, tinted = true, className = "", children }: StatCardProps) {
  const accent = TONE_ACCENT[tone]
  const surface = tinted ? TONE_SOFT[tone].bg : "bg-card"
  return (
    <div className={`rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden h-full flex flex-col ${surface} ${className}`}>
      <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}33)` }} />
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${ICON_BG[tone]}`} style={{ color: accent }}>
            {icon}
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        {children}
      </div>
    </div>
  )
}