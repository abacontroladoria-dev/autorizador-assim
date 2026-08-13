"use client"

// Badge circular de % de ocupação, colorido pela faixa (70/60/50) — extraído
// de SugestoesContratacaoPanel.tsx pra ser reaproveitado em qualquer painel
// que ranqueie por ocupação prevista/aproveitável (ex.: OportunidadesInternasPanel).

import type { FaixaCascata } from "@/lib/cronograma/sugestaoContratacao"

export const COR_OCUPACAO: Record<70 | 60 | 50, { badge: string; ring: string; bar: string }> = {
  70: {
    badge: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-200 dark:ring-emerald-800",
    bar: "bg-emerald-500",
  },
  60: {
    badge: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400",
    ring: "ring-sky-200 dark:ring-sky-800",
    bar: "bg-sky-500",
  },
  50: {
    badge: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    ring: "ring-amber-200 dark:ring-amber-800",
    bar: "bg-amber-500",
  },
}

export function BadgeOcupacao({ pct, faixa, label = "ocupação" }: { pct: number; faixa: FaixaCascata; label?: string }) {
  const cor = COR_OCUPACAO[faixa]
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 ring-1 ${cor.badge} ${cor.ring}`}>
      <span className="text-xl font-black leading-none tabular-nums">{Math.round(pct)}%</span>
      <span className="text-[9.5px] font-bold uppercase leading-none tracking-wide opacity-80">{label}</span>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className={`h-full ${cor.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}
