"use client"

// UnidadeDashboardShell — dashboard de ocupação agregada por unidade, consumindo
// useOcupacaoSalas() (cruzamento cronograma_salas × csv_grades_profissionais).

import { Building2, DoorOpen, Loader2, Percent } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { textoFaixaOcupacaoSala } from "@/lib/cronograma/salas"
import type { Tone } from "@/components/cronograma/ui/tones"

function pctTone(pct: number | null): Tone {
  if (pct === null) return "slate"
  if (pct >= 0.8) return "green"
  if (pct >= 0.6) return "blue"
  if (pct >= 0.4) return "amber"
  return "red"
}

export function UnidadeDashboardShell() {
  const { resumoUnidades, loading, error } = useOcupacaoSalas()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando dados de unidades...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  const capacidadeTotal = resumoUnidades.reduce((s, r) => s + r.capacidadeSimultanea, 0)
  const salasTotal = resumoUnidades.reduce((s, r) => s + r.salasTotal, 0)
  const slotsTotal = resumoUnidades.reduce((s, r) => s + r.slotsTotal, 0)
  const slotsOcupados = resumoUnidades.reduce((s, r) => s + r.slotsOcupados, 0)
  const pctGeral = slotsTotal > 0 ? slotsOcupados / slotsTotal : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<Building2 size={15} />} label="Unidades">
          <div className="text-2xl font-black text-foreground">{resumoUnidades.length}</div>
        </StatCard>
        <StatCard tone="blue" icon={<DoorOpen size={15} />} label="Salas cadastradas">
          <div className="text-2xl font-black text-foreground">{salasTotal}</div>
        </StatCard>
        <StatCard tone="purple" icon={<DoorOpen size={15} />} label="Capacidade simultânea">
          <div className="text-2xl font-black text-foreground">{capacidadeTotal}</div>
        </StatCard>
        <StatCard tone={pctTone(pctGeral)} icon={<Percent size={15} />} label="Ocupação geral">
          <div className="text-2xl font-black text-foreground">{pctGeral !== null ? `${Math.round(pctGeral * 100)}%` : "—"}</div>
        </StatCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {resumoUnidades.map(r => (
          <div key={r.unidade} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-bold text-foreground">{r.unidade}</div>
              <StatusPill tone={pctTone(r.pct)}>{textoFaixaOcupacaoSala(r.pct)}</StatusPill>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div><span className="block text-sm font-bold text-foreground">{r.salasTotal}</span>Salas</div>
              <div><span className="block text-sm font-bold text-foreground">{r.salasAtivas}</span>Ativas</div>
              <div><span className="block text-sm font-bold text-foreground">{r.inconsistencias}</span>Inconsistências</div>
            </div>
            <div className="mt-3 flex gap-3 text-xs">
              {r.porTurno.map(t => (
                <div key={t.turno} className="flex-1 rounded-lg bg-muted/40 p-2">
                  <div className="font-semibold text-foreground">{t.turno}</div>
                  <div className="text-muted-foreground">{t.slotsOcupados}/{t.slotsTotal} ocupados</div>
                </div>
              ))}
            </div>
            {r.porTerapia.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">Terapias mais frequentes</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.porTerapia.slice(0, 5).map(t => (
                    <span key={t.terapia} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                      {t.terapia} · {t.sessoes}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
