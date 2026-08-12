"use client"

// Cor semântica que reage ao tema — extraído de CardTratativas.tsx (que já
// resolvia isto corretamente) para ser reaproveitado em qualquer componente
// que precise da mesma paleta de 6 tons sem repetir os hex por tema.
// Ver audit de 2026-08-12: TratativasDashboard usava B.amber fixo e caía pra
// 3,57:1 no dark mode — abaixo do mínimo de 4,5:1 em texto pequeno/negrito.

import { useCallback } from "react"
import { useTheme } from "@/contexts/ThemeContext"

export type Tone = "green" | "amber" | "red" | "purple" | "blue" | "gray"

export const TONE_HEX: Record<Tone, { light: string; dark: string }> = {
  green:  { light: "#15803d", dark: "#34d399" },
  amber:  { light: "#b45309", dark: "#fbbf24" },
  red:    { light: "#dc2626", dark: "#fb7185" },
  purple: { light: "#7c3aed", dark: "#c4b5fd" },
  blue:   { light: "#2563eb", dark: "#60a5fa" },
  gray:   { light: "#6b7280", dark: "#9ca3af" },
}

export function useToneColor() {
  const { theme } = useTheme()
  return useCallback((tone: Tone) => TONE_HEX[tone][theme], [theme])
}
