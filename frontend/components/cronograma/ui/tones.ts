// ─── Sistema tonal compartilhado (dark-mode aware) ───────────────────────────
// Fonte única dos pares tonais do módulo Cronograma. Consolida os mapas que
// hoje estão duplicados em CardRemun.tsx (TONE_CHIP/TONE_HEX/KPI_CARD_BG) e
// AnaliseFuturaTab.tsx (TONE_CLS/ICON_BG/TONE_ACCENT). Ver §2.1 do plano.
//
// Convenção: superfícies grandes + texto → classes Tailwind com par dark:
// (nunca hex de status solto, que fica invisível no dark). Accents minúsculos
// (dot de legenda, faixa de gradiente) usam TONE_ACCENT como string de cor.

import { B } from "@/lib/cronograma/constants"

export type Tone = "green" | "amber" | "blue" | "purple" | "red" | "slate"

// Par suave: fundo -50 + texto -700 (cards, chips leves, faixas de destaque).
export const TONE_SOFT: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400" },
  amber:  { bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-700 dark:text-amber-400" },
  blue:   { bg: "bg-sky-50 dark:bg-sky-950/30",         text: "text-sky-700 dark:text-sky-400" },
  purple: { bg: "bg-violet-50 dark:bg-violet-950/30",   text: "text-violet-700 dark:text-violet-400" },
  red:    { bg: "bg-rose-50 dark:bg-rose-950/30",       text: "text-rose-700 dark:text-rose-400" },
  slate:  { bg: "bg-slate-100 dark:bg-slate-800/60",    text: "text-slate-600 dark:text-slate-400" },
}

// Par forte: fundo -100 + texto -700/-300 (badge de status proeminente).
export const TONE_SOLID: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  amber:  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  blue:   { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300" },
  purple: { bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300" },
  red:    { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
  slate:  { bg: "bg-slate-200 dark:bg-slate-800",        text: "text-slate-700 dark:text-slate-300" },
}

// Fundo do ícone circular tonal (cabeçalho de card).
export const ICON_BG: Record<Tone, string> = {
  green:  "bg-emerald-100 dark:bg-emerald-900/40",
  amber:  "bg-amber-100 dark:bg-amber-900/40",
  blue:   "bg-sky-100 dark:bg-sky-900/40",
  purple: "bg-violet-100 dark:bg-violet-900/40",
  red:    "bg-rose-100 dark:bg-rose-900/40",
  slate:  "bg-slate-200 dark:bg-slate-800",
}

// Cor sólida (string) para props que exigem cor literal: faixa de gradiente do
// topo do card, cor do ícone Lucide, dot de legenda. slate usa cinza médio —
// B.navy é escuro demais para servir de accent sobre fundo já escuro no dark.
export const TONE_ACCENT: Record<Tone, string> = {
  green: B.green, amber: B.amber, blue: B.blue, purple: B.purple, red: B.red, slate: "#64748b",
}