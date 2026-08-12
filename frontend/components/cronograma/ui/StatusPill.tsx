"use client"

// StatusPill — unifica o `Chip` (AnaliseFuturaTab) e o `StatusChip` (CardRemun),
// hoje reimplementados em 3+ arquivos. Ver §2.4 / §3 do plano.
//
// • variant="soft"  → par -50/-700  (chip leve, destaque de texto)
// • variant="solid" → par -100/-700 (badge de status proeminente)
// • dense           → tamanho reduzido (uso em células de tabela densas)

import type { ReactNode } from "react"
import { TONE_SOFT, TONE_SOLID, type Tone } from "./tones"

interface StatusPillProps {
  tone: Tone
  variant?: "soft" | "solid"
  dense?: boolean
  title?: string
  className?: string
  children: ReactNode
}

export function StatusPill({
  tone, variant = "soft", dense = false, title, className = "", children,
}: StatusPillProps) {
  const c = variant === "solid" ? TONE_SOLID[tone] : TONE_SOFT[tone]
  const sizing = dense ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sizing} ${c.bg} ${c.text} ${className}`}
    >
      {children}
    </span>
  )
}