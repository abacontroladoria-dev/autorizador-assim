"use client"

// Dashboard de topo da Análise de Tratativas — versão "só contagens" do
// RemuneracaoRPDashboard. No lugar do "Total do mês que a empresa vai pagar"
// (R$), mostra o total de sessões COM TRATATIVA registrada, e a repartição por
// especialidade também POR CONTAGEM (não por valor).

import { useMemo, useState } from "react"
import { ClipboardCheck, Users, X } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import type { ProfTratativas } from "@/lib/remuneracao/tratativas"

interface DashboardProps {
  resultado: ProfTratativas[]
  especialidadeFiltro: string | null
  onFiltroEspecialidade: (esp: string | null) => void
}

type EspContagem = { especialidade: string; qtd: number; pct: number; profissionais: string[] }

// Conta sessões COM tratativa (evolução própria ou substituição realizada) por
// especialidade — o mesmo conjunto elegível usado no card, sem qualquer valor.
function contarPorEspecialidade(resultado: ProfTratativas[]): { totalTratativas: number; porEspecialidade: EspContagem[] } {
  const mapa: Record<string, { qtd: number; profs: Set<string> }> = {}

  for (const p of resultado) {
    for (const s of p.sessoes) {
      const comTratativa =
        s.papel === "Substituição realizada" ||
        (s.papel === "Agenda" && s.classificacao === "Evolução normal")
      if (!comTratativa) continue
      const key = s.especialidade || "Sem especialidade"
      if (!mapa[key]) mapa[key] = { qtd: 0, profs: new Set() }
      mapa[key].qtd += 1
      mapa[key].profs.add(p.prof)
    }
  }

  const totalTratativas = Object.values(mapa).reduce((s, x) => s + x.qtd, 0)
  const porEspecialidade = Object.entries(mapa)
    .map(([especialidade, x]) => ({
      especialidade,
      qtd: x.qtd,
      pct: totalTratativas > 0 ? x.qtd / totalTratativas : 0,
      profissionais: [...x.profs].sort(),
    }))
    .filter(x => x.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd)

  return { totalTratativas, porEspecialidade }
}

export function TratativasDashboard({ resultado, especialidadeFiltro, onFiltroEspecialidade }: DashboardProps) {
  const { totalTratativas, porEspecialidade } = useMemo(() => contarPorEspecialidade(resultado), [resultado])
  const [hoverEsp, setHoverEsp] = useState<string | null>(null)

  const maxQtd = porEspecialidade[0]?.qtd ?? 0

  if (resultado.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${B.green}, ${B.blue})` }} />

      <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Hero: total de tratativas */}
        <div className="lg:col-span-2 flex flex-col justify-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <ClipboardCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
            Sessões com tratativa registrada
          </div>
          <div className="mt-2 text-4xl md:text-5xl font-bold text-emerald-600 dark:text-emerald-400 leading-none tabular-nums">
            {totalTratativas.toLocaleString("pt-BR")}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users size={13} />
            {resultado.length} profissional{resultado.length !== 1 ? "is" : ""} com tratativas neste período
          </div>
        </div>

        {/* Barras: tratativas por especialidade (contagem) */}
        <div className="lg:col-span-3 lg:border-l lg:border-border lg:pl-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Tratativas por especialidade
            </div>
            {especialidadeFiltro ? (
              <button
                type="button"
                onClick={() => onFiltroEspecialidade(null)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground hover:opacity-70 transition-opacity"
              >
                <X size={11} /> limpar filtro
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">clique para filtrar</span>
            )}
          </div>

          {porEspecialidade.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem tratativas para detalhar por especialidade ainda.</p>
          ) : (
            <div className="space-y-2.5">
              {porEspecialidade.map(esp => {
                const selected = especialidadeFiltro === esp.especialidade
                const dimmed = !!especialidadeFiltro && !selected
                const isHover = hoverEsp === esp.especialidade
                const widthPct = maxQtd > 0 ? Math.max((esp.qtd / maxQtd) * 100, 4) : 0
                return (
                  <button
                    key={esp.especialidade}
                    type="button"
                    onClick={() => onFiltroEspecialidade(selected ? null : esp.especialidade)}
                    onMouseEnter={() => setHoverEsp(esp.especialidade)}
                    onMouseLeave={() => setHoverEsp(null)}
                    onFocus={() => setHoverEsp(esp.especialidade)}
                    onBlur={() => setHoverEsp(null)}
                    title={`${esp.especialidade}: ${esp.qtd} tratativa(s) · ${(esp.pct * 100).toFixed(1)}% do total · ${esp.profissionais.length} profissional(is)`}
                    aria-pressed={selected}
                    className={`w-full text-left transition-opacity duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md ${dimmed ? "opacity-35" : "opacity-100"}`}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className={`text-xs truncate ${selected ? "font-bold text-foreground" : "font-semibold text-foreground/90"}`}>
                        {esp.especialidade}
                      </span>
                      <span className="text-xs font-bold tabular-nums text-foreground shrink-0">
                        {esp.qtd.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="h-3 rounded-md bg-muted overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-500 ease-out"
                        style={{ width: `${widthPct}%`, borderRadius: "2px 5px 5px 2px", background: selected || isHover ? B.blue : `${B.blue}b3` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
