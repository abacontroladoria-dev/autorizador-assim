"use client"

// Indicador minimalista de dia+turno (5 letras de dia + M/T) — extraído de
// SugestoesContratacaoPanel.tsx pra ser reaproveitado em qualquer card que
// precise mostrar "quando" sem desenhar a grade inteira.

import { DIAS_UTIL } from "@/lib/cronograma/constants"
import { diaCurto, turnoNome } from "@/lib/cronograma/helpers"
import type { Turno } from "@/lib/cronograma/simulacaoNovoPrestador"

export function IndicadorDiaTurno({ dia, turnos, corBar }: { dia: string; turnos: Turno[]; corBar: string }) {
  return (
    <div className="mt-2 flex flex-nowrap items-center gap-3">
      <div className="flex items-center gap-1">
        {DIAS_UTIL.map(d => {
          const ativo = d === dia
          return (
            <span
              key={d}
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${ativo ? `${corBar} text-white` : "bg-muted text-muted-foreground"}`}
            >
              {diaCurto(d)[0]}
            </span>
          )
        })}
      </div>
      <span className="h-5 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-2">
        {(["manha", "tarde"] as Turno[]).map(t => {
          const ativo = turnos.includes(t)
          return (
            <span
              key={t}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ativo ? `${corBar} text-white` : "bg-muted text-muted-foreground"}`}
            >
              {turnoNome[t][0]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
