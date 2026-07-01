"use client"

import { useMemo, useState } from "react"
import { ORDEM_DIAS } from "@/types/reposicao"
import { DIA_ABR, fmtData } from "@/lib/cronograma/formatters"
import { extrairUnidade } from "@/lib/cronograma/reposicao"
import type { ResultadoReposicao, SessaoAgendada } from "@/types/reposicao"

// ─── Constantes ───────────────────────────────────────────────────────────────

const HORAS = [
  "08:00","08:40","09:20","10:00","10:40","11:20",
  "13:00","13:40","14:20","15:00","15:40","16:20","17:00",
]

// ─── Tipos internos ───────────────────────────────────────────────────────────

type CellCard = {
  tipo:         "presente" | "falta" | "proposta"
  terapia:      string
  profissional: string
  faltaId?:     string
}

// ─── Card individual ─────────────────────────────────────────────────────────

function SessionCard({
  card,
  selected,
  onToggle,
}: {
  card:     CellCard
  selected: boolean
  onToggle: () => void
}) {
  const isProposta = card.tipo === "proposta"
  const isFalta    = card.tipo === "falta"

  const style = (() => {
    if (isFalta) return {
      bg:     "#fffbeb",
      border: "#fcd34d",
      nameC:  "#92400e",
      profC:  "#b45309",
    }
    if (isProposta && selected) return {
      bg:     "#f0fdf4",
      border: "#86efac",
      nameC:  "#166534",
      profC:  "#16a34a",
    }
    return {
      bg:     "#ffffff",
      border: "#e2e8f0",
      nameC:  "#0f172a",
      profC:  "#94a3b8",
    }
  })()

  return (
    <div
      onClick={() => isProposta && onToggle()}
      style={{
        borderRadius: 8,
        border: `1px solid ${style.border}`,
        background: style.bg,
        padding: "8px 10px",
        minHeight: 76,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "background 0.15s, border-color 0.15s",
        cursor: isProposta ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {/* Indicador de tipo */}
      {isFalta && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "#b45309",
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          Falta
        </span>
      )}
      {isProposta && selected && (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            fontSize: 11,
            fontWeight: 800,
            color: "#16a34a",
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}

      {/* Nome da terapia */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: style.nameC,
          lineHeight: 1.3,
          paddingRight: 22,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}
      >
        {card.terapia || "—"}
      </div>

      {/* Profissional */}
      <div
        style={{
          fontSize: 12,
          color: style.profC,
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {card.profissional || "—"}
      </div>

      {/* Botão Recusar — apenas quando selecionado */}
      {isProposta && selected && (
        <div style={{ marginTop: "auto", paddingTop: 6, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#dc2626",
              lineHeight: 1.6,
            }}
          >
            Recusar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Célula vazia ─────────────────────────────────────────────────────────────

function EmptyCell() {
  return (
    <div style={{ minHeight: 76, borderRadius: 8, border: "1px solid transparent" }} />
  )
}

// ─── Chip na barra inferior ───────────────────────────────────────────────────

function PropostaChip({ dia, hora, terapia }: { dia: string; hora: string; terapia: string }) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: 8,
        padding: "5px 12px",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 700, color: "#166534" }}>{DIA_ABR[dia] ?? dia} · {hora}</div>
      <div style={{ color: "#15803d", marginTop: 1 }}>{terapia}</div>
    </div>
  )
}

// ─── Painel de resumo (direita) ───────────────────────────────────────────────

interface PainelResumoProps {
  resultados:       ResultadoReposicao[]
  sessoesAgendadas: SessaoAgendada[]
  selecionados:     Set<string>
}

// Primeiros dois nomes significativos (ignora partículas como "de", "da", "do")
function doisNomes(nome: string): string {
  const words = nome.split(' ')
  const result: string[] = []
  let count = 0
  for (const w of words) {
    result.push(w)
    if (w.length > 2) count++
    if (count >= 2) break
  }
  return result.join(' ').toUpperCase()
}

// Remove "Aplicador " do início; mantém o restante em maiúsculas
function abrevTerapia(t: string): string {
  return t.replace(/^Aplicador\s+/i, '').toUpperCase()
}

function PainelResumo({ resultados, sessoesAgendadas, selecionados }: PainelResumoProps) {
  const faltas = resultados.map(r => r.falta)
  const comSugestao = resultados.filter(r => r.status === "com_sugestao")

  // Detecção de unidade(s).
  // Sugestão só entra como fallback quando falta.unidade está vazio — evita poluir
  // o conjunto com unidades de reposições cross-unit, causando "3 unidades" falso.
  const todasUnidades = new Set<string>()
  faltas.forEach(f => { if (f.unidade) todasUnidades.add(extrairUnidade(f.unidade)) })
  sessoesAgendadas.forEach(s => { if (s.unidade) todasUnidades.add(extrairUnidade(s.unidade)) })
  comSugestao.forEach(r => {
    if (!r.falta.unidade && r.sugestoes?.[0]?.unidade) {
      todasUnidades.add(extrairUnidade(r.sugestoes[0].unidade))
    }
  })
  const unidades = [...todasUnidades]

  // Unidade majoritária — base para detectar qual sessão destoa.
  const unidContagem: Record<string, number> = {}
  faltas.forEach(f => {
    const u = f.unidade ? extrairUnidade(f.unidade) : null
    if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
  })
  sessoesAgendadas.forEach(s => {
    const u = s.unidade ? extrairUnidade(s.unidade) : null
    if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
  })
  // Quando faltas e sessões agendadas não têm unidade identificada (slot liberado),
  // usa as unidades das sugestões como proxy para determinar a unidade habitual.
  if (Object.keys(unidContagem).length === 0) {
    comSugestao.forEach(r => {
      const u = r.sugestoes?.[0]?.unidade ? extrairUnidade(r.sugestoes[0].unidade) : null
      if (u) unidContagem[u] = (unidContagem[u] ?? 0) + 1
    })
  }
  const unidMajoritaria = Object.entries(unidContagem).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: "#f8fafc",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        padding: "18px 16px",
        alignSelf: "flex-start",
        position: "sticky",
        top: 16,
        fontSize: 12,
        color: "#334155",
        lineHeight: 1.5,
      }}
    >
      {/* Cabeçalho */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
        textTransform: "uppercase", color: "#94a3b8", marginBottom: 12,
      }}>
        Faltou · {faltas.length} &nbsp;/&nbsp; Pode repor · {comSugestao.length}
      </div>

      {/* Linhas pareadas: falta + reposição logo abaixo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {resultados.map(r => {
          const f = r.falta
          const bestSug = r.status === "com_sugestao" ? r.sugestoes[0] : null
          const selected = selecionados.has(f.faltaId)
          const faltaUnid = f.unidade ? extrairUnidade(f.unidade) : null
          const isOutlier = unidades.length > 1 && unidMajoritaria !== null
            && faltaUnid !== null && faltaUnid !== unidMajoritaria

          return (
            <div key={f.faltaId} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              {/* Falta */}
              <div style={{
                flex: 1, minWidth: 0,
                background: "#fffbeb",
                border: `1px solid ${isOutlier ? "#f97316" : "#fcd34d"}`,
                borderRadius: 8,
                padding: "6px 10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#92400e", fontSize: 11 }}>
                      {(DIA_ABR[f.dia] ?? f.dia).toUpperCase()} · {f.hora}
                    </div>
                    <div style={{ color: "#b45309", fontSize: 11, marginTop: 1 }}>
                      {abrevTerapia(f.terapiaExibicao || f.terapia)}
                    </div>
                    {f.profissional && (
                      <div style={{ color: "#d97706", fontSize: 10, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doisNomes(f.profissional)}
                      </div>
                    )}
                  </div>
                  {isOutlier && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, flexShrink: 0,
                      background: "#fff7ed", color: "#ea580c",
                      border: "1px solid #fdba74", borderRadius: 4, padding: "1px 5px",
                    }}>
                      ⚠ {faltaUnid}
                    </span>
                  )}
                </div>
              </div>

              {/* Reposição ou status */}
              {bestSug ? (
                <div style={{
                  flex: 1, minWidth: 0,
                  background: selected ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${selected ? "#86efac" : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "6px 10px 7px 10px",
                }}>
                  <div style={{ fontWeight: 700, color: selected ? "#166534" : "#334155", fontSize: 11 }}>
                    {(DIA_ABR[bestSug.dia] ?? bestSug.dia).toUpperCase()} · {bestSug.hora}
                  </div>
                  <div style={{
                    color: selected ? "#15803d" : "#64748b", fontSize: 10, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {doisNomes(bestSug.profissional)}
                  </div>
                  <span style={{
                    display: "inline-block", marginTop: 5,
                    fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 5px",
                    background: bestSug.prioridade === "P1" ? "#eff6ff" : "#fff7ed",
                    color: bestSug.prioridade === "P1" ? "#1d4ed8" : "#c2410c",
                    border: `1px solid ${bestSug.prioridade === "P1" ? "#bfdbfe" : "#fed7aa"}`,
                  }}>
                    {selected ? "✓ " : ""}{bestSug.prioridade === "P1" ? "MESMO PROF." : "PROF. DIFERENTE"}
                  </span>
                </div>
              ) : (
                <div style={{
                  flex: 1, minWidth: 0,
                  background: r.status === "sem_disponibilidade" ? "#fef2f2" : "#f8fafc",
                  border: `1px solid ${r.status === "sem_disponibilidade" ? "#fca5a5" : "#e2e8f0"}`,
                  borderRadius: 8,
                  padding: "5px 10px 5px 10px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    color: r.status === "sem_disponibilidade" ? "#dc2626" : "#94a3b8",
                    fontSize: 10, fontStyle: "italic", textAlign: "center",
                  }}>
                    {r.status === "sem_disponibilidade" ? "sem disponibilidade"
                      : r.status === "irrecuperavel" ? "irrecuperável"
                      : "sem dados"}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Unidade */}
      {unidades.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: 8,
          }}>
            Unidade
          </div>
          {unidades.length === 1 ? (
            /* Caso simples: todas as sessões na mesma unidade */
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{unidades[0]}</span>
            </div>
          ) : (
            /* Caso multi-unidade: mostra a habitual + destaca quais faltas fogem dela */
            <div>
              {/* Unidade habitual */}
              {unidMajoritaria && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>{unidMajoritaria}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>habitual</span>
                </div>
              )}
              {/* Faltas em unidade diferente da habitual */}
              {(() => {
                const outliers = faltas.filter(f => {
                  if (!f.unidade) return false
                  return extrairUnidade(f.unidade) !== unidMajoritaria
                })
                const outliersAgend = sessoesAgendadas.filter(s => {
                  if (!s.unidade) return false
                  return extrairUnidade(s.unidade) !== unidMajoritaria
                })
                if (outliers.length === 0 && outliersAgend.length === 0) return null
                return (
                  <div style={{
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    borderRadius: 7,
                    padding: "7px 10px",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", marginBottom: 5 }}>
                      ⚠ Destoa da unidade habitual:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {outliers.map(f => (
                        <div key={f.faltaId} style={{ fontSize: 10, color: "#92400e" }}>
                          <span style={{ fontWeight: 700 }}>
                            {DIA_ABR[f.dia] ?? f.dia} {f.hora}
                          </span>
                          {" · "}
                          <span>{f.terapiaExibicao || f.terapia}</span>
                          <span style={{ color: "#c2410c", marginLeft: 4, fontWeight: 700 }}>
                            → {extrairUnidade(f.unidade)}
                          </span>
                        </div>
                      ))}
                      {outliersAgend.map((s, i) => (
                        <div key={i} style={{ fontSize: 10, color: "#64748b" }}>
                          <span style={{ fontWeight: 700 }}>
                            {DIA_ABR[s.dia] ?? s.dia} {s.hora}
                          </span>
                          {" · "}
                          <span>{s.terapiaExibicao || s.terapia}</span>
                          <span style={{ color: "#c2410c", marginLeft: 4, fontWeight: 700 }}>
                            → {extrairUnidade(s.unidade)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface VisaoComparativaProps {
  resultados:       ResultadoReposicao[]
  sessoesAgendadas: SessaoAgendada[]
  semanaInicio:     string
  onAceitar:        (faltaIds: string[]) => void
}

export function VisaoComparativa({
  resultados,
  sessoesAgendadas,
  semanaInicio,
  onAceitar,
}: VisaoComparativaProps) {
  const comSugestao = useMemo(
    () => resultados.filter(r => r.status === "com_sugestao"),
    [resultados],
  )

  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(comSugestao.map(r => r.falta.faltaId)),
  )

  // Data de cada dia da semana
  const diaToDate = useMemo(() => {
    const map: Record<string, string> = {}
    const d = new Date(`${semanaInicio}T12:00:00`)
    ORDEM_DIAS.forEach(dia => {
      map[dia] = d.toISOString().slice(0, 10)
      d.setDate(d.getDate() + 1)
    })
    return map
  }, [semanaInicio])

  // Grade: hora → dia → card
  // GARANTIA: presente é inserido primeiro; set() não sobrescreve.
  // O algoritmo (temConflitoPaciente) também bloqueia propostas no mesmo data+hora
  // de sessões existentes — dupla proteção.
  const { grid, horasAtivas, diasAtivos } = useMemo(() => {
    const g: Record<string, Record<string, CellCard>> = {}

    function set(hora: string, dia: string, c: CellCard) {
      if (!g[hora]) g[hora] = {}
      if (!g[hora][dia]) g[hora][dia] = c  // primeira inserção vence
    }

    // 1º: sessões em que o paciente compareceu (máxima prioridade na grade)
    sessoesAgendadas.forEach(s =>
      set(s.hora, s.dia, {
        tipo: "presente",
        terapia: s.terapiaExibicao || s.terapia,
        profissional: s.profissional,
      }),
    )

    // 2º: sessões faltadas (amarelo)
    resultados.forEach(r => {
      const f = r.falta
      set(f.hora, f.dia as string, {
        tipo: "falta",
        terapia: f.terapiaExibicao || f.terapia,
        profissional: f.profissional,
      })
    })

    // 3º: propostas de reposição — nunca sobreporão um "presente" (set é exclusivo)
    resultados.forEach(r => {
      if (r.status !== "com_sugestao") return
      const s = r.sugestoes[0]
      set(s.hora, s.dia as string, {
        tipo: "proposta",
        terapia: s.terapiaExibicao || s.terapia,
        profissional: s.profissional,
        faltaId: r.falta.faltaId,
      })
    })

    const horasAtivas = HORAS.filter(h => h in g)
    const diasComConteudo = new Set<string>()
    horasAtivas.forEach(h => Object.keys(g[h]).forEach(d => diasComConteudo.add(d)))
    const diasAtivos = ORDEM_DIAS.filter(d => diasComConteudo.has(d))

    return { grid: g, horasAtivas, diasAtivos }
  }, [resultados, sessoesAgendadas])

  const propostasSel = comSugestao
    .filter(r => selecionados.has(r.falta.faltaId))
    .map(r => ({ faltaId: r.falta.faltaId, sug: r.sugestoes[0] }))

  function toggle(faltaId: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(faltaId)) next.delete(faltaId)
      else next.add(faltaId)
      return next
    })
  }

  const barraVis = propostasSel.length > 0

  return (
    <div style={{ paddingBottom: barraVis ? 96 : 0 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ── Grade semanal ── */}
        <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 56 }} />
              {diasAtivos.map(d => <col key={d} />)}
            </colgroup>

            <thead>
              <tr>
                <th style={{ padding: "0 0 14px" }} />
                {diasAtivos.map(dia => (
                  <th
                    key={dia}
                    style={{
                      padding: "0 6px 14px",
                      textAlign: "center",
                      verticalAlign: "bottom",
                      borderBottom: "2px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                      {DIA_ABR[dia] ?? dia}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginTop: 1 }}>
                      {fmtData(diaToDate[dia])}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {horasAtivas.map(hora => (
                <tr key={hora}>
                  <td
                    style={{
                      padding: "8px 10px 8px 0",
                      fontSize: 12,
                      color: "#94a3b8",
                      fontWeight: 500,
                      verticalAlign: "middle",
                      whiteSpace: "nowrap",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    {hora}
                  </td>

                  {diasAtivos.map(dia => {
                    const card = grid[hora]?.[dia]
                    const sel  = card?.faltaId ? selecionados.has(card.faltaId) : false

                    return (
                      <td
                        key={dia}
                        style={{
                          padding: "5px 4px",
                          verticalAlign: "top",
                          borderBottom: "1px solid #f1f5f9",
                          minWidth: 140,
                        }}
                      >
                        {card ? (
                          <SessionCard
                            card={card}
                            selected={sel}
                            onToggle={() => card.faltaId && toggle(card.faltaId)}
                          />
                        ) : (
                          <EmptyCell />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Painel de resumo (direita) ── */}
        <PainelResumo
          resultados={resultados}
          sessoesAgendadas={sessoesAgendadas}
          selecionados={selecionados}
        />
      </div>

      {/* ── Barra de ação (sticky rodapé) ── */}
      {barraVis && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderTop: "1px solid #e2e8f0",
            boxShadow: "0 -4px 24px rgba(15,23,42,0.07)",
            padding: "10px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            zIndex: 50,
          }}
        >
          {/* Indicador */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#f0fdf4",
                border: "2px solid #16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#16a34a",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                {propostasSel.length} alteração(ões) pronta(s) para implantação
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                Revise as propostas selecionadas na grade.
              </div>
            </div>
          </div>

          {/* Chips */}
          <div style={{ flex: 1, display: "flex", gap: 8, overflowX: "auto", padding: "2px 0" }}>
            {propostasSel.map(({ faltaId, sug }) => (
              <PropostaChip
                key={faltaId}
                dia={sug.dia}
                hora={sug.hora}
                terapia={sug.terapiaExibicao || sug.terapia}
              />
            ))}
          </div>

          {/* Botões */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setSelecionados(new Set())}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  color: "#475569",
                }}
              >
                Cancelar seleção
              </button>
              <button
                onClick={() => onAceitar([...selecionados])}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "none",
                  background: "#16a34a",
                  color: "#ffffff",
                }}
              >
                Aceitar alterações ({propostasSel.length})
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>
              As alterações só serão aplicadas após a confirmação.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
