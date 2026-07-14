"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

export function ContratosPendentesPanel({ resultado }: { resultado: ProfRemunReal[] }) {
  const [aberto, setAberto] = useState(false)

  const pendentes = useMemo(() => resultado.filter(p => !p.temAntigo), [resultado])

  if (pendentes.length === 0) return null

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-sm text-rose-700 dark:text-rose-400 inline-flex items-center gap-1.5">
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <AlertTriangle size={14} />
          {pendentes.length} profissional{pendentes.length !== 1 ? "is" : ""} sem dados de contrato antigo
        </span>
      </button>

      {aberto && (
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1">
          {pendentes.map(p => (
            <div key={p.prof} className="text-xs py-1 flex justify-between gap-2">
              <span className="text-foreground">{p.prof}</span>
              <span className="text-muted-foreground">{p.contrato || "sem contrato"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
