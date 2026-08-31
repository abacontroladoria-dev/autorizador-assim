"use client"

// Vocabulário visual das telas no padrão de detalhamento em modal
// (docs/padrao-detalhamento-modal.md §3.5): um tom = um significado, e o tom de
// um conceito é o mesmo no card, na composição, na aba e na coluna da tabela.
//
// Nasceu dentro de CardTratativas.tsx; virou módulo quando o modal da Análise de
// Evolução passou a usar o mesmo mapa, e subiu para components/ui/ quando a
// Rem. Mês - Total precisou dele — nunca duas tabelas de cor para o mesmo
// conceito. Consome `Tone` de @/hooks/useToneColor, a única união de tons deste
// padrão.
//
// Não confundir com components/cronograma/ui/tones.ts, que serve os painéis do
// Cronograma e tem união própria (`slate` no lugar de `gray`).
//
// A cor de TEXTO em destaque continua vindo de useToneColor() — este mapa é só
// de fundo/tint, onde o contraste já está garantido pelo par bg/text.

import type { Tone } from "@/hooks/useToneColor"

/** Chip sólido-suave: fundo tonalizado + texto legível nos dois temas. */
export const TONE_CHIP: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  amber:  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  red:    { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/40",   text: "text-purple-700 dark:text-purple-300" },
  blue:   { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300" },
  gray:   { bg: "bg-slate-100 dark:bg-slate-800/60",     text: "text-slate-600 dark:text-slate-400" },
}

/** Tint de superfície — bem mais leve que o chip, para blocos maiores. */
export const TONE_PANEL: Record<Tone, { bg: string; ring: string }> = {
  green:  { bg: "bg-emerald-50 dark:bg-emerald-950/30", ring: "ring-emerald-200 dark:ring-emerald-800/60" },
  amber:  { bg: "bg-amber-50 dark:bg-amber-950/30",     ring: "ring-amber-200 dark:ring-amber-800/60" },
  red:    { bg: "bg-rose-50 dark:bg-rose-950/30",       ring: "ring-rose-200 dark:ring-rose-800/60" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30",   ring: "ring-purple-200 dark:ring-purple-800/60" },
  blue:   { bg: "bg-sky-50 dark:bg-sky-950/30",         ring: "ring-sky-200 dark:ring-sky-800/60" },
  gray:   { bg: "bg-muted/60",                          ring: "ring-border" },
}

export function StatusChip({ tone, children, className = "", dense = false }: {
  tone: Tone; children: React.ReactNode; className?: string; dense?: boolean
}) {
  const c = TONE_CHIP[tone]
  const sizing = dense ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap transition-colors duration-200 ${sizing} ${c.bg} ${c.text} ${className}`}>
      {children}
    </span>
  )
}
