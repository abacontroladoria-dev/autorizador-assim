"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import type { ProfRemunReal, PEDetalheItem } from "@/lib/remuneracao/calculo"

export type PeFiltroKey = "confirmado" | "integral" | "proporcional" | "zero" | "diretoria" | "troca" | "semEvolucao"

const PREDICADOS: Record<PeFiltroKey, (x: PEDetalheItem) => boolean> = {
  confirmado: x => x.valor != null && Number(x.valor) > 0,
  integral: x => x.situacao === "PE integral",
  proporcional: x => String(x.situacao || "").includes("proporcional"),
  zero: x => String(x.situacao || "").startsWith("PE zero"),
  diretoria: x => String(x.situacao || "").includes("Diretoria") || String(x.situacao || "").includes("Conflito"),
  troca: x => String(x.situacao || "").includes("troca"),
  semEvolucao: x => String(x.situacao || "").includes("sem evolução"),
}

export function profTemPe(p: ProfRemunReal, filtro: PeFiltroKey): boolean {
  return (p.peDetalhe || []).some(PREDICADOS[filtro])
}

const CARDS: { key: PeFiltroKey; label: string; cor: string; bg: string }[] = [
  { key: "confirmado", label: "PE confirmado", cor: B.green, bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { key: "integral", label: "PE integral", cor: B.green, bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { key: "proporcional", label: "Proporcional confirmado", cor: B.blue, bg: "bg-sky-50 dark:bg-sky-950/30" },
  { key: "zero", label: "Zero automático", cor: B.gray, bg: "bg-slate-100 dark:bg-slate-800/60" },
  { key: "diretoria", label: "Diretoria/conflito", cor: B.orange, bg: "bg-orange-50 dark:bg-orange-950/30" },
  { key: "troca", label: "Troca de coordenador", cor: B.amber, bg: "bg-amber-50 dark:bg-amber-950/30" },
  { key: "semEvolucao", label: "Sem evolução", cor: B.red, bg: "bg-rose-50 dark:bg-rose-950/30" },
]

export function PeCoordenadoresPanel({
  resultado, filtroAtivo, onFiltro,
}: {
  resultado: ProfRemunReal[]
  filtroAtivo: PeFiltroKey | null
  onFiltro: (f: PeFiltroKey | null) => void
}) {
  const [aberto, setAberto] = useState(false)

  const detalhes = useMemo(
    () => resultado.flatMap(p => (p.peDetalhe || []).map(x => ({ ...x, profissional: p.prof }))),
    [resultado]
  )

  const contagens = useMemo(() => {
    const out: Record<PeFiltroKey, number> = { confirmado: 0, integral: 0, proporcional: 0, zero: 0, diretoria: 0, troca: 0, semEvolucao: 0 }
    for (const key of Object.keys(PREDICADOS) as PeFiltroKey[]) {
      out[key] = detalhes.filter(PREDICADOS[key]).length
    }
    return out
  }, [detalhes])

  if (detalhes.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-bold text-sm text-foreground inline-flex items-center gap-1.5">
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          PE dos Coordenadores — visão gerencial
        </span>
        <span className="text-xs text-muted-foreground">{detalhes.length} paciente(s) analisado(s)</span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          {CARDS.map(({ key, label, cor, bg }) => {
            const selected = filtroAtivo === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFiltro(selected ? null : key)}
                aria-pressed={selected}
                className={`rounded-lg px-3 py-2 text-left border transition-all ${bg} ${
                  selected ? "border-current ring-2 ring-offset-1 ring-current" : "border-transparent hover:opacity-80"
                }`}
                style={{ color: cor }}
              >
                <div className="font-black text-lg">{contagens[key]}</div>
                <div className="text-[11px]">{label}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
