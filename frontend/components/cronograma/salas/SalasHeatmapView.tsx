"use client"

// SalasHeatmapView — mapa de calor sala × dia, com Manhã empilhada acima de
// Tarde (2 linhas por sala) em vez de lado a lado. Faixas de cor 0-39/40-59/
// 60-79/80-100 (mesma paleta de corFaixaOcupacao/ocupacaoProf.ts).

import { Eye, EyeOff } from "lucide-react"
import { corFaixaOcupacao, textoFaixaOcupacaoSala } from "@/lib/cronograma/salas"
import { CAPACIDADE_LABEL_CURTO } from "@/lib/cronograma/salasTypes"
import type { SalaComOcupacao, SlotOcupacaoSala } from "@/lib/cronograma/salasTypes"

const DIAS = [
  { dow: 1, label: "Seg" },
  { dow: 2, label: "Ter" },
  { dow: 3, label: "Qua" },
  { dow: 4, label: "Qui" },
  { dow: 5, label: "Sex" },
] as const

const TURNOS = ["Manhã", "Tarde"] as const

/** Tinta neutra por turno (usa a própria paleta de cinza do sistema, funciona em light e dark) — só pra ficar claro onde a manhã termina e a tarde começa. */
const TURNO_ROW_BG: Record<(typeof TURNOS)[number], string> = {
  "Manhã": "",
  "Tarde": "bg-slate-200/70 dark:bg-white/[0.06]",
}

interface SalasHeatmapViewProps {
  salas: SalaComOcupacao[]
  /** Alterna o modo solo: mostra só esta sala na visão atual. Clicar de novo (ou no botão "voltar para todas" acima da tabela) restaura as demais. */
  onIsolarSala: (id: string, nome: string) => void
  /** Id da sala em modo solo, se houver — usado só para trocar o ícone do botão para indicar o estado ativo. */
  salaIsoladaId: string | null
}

export function SalasHeatmapView({ salas, onIsolarSala, salaIsoladaId }: SalasHeatmapViewProps) {
  if (!salas.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma sala cadastrada para os filtros selecionados.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Sala</th>
              <th className="w-10 border-l border-border bg-muted/40 px-1 py-2 text-center text-[10px] font-bold uppercase text-muted-foreground">Turno</th>
              {DIAS.map(d => (
                <th key={d.dow} className="border-l border-border px-2 py-2 text-center text-xs font-bold uppercase text-muted-foreground">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salas.map(({ sala, slots }) => (
              TURNOS.map((turno, turnoIdx) => (
                <tr key={`${sala.id}-${turno}`} className={TURNO_ROW_BG[turno]}>
                  {turnoIdx === 0 && (
                    <td rowSpan={2} className="sticky left-0 z-10 w-[200px] max-w-[200px] border-t border-border bg-card px-3 py-2 align-top">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-foreground" title={sala.nome_exibicao}>{sala.nome_exibicao}</div>
                          <div className="truncate text-[11px] text-muted-foreground" title={sala.unidade_nome}>{sala.unidade_nome}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onIsolarSala(sala.id, sala.nome_exibicao)}
                          aria-label={salaIsoladaId === sala.id ? `Voltar a mostrar todas as salas` : `Mostrar só ${sala.nome_exibicao}`}
                          title={salaIsoladaId === sala.id ? "Voltar a mostrar todas as salas" : "Mostrar só esta sala"}
                          className={`mt-0.5 shrink-0 rounded-md p-1 hover:bg-muted hover:text-foreground ${salaIsoladaId === sala.id ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
                        >
                          {salaIsoladaId === sala.id ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                          {CAPACIDADE_LABEL_CURTO[sala.capacidade]}
                        </span>
                        {sala.nucleo && (
                          <span className="truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title={sala.nucleo}>
                            {sala.nucleo}
                          </span>
                        )}
                        {sala.andar && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {sala.andar}º andar
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className={`w-10 border-l border-border px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground ${turnoIdx === 0 ? "border-t" : ""}`}>
                    {turno === "Manhã" ? "M" : "T"}
                  </td>
                  {DIAS.map(d => (
                    <HeatCell
                      key={`${sala.id}-${d.dow}-${turno}`}
                      slot={slots.find(s => s.dow === d.dow && s.turno === turno)}
                      bordaTopo={turnoIdx === 0}
                    />
                  ))}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-semibold">Legenda:</span>
        {[0.2, 0.5, 0.7, 0.9].map(p => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: corFaixaOcupacao(p) }} />
            {textoFaixaOcupacaoSala(p)}
          </span>
        ))}
      </div>
    </div>
  )
}

function HeatCell({ slot, bordaTopo }: { slot: SlotOcupacaoSala | undefined; bordaTopo: boolean }) {
  const bordaCls = bordaTopo ? "border-t" : ""

  if (!slot || slot.status === "adm") {
    return <td className={`border-l border-border bg-muted/30 px-1 py-2 text-center text-[10px] text-muted-foreground ${bordaCls}`}>ADM</td>
  }
  if (slot.status === "bloqueado") {
    return <td className={`border-l border-border bg-slate-300 px-1 py-2 text-center text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-200 ${bordaCls}`}>Bloq.</td>
  }
  if (!slot.alocacoes.length) {
    return <td className={`border-l border-border px-1 py-2 text-center text-[10px] text-muted-foreground ${bordaCls}`}>—</td>
  }
  const sessoesTotal = slot.alocacoes.reduce((s, a) => s + a.sessoesReais, 0)
  const capacidadeTotal = slot.alocacoes.reduce((s, a) => s + a.sessoesCapacidadeTurno, 0)
  const pct = capacidadeTotal > 0 ? sessoesTotal / capacidadeTotal : null
  const cor = corFaixaOcupacao(pct)
  return (
    <td
      className={`border-l border-border px-1 py-2 text-center text-[10px] font-semibold ${bordaCls}`}
      style={{ background: cor, color: pct !== null && pct >= 0.4 && pct < 0.6 ? "#222847" : "#fff" }}
      title={`${slot.alocacoes.length} alocação(ões) · ${sessoesTotal} sessão(ões) de ${capacidadeTotal} no turno${slot.inconsistente ? " · capacidade excedida" : ""}`}
    >
      {pct !== null ? `${Math.round(pct * 100)}%` : "—"}
    </td>
  )
}
