"use client"

import { useMemo, useState } from "react"
import { ArrowUp, BarChart3, Check, CheckCircle2, X } from "lucide-react"
import type { AlgorithmResult } from "@/types/cronograma"
import { SearchInput, EmptyState } from "@/components/cronograma/ui/DataTable"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { TerapiaChip } from "@/components/cronograma/ui/TerapiaChip"
import { SegmentedTabs, type SegmentedTab } from "@/components/cronograma/ui/SegmentedTabs"
import { TONE_ACCENT, type Tone } from "@/components/cronograma/ui/tones"

interface Props {
  res: AlgorithmResult | null
}

type GapFilt = "all" | "pos" | "zero" | "neg" | "alta"

const FILT_TABS: SegmentedTab<GapFilt>[] = [
  { value: "all", label: "Todos" },
  { value: "pos", label: "Gap > 0" },
  { value: "zero", label: "Sem gap" },
  { value: "neg", label: "Sobre-agendado" },
  { value: "alta", label: <><ArrowUp size={11} /> Com Alta</> },
]

// Semântica do gap → par tonal (§4 do plano): faltando=vermelho,
// sobre-agendado=âmbar, ok=verde.
const gapTone = (g: number): Tone => (g > 0 ? "red" : g < 0 ? "amber" : "green")
const gapLabel = (g: number) => (g > 0 ? `−${g} faltando` : g < 0 ? `+${Math.abs(g)} a mais` : "ok")

export function GapsTab({ res }: Props) {
  const [gapSearch, setGapSearch] = useState("")
  const [gapFilt, setGapFilt] = useState<GapFilt>("pos")
  const [gapTudoZero, setGapTudoZero] = useState(false)
  const [gapEsp, setGapEsp] = useState("")

  const espOpts = useMemo(() => [...new Set((res?.allGaps || []).map(g => g.esp))].sort(), [res])

  const rows = useMemo(() => {
    let r = res?.allGaps || []
    if (gapSearch) r = r.filter(g => g.pac.toLowerCase().includes(gapSearch.toLowerCase()))
    if (gapEsp) r = r.filter(g => g.esp === gapEsp)
    if (gapFilt === "pos") r = r.filter(g => g.gap > 0 && !g.isAlta)
    else if (gapFilt === "zero") r = r.filter(g => g.gap === 0 && !g.isAlta)
    else if (gapFilt === "neg") r = r.filter(g => g.gap < 0 && !g.isAlta)
    else if (gapFilt === "alta") r = r.filter(g => g.isAlta)
    // "all" inclui tudo
    if (gapTudoZero) {
      const baseGaps = gapFilt === "alta"
        ? (res?.allGaps || []).filter(g => g.isAlta)
        : (res?.allGaps || [])
      const pacOf: Record<string, number> = {}
      for (const g of baseGaps) { pacOf[g.pac] = (pacOf[g.pac] || 0) + g.of }
      r = r.filter(g => pacOf[g.pac] === 0)
    }
    return [...r].sort((a, b) => a.pac.localeCompare(b.pac) || b.gap - a.gap)
  }, [res, gapSearch, gapEsp, gapFilt, gapTudoZero])

  return (
    <div className="space-y-3">
      {/* ── Barra de filtros (§2.6) ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={gapSearch} onChange={setGapSearch} />
          <select
            value={gapEsp}
            onChange={e => setGapEsp(e.target.value)}
            aria-label="Filtrar por especialidade"
            className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas especialidades</option>
            {espOpts.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          <SegmentedTabs value={gapFilt} onChange={setGapFilt} tabs={FILT_TABS} ariaLabel="Filtrar gaps" />

          <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer font-medium transition-colors ${gapTudoZero ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:text-foreground"}`}>
            <input
              type="checkbox"
              checked={gapTudoZero}
              onChange={e => setGapTudoZero(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-rose-600 dark:accent-rose-500"
            />
            Sem nada agendado
          </label>

          {gapSearch && (
            <button
              type="button"
              onClick={() => setGapSearch("")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={12} /> limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Resultados ───────────────────────────────────────────────────── */}
      {!rows.length ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState icon={CheckCircle2} text="Nenhum gap com esses filtros" />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none">
          {/* Cabeçalho: título + legenda de dots */}
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-muted-foreground" />
              <span className="text-md font-bold text-foreground">Gaps</span>
              <span className="text-xs text-muted-foreground tabular-nums">· {rows.length} {rows.length === 1 ? "entrada" : "entradas"}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <LegendDot tone="red" label="Faltando sessões" />
              <LegendDot tone="amber" label="Sobre-agendado" />
              <LegendDot tone="green" label="Ok" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-muted-foreground">
                  <th className="text-left font-bold uppercase tracking-wide px-3 py-2">Paciente</th>
                  <th className="text-left font-bold uppercase tracking-wide px-3 py-2">Especialidade</th>
                  <th className="text-center font-bold uppercase tracking-wide px-3 py-2">Autorizado</th>
                  <th className="text-center font-bold uppercase tracking-wide px-3 py-2">Ofertado</th>
                  <th className="text-center font-bold uppercase tracking-wide px-3 py-2">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => (
                  <tr
                    key={i}
                    className={`border-t border-border hover:bg-muted/40 transition-colors ${g.isAlta ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                  >
                    <td className="px-3 py-2 font-semibold text-foreground">{g.pac}</td>
                    <td className="px-3 py-2"><TerapiaChip esp={g.esp} dense /></td>
                    <td className="px-3 py-2 text-center font-semibold text-foreground tabular-nums">{g.aut || "—"}</td>
                    <td className="px-3 py-2 text-center text-foreground tabular-nums">{g.of}</td>
                    <td className="px-3 py-2 text-center">
                      {g.isAlta ? (
                        <StatusPill tone="amber" variant="solid" dense title="Paciente recebeu alta para esta especialidade. O gap é esperado.">
                          <ArrowUp size={11} /> Alta
                        </StatusPill>
                      ) : (
                        <StatusPill tone={gapTone(g.gap)} variant="solid" dense>
                          {g.gap === 0 && <Check size={11} />}
                          {gapLabel(g.gap)}
                        </StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: TONE_ACCENT[tone] }} />
      {label}
    </span>
  )
}