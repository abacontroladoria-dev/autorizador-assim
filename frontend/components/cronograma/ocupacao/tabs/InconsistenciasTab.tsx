"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { B, HORAS_GRID } from "@/lib/cronograma/constants"
import { pm, fm, fmtName, getTurno } from "@/lib/cronograma/helpers"
import type { IncItem, IncTipo } from "@/lib/cronograma/inconsistencias"
import type { CsvRow } from "@/types/cronograma"

const SK = "cron_excecoes_v1"

type Excecao = { obs: string; confirmedAt: number }

const TIPO_LABEL: Record<IncTipo, string> = {
  unidade_turno:      "Unidade no Turno (Pac.)",
  buraco:             "Buraco entre Sessões",
  min_sessoes:        "Menos de 2 Sessões/Dia",
  exibicao_aba:       "Exibição ABA",
  exibicao_hs:        "Exibição HS",
  exibicao_ae:        "Exibição AE / ASSIM / Gratuidade",
  prof_unidade_turno: "Unidade no Turno (Prof.)",
}

const TIPO_COLOR: Record<IncTipo, { bg: string; c: string; border: string }> = {
  unidade_turno:      { bg: "#fff7ed", c: "#c2410c", border: "#fed7aa" },
  buraco:             { bg: "#fef2f2", c: "#dc2626", border: "#fca5a5" },
  min_sessoes:        { bg: "#fffbeb", c: "#b45309", border: "#fde68a" },
  exibicao_aba:       { bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
  exibicao_hs:        { bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  exibicao_ae:        { bg: "#fdf4ff", c: "#86198f", border: "#f0abfc" },
  prof_unidade_turno: { bg: "#f0fdfa", c: "#0f766e", border: "#99f6e4" },
}

const DIAS_ORDER = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"]

interface Props {
  items: IncItem[]
  cRows: CsvRow[]
}

// ─── Schedlule modal ──────────────────────────────────────────────────────────

interface SessaoView {
  dia: string
  hora: string
  terapia: string
  terapiaExib: string
  prof: string
  unidade: string
  flagged: boolean
  flagDetalhe: string
  missing?: boolean  // slot vazio injetado para representar buraco/sessão faltante
}

function buildSchedule(pac: string, cRows: CsvRow[], incItems: IncItem[]): Record<string, SessaoView[]> {
  const flagMap = new Map<string, string[]>()
  for (const i of incItems) {
    if (i.pac === pac) {
      const k = `${i.dia}|||${i.hora}|||${i.terapia}`
      const detail = i.detalhe + (i.terapiaExibAtual ? ` (atual: "${i.terapiaExibAtual}", esperado: "${i.terapiaExibEsperada}")` : "")
      flagMap.set(k, [...(flagMap.get(k) || []), detail])
    }
  }

  const byDia: Record<string, SessaoView[]> = {}
  for (const r of cRows) {
    if (String(r["Nome Favorecido"] || "").trim() !== pac) continue
    if (r["Status do Agendamento"] !== "Agendado") continue
    const dia = String(r["Dia da Semana"] || "").trim()
    const hora = String(r["HI_str"] || String(r["Hora Inicial"] || "").slice(0, 5) || "")
    const terapia = String(r["Terapia"] || "").trim()
    const terapiaExib = String(r["Terapia Exibição"] || r["Terapia Exibicao"] || "—").trim() || "—"
    const prof = String(r["Profissional"] || "").trim()
    const unidade = String((r as Record<string, unknown>)["Unidade"] || "").trim()
    const k = `${dia}|||${hora}|||${terapia}`
    const detalhe = (flagMap.get(k) || []).join(" · ")
    if (!byDia[dia]) byDia[dia] = []
    byDia[dia].push({ dia, hora, terapia, terapiaExib, prof, unidade, flagged: !!detalhe, flagDetalhe: detalhe })
  }

  for (const d of Object.keys(byDia)) {
    byDia[d].sort((a, b) => a.hora.localeCompare(b.hora))
  }

  // ── Injetar placeholders para buracos e dias com 1 sessão ─────────────────
  const placeholderKey = (dia: string, hora: string) => `${dia}|||${hora}`
  const existingHoras = (dia: string) => new Set((byDia[dia] ?? []).map(s => s.hora))

  function addPlaceholder(dia: string, hora: string, motivo: string) {
    if (!byDia[dia]) return
    if (existingHoras(dia).has(hora)) return
    byDia[dia].push({
      dia, hora, terapia: "", terapiaExib: "", prof: "", unidade: "",
      flagged: true, flagDetalhe: motivo, missing: true,
    })
    byDia[dia].sort((a, b) => a.hora.localeCompare(b.hora))
  }

  for (const i of incItems) {
    if (i.pac !== pac) continue

    if (i.tipo === "buraco") {
      // i.hora é a sessão B (depois do buraco); A é a sessão imediatamente anterior
      const sessoes = byDia[i.dia] ?? []
      const bIdx = sessoes.findIndex(s => s.hora === i.hora && !s.missing)
      if (bIdx > 0) {
        const aMin = pm(sessoes[bIdx - 1].hora)
        if (aMin !== null) addPlaceholder(i.dia, fm(aMin + 40), "Slot vazio — buraco no cronograma")
      }
    }

    if (i.tipo === "min_sessoes") {
      const hMin = pm(i.hora)
      if (hMin === null) continue
      const minManha = pm("08:00") ?? 480
      const existing = existingHoras(i.dia)
      const beforeHora = fm(hMin - 40)
      const afterHora  = fm(hMin + 40)
      // Prefere slot anterior; se ocupado (ex: supervisão/coord), tenta posterior
      if (hMin - 40 >= minManha && !existing.has(beforeHora)) {
        addPlaceholder(i.dia, beforeHora, "Slot vazio — falta 1 sessão no dia")
      } else if (!existing.has(afterHora)) {
        addPlaceholder(i.dia, afterHora, "Slot vazio — falta 1 sessão no dia")
      }
    }
  }

  return byDia
}


interface CronViewModalProps {
  pac: string
  conv: string
  cRows: CsvRow[]
  items: IncItem[]
  onClose: () => void
}

function CronViewModal({ pac, conv, cRows, items, onClose }: CronViewModalProps) {
  const byDia = useMemo(() => buildSchedule(pac, cRows, items), [pac, cRows, items])
  const dias = DIAS_ORDER.filter(d => byDia[d])

  // Grade: "dia|||hora" → SessaoView[]
  const cMap: Record<string, SessaoView[]> = {}
  for (const d of dias) {
    for (const s of byDia[d]) {
      const k = `${d}|||${s.hora}`
      if (!cMap[k]) cMap[k] = []
      cMap[k].push(s)
    }
  }
  const horasGrid = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))

  // Notas de inconsistência para exibir abaixo da grade
  const flagNotes = dias.flatMap(d =>
    (byDia[d] ?? []).filter(s => s.flagged && s.flagDetalhe).map(s => ({
      label: `${d.replace("-feira", "")} ${s.hora}`,
      detail: s.flagDetalhe,
    }))
  )

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "24px 16px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--color-card, white)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "820px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "15px" }}>{pac}</div>
            {conv && <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>{conv}</div>}
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--muted)", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Grade */}
        <div style={{ padding: "16px 20px", overflowX: "auto" }}>
          {dias.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted-foreground)", fontSize: "13px", padding: "24px 0" }}>
              Nenhuma sessão agendada encontrada no CSV.
            </div>
          ) : (
            <>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "320px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "48px", paddingBottom: "6px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                    {dias.map(d => (
                      <th key={d} style={{ minWidth: "120px", paddingBottom: "6px", textAlign: "center", fontSize: "13px", color: B.navy, fontWeight: 800 }}>
                        {d.replace("-feira", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horasGrid.map(hora => (
                    <tr key={hora} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "13px", fontWeight: 800, color: B.navy }}>{hora}</td>
                      {dias.map(d => {
                        const cells = cMap[`${d}|||${hora}`] || []
                        return (
                          <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                            {cells.map((s, ci) => (
                              s.missing ? (
                                <div key={ci} style={{ background: "#fef2f2", border: "1px dashed #fca5a5", borderRadius: "8px", padding: "6px 8px", marginBottom: "2px", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ fontSize: "10px", color: "#dc2626", fontStyle: "italic" }}>slot vazio</span>
                                </div>
                              ) : (
                                <div key={ci} style={{ background: s.flagged ? "#fef9c3" : "var(--muted)", border: `1px solid ${s.flagged ? "#f59e0b" : "var(--border)"}`, borderRadius: "8px", padding: "6px 8px", marginBottom: "2px", minHeight: "58px", display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--card-foreground)", lineHeight: "1.3" }}>{s.terapia}</div>
                                  {s.terapiaExib && s.terapiaExib !== "—" && s.terapiaExib !== s.terapia && (
                                    <div style={{ fontSize: "10px", color: s.flagged ? "#dc2626" : "var(--muted-foreground)", lineHeight: "1.2" }}>({s.terapiaExib})</div>
                                  )}
                                  <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{fmtName(s.prof)}</div>
                                  {s.flagged && <div style={{ fontSize: "9px", fontWeight: 700, color: "#92400e", marginTop: "auto" }}>⚠</div>}
                                </div>
                              )
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Notas de inconsistência */}
              {flagNotes.length > 0 && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {flagNotes.map((n, i) => (
                    <div key={i} style={{ fontSize: "11px", color: "#92400e", background: "#fef3c7", borderRadius: "6px", padding: "4px 8px" }}>
                      ⚠ {n.label} — {n.detail}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Modal de Cronograma do Profissional ──────────────────────────────────────

interface ProfViewModalProps {
  prof: string
  cRows: CsvRow[]
  onClose: () => void
}

const UNID_BADGE: Record<string, { bg: string; c: string; border: string }> = {
  Realengo:      { bg: "#dbeafe", c: "#1e40af", border: "#93c5fd" },
  Fazendinha:    { bg: "#f3e8ff", c: "#6b21a8", border: "#d8b4fe" },
  "Padre Miguel":{ bg: "#fef3c7", c: "#92400e", border: "#fcd34d" },
}

function ProfViewModal({ prof, cRows, onClose }: ProfViewModalProps) {
  // Todos os slots do profissional (agendado + livre)
  const sessoes = useMemo(() => {
    return cRows
      .filter(r => String(r["Profissional"] || "").trim() === prof)
      .map(r => {
        const rawStatus = String(r["Status do Agendamento"] || "").trim().toLowerCase()
        return {
          dia:       String(r["Dia da Semana"] || "").trim(),
          hora:      String(r["HI_str"] || String(r["Hora Inicial"] || "").slice(0, 5) || "").trim(),
          pac:       String(r["Nome Favorecido"] || "").trim(),
          terapia:   String(r["Terapia"] || "").trim(),
          unidade:   String((r as Record<string, unknown>)["Unidade"] || "").trim(),
          livre:     rawStatus === "livre",
          agendado:  rawStatus === "agendado",
        }
      })
      .filter(s => s.livre || s.agendado)
  }, [prof, cRows])

  // Maioria de unidade por dia+turno (sobre todos os slots, inclusive livres)
  const mainUnidade = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const s of sessoes) {
      if (!s.unidade) continue
      const k = `${s.dia}|||${getTurno(s.hora)}`
      if (!map[k]) map[k] = {}
      map[k][s.unidade] = (map[k][s.unidade] || 0) + 1
    }
    const result: Record<string, string> = {}
    for (const [k, cnt] of Object.entries(map)) {
      result[k] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
    }
    return result
  }, [sessoes])

  const dias  = DIAS_ORDER.filter(d => sessoes.some(s => s.dia === d))
  const horas = HORAS_GRID.filter(h => sessoes.some(s => s.hora === h))

  const cMap = useMemo(() => {
    const m: Record<string, typeof sessoes> = {}
    for (const s of sessoes) {
      const k = `${s.dia}|||${s.hora}`
      if (!m[k]) m[k] = []
      m[k].push(s)
    }
    return m
  }, [sessoes])

  // Erros: qualquer slot (agendado ou livre) na unidade errada
  const erros = useMemo(() => {
    const out: { dia: string; hora: string; unidade: string; mainU: string; livre: boolean }[] = []
    for (const s of sessoes) {
      const mainU = mainUnidade[`${s.dia}|||${getTurno(s.hora)}`] ?? ""
      if (mainU && s.unidade && s.unidade !== mainU) {
        out.push({ dia: s.dia, hora: s.hora, unidade: s.unidade, mainU, livre: s.livre })
      }
    }
    return out
  }, [sessoes, mainUnidade])

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "24px 16px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--color-card, white)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "900px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "15px" }}>{fmtName(prof)}</div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>Agenda semanal completa</div>
            {erros.length > 0 && (
              <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px", fontWeight: 700 }}>
                ⚠ {erros.length} {erros.length === 1 ? "slot fora" : "slots fora"} da unidade do turno (agendados e livres) — marcados em vermelho
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--muted)", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Grade semanal */}
        <div style={{ padding: "16px 20px", overflowX: "auto" }}>
          {sessoes.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted-foreground)", fontSize: "13px", padding: "24px 0" }}>
              Nenhum slot encontrado no CSV para este profissional.
            </div>
          ) : (
            <>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "420px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "52px", paddingBottom: "6px", textAlign: "right", paddingRight: "10px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                    {dias.map(d => (
                      <th key={d} style={{ minWidth: "140px", paddingBottom: "6px", textAlign: "center", fontSize: "13px", color: B.navy, fontWeight: 800 }}>
                        {d.replace("-feira", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horas.map(hora => (
                    <tr key={hora} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ textAlign: "right", paddingRight: "10px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "13px", fontWeight: 800, color: B.navy }}>
                        {hora}
                      </td>
                      {dias.map(d => {
                        const cells = cMap[`${d}|||${hora}`] || []
                        return (
                          <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                            {cells.map((s, ci) => {
                              const mainU = mainUnidade[`${s.dia}|||${getTurno(s.hora)}`] ?? ""
                              const flagged = !!mainU && !!s.unidade && s.unidade !== mainU
                              const badge = UNID_BADGE[s.unidade]
                              if (s.livre) {
                                return (
                                  <div
                                    key={ci}
                                    style={{
                                      background: flagged ? "#fef2f2" : "var(--muted)",
                                      border: `1px dashed ${flagged ? "#fca5a5" : "var(--border)"}`,
                                      borderRadius: "8px",
                                      padding: "6px 8px",
                                      marginBottom: "2px",
                                      minHeight: "52px",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "2px",
                                    }}
                                  >
                                    <div style={{ fontSize: "10px", fontWeight: 600, color: flagged ? "#dc2626" : "var(--muted-foreground)", fontStyle: "italic" }}>
                                      Livre
                                    </div>
                                    <div style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: flagged ? "#dc2626" : (badge?.c ?? "var(--muted-foreground)"),
                                      marginTop: "auto",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}>
                                      {flagged && <span>⚠</span>}
                                      {s.unidade || "—"}
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div
                                  key={ci}
                                  style={{
                                    background: flagged ? "#fef2f2" : (badge?.bg ?? "var(--muted)"),
                                    border: `1px solid ${flagged ? "#fca5a5" : (badge?.border ?? "var(--border)")}`,
                                    borderRadius: "8px",
                                    padding: "6px 8px",
                                    marginBottom: "2px",
                                    minHeight: "60px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                >
                                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--card-foreground)", lineHeight: "1.3" }}>
                                    {fmtName(s.pac)}
                                  </div>
                                  <div style={{ fontSize: "10px", color: "var(--muted-foreground)", lineHeight: "1.2" }}>
                                    {s.terapia}
                                  </div>
                                  <div style={{
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    color: flagged ? "#dc2626" : (badge?.c ?? "var(--muted-foreground)"),
                                    marginTop: "auto",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}>
                                    {flagged && <span>⚠</span>}
                                    {s.unidade}
                                  </div>
                                </div>
                              )
                            })}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Resumo das violações */}
              {erros.length > 0 && (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {erros.map((e, i) => (
                    <div key={i} style={{ fontSize: "11px", color: "#dc2626", background: "#fef2f2", borderRadius: "6px", padding: "5px 10px", border: "1px solid #fca5a5" }}>
                      ⚠ {e.dia.replace("-feira", "")} {e.hora} ({e.livre ? "livre" : "agendado"}) — unidade <strong>{e.unidade}</strong>, mas maioria do turno está em <strong>{e.mainU}</strong>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function InconsistenciasTab({ items, cRows }: Props) {
  const [subTab, setSubTab] = useState<"inc" | "exc">("inc")
  const [excecoes, setExcecoes] = useState<Record<string, Excecao>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draftObs, setDraftObs] = useState("")
  const [busca, setBusca] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<IncTipo | "">("")
  const [viewItem, setViewItem] = useState<IncItem | null>(null)
  const [viewProfItem, setViewProfItem] = useState<IncItem | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem(SK)
      if (s) setExcecoes(JSON.parse(s))
    } catch {}
  }, [])

  function persistExcecoes(next: Record<string, Excecao>) {
    setExcecoes(next)
    try { localStorage.setItem(SK, JSON.stringify(next)) } catch {}
  }

  function promoverExcecao(id: string) {
    if (!draftObs.trim()) return
    persistExcecoes({ ...excecoes, [id]: { obs: draftObs.trim(), confirmedAt: Date.now() } })
    setExpandedId(null)
    setDraftObs("")
  }

  function removerExcecao(id: string) {
    const next = { ...excecoes }
    delete next[id]
    persistExcecoes(next)
  }

  const inconsistencias = useMemo(() => items.filter(i => !excecoes[i.id]), [items, excecoes])
  const excList = useMemo(
    () => items.filter(i => excecoes[i.id]).map(i => ({ item: i, exc: excecoes[i.id] })),
    [items, excecoes],
  )

  const filtered = useMemo(() => {
    let list = inconsistencias
    if (busca.trim()) {
      const b = busca.toLowerCase()
      list = list.filter(i => i.pac.toLowerCase().includes(b) || i.prof.toLowerCase().includes(b))
    }
    if (filtroTipo) list = list.filter(i => i.tipo === filtroTipo)
    return [...list].sort((a, b) => {
      const da = DIAS_ORDER.indexOf(a.dia) + 1 || 99
      const db = DIAS_ORDER.indexOf(b.dia) + 1 || 99
      return da - db || a.hora.localeCompare(b.hora) || a.pac.localeCompare(b.pac)
    })
  }, [inconsistencias, busca, filtroTipo])

  function abrevNome(nome: string) {
    const parts = nome.split(" ").filter(Boolean)
    if (parts.length <= 2) return nome
    return `${parts[0]} ${parts.slice(1).filter(p => p.length > 2).map(p => p[0] + ".").join(" ")} ${parts[parts.length - 1]}`
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Sub-abas */}
      <div style={{ display: "flex", gap: "6px" }}>
        {([
          { key: "inc", label: "⚠️ Regras feridas", count: inconsistencias.length },
          { key: "exc", label: "✅ Exceções",        count: excList.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer",
              border: subTab === t.key ? `2px solid ${B.navy}` : "2px solid var(--border)",
              background: subTab === t.key ? B.navy : "var(--muted)",
              color: subTab === t.key ? "white" : "var(--card-foreground)",
              fontFamily: "inherit",
            }}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {/* ── Aba Regras feridas ─────────────────────────────────────── */}
      {subTab === "inc" && (
        <>
          {/* Filtros */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar paciente ou profissional..."
              style={{
                flex: "1 1 220px", padding: "7px 12px",
                border: "1px solid var(--border)", borderRadius: "9px",
                fontSize: "12px", fontFamily: "inherit",
                background: "var(--color-card, white)", color: "inherit",
              }}
            />
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value as IncTipo | "")}
              style={{
                padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "9px",
                fontSize: "12px", fontFamily: "inherit",
                background: "var(--color-card, white)", color: "inherit",
              }}
            >
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPO_LABEL) as IncTipo[]).map(t => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </div>

          {/* Resumo por tipo */}
          {inconsistencias.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(Object.keys(TIPO_LABEL) as IncTipo[]).map(t => {
                const cnt = inconsistencias.filter(i => i.tipo === t).length
                if (!cnt) return null
                const c = TIPO_COLOR[t]
                return (
                  <span
                    key={t}
                    onClick={() => setFiltroTipo(filtroTipo === t ? "" : t)}
                    style={{
                      padding: "3px 10px", borderRadius: "999px",
                      fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                      opacity: filtroTipo && filtroTipo !== t ? 0.45 : 1,
                    }}
                  >
                    {TIPO_LABEL[t]} · {cnt}
                  </span>
                )
              })}
            </div>
          )}

          {/* Lista */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted-foreground)", fontSize: "13px" }}>
              {inconsistencias.length === 0
                ? "Nenhuma regra ferida detectada. Carregue CSV e laudos para analisar."
                : "Nenhum resultado para o filtro selecionado."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {filtered.map(item => {
                const c = TIPO_COLOR[item.tipo]
                const isExpanded = expandedId === item.id
                return (
                  <div
                    key={item.id}
                    style={{ border: `1px solid ${c.border}`, borderRadius: "12px", background: "var(--color-card, white)", overflow: "hidden" }}
                  >
                    {/* Linha principal */}
                    <div style={{ display: "flex", gap: "10px", padding: "10px 14px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* Tipo badge */}
                      <span style={{
                        padding: "2px 8px", borderRadius: "999px",
                        fontSize: "10px", fontWeight: 700,
                        background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                        whiteSpace: "nowrap", alignSelf: "center",
                      }}>
                        {TIPO_LABEL[item.tipo]}
                      </span>

                      {/* Info */}
                      <div style={{ flex: "1 1 160px" }}>
                        <div style={{ fontWeight: 700, fontSize: "13px" }}>{abrevNome(item.pac)}</div>
                        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}>
                          {item.dia} {item.hora} · {item.terapia}
                        </div>
                        {item.conv && (
                          <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{item.conv}</div>
                        )}
                      </div>

                      {/* Detalhe */}
                      <div style={{ flex: "2 1 200px", fontSize: "12px", color: "var(--card-foreground)", alignSelf: "center" }}>
                        {item.detalhe}
                        {item.terapiaExibAtual && (
                          <div style={{ marginTop: "3px", fontSize: "11px" }}>
                            <span style={{ color: "#dc2626" }}>Atual: "{item.terapiaExibAtual}"</span>
                            {" → "}
                            <span style={{ color: "#16a34a" }}>Esperado: "{item.terapiaExibEsperada}"</span>
                          </div>
                        )}
                      </div>

                      {/* Botões */}
                      <div style={{ display: "flex", gap: "6px", alignSelf: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => {
                            if (item.tipo === "prof_unidade_turno") setViewProfItem(item)
                            else setViewItem(item)
                          }}
                          style={{
                            padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                            cursor: "pointer", border: "1px solid var(--border)",
                            background: "var(--color-card, white)", color: "var(--card-foreground)",
                            fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          🗓 Ver
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(isExpanded ? null : item.id)
                            if (!isExpanded) setDraftObs("")
                          }}
                          style={{
                            padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                            cursor: "pointer", border: "1px solid var(--border)",
                            background: isExpanded ? "var(--muted)" : "var(--color-card, white)", color: "var(--card-foreground)",
                            fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          {isExpanded ? "Cancelar" : "→ Exceção"}
                        </button>
                      </div>
                    </div>

                    {/* Formulário de exceção inline */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px 14px", background: c.bg, display: "flex", gap: "8px", alignItems: "flex-end" }}>
                        <textarea
                          value={draftObs}
                          onChange={e => setDraftObs(e.target.value)}
                          placeholder="Justificativa para a exceção..."
                          rows={2}
                          style={{
                            flex: 1, padding: "7px 10px",
                            border: "1px solid var(--border)", borderRadius: "8px",
                            fontSize: "12px", fontFamily: "inherit",
                            resize: "none", background: "var(--card)",
                          }}
                        />
                        <button
                          onClick={() => promoverExcecao(item.id)}
                          disabled={!draftObs.trim()}
                          style={{
                            padding: "7px 14px", borderRadius: "8px",
                            fontSize: "12px", fontWeight: 700,
                            cursor: draftObs.trim() ? "pointer" : "not-allowed",
                            border: "none",
                            background: draftObs.trim() ? "#16a34a" : "#86efac",
                            color: "white", fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          Confirmar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Aba Exceções ──────────────────────────────────────────────── */}
      {subTab === "exc" && (
        <>
          {excList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--muted-foreground)", fontSize: "13px" }}>
              Nenhuma exceção registrada ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {excList.map(({ item, exc }) => {
                const c = TIPO_COLOR[item.tipo]
                return (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid var(--border)", borderRadius: "12px",
                      background: "var(--color-card, white)",
                      padding: "10px 14px", display: "flex", gap: "10px",
                      alignItems: "flex-start", flexWrap: "wrap",
                    }}
                  >
                    <span style={{
                      padding: "2px 8px", borderRadius: "999px",
                      fontSize: "10px", fontWeight: 700,
                      background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                      whiteSpace: "nowrap", alignSelf: "center",
                    }}>
                      {TIPO_LABEL[item.tipo]}
                    </span>

                    <div style={{ flex: "1 1 160px" }}>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>{abrevNome(item.pac)}</div>
                      <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}>
                        {item.dia} {item.hora} · {item.terapia}
                      </div>
                    </div>

                    <div style={{ flex: "2 1 200px" }}>
                      <div style={{ fontSize: "12px", color: "var(--card-foreground)", fontStyle: "italic" }}>"{exc.obs}"</div>
                      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "3px" }}>
                        {new Date(exc.confirmedAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignSelf: "center" }}>
                      <button
                        onClick={() => setViewItem(item)}
                        style={{
                          padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                          cursor: "pointer", border: "1px solid var(--border)",
                          background: "var(--color-card, white)", color: "var(--card-foreground)",
                          fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                      >
                        🔍 Ver
                      </button>
                      <button
                        onClick={() => removerExcecao(item.id)}
                        style={{
                          padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                          cursor: "pointer", border: "1px solid #fca5a5",
                          background: "#fef2f2", color: "#dc2626",
                          fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                      >
                        Remover Exceção
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modal Ver Cronograma ──────────────────────────────────────── */}
      {viewItem && (
        <CronViewModal
          pac={viewItem.pac}
          conv={viewItem.conv}
          cRows={cRows}
          items={items}
          onClose={() => setViewItem(null)}
        />
      )}

      {/* ── Modal Ver Cronograma do Profissional ─────────────────────── */}
      {viewProfItem && (
        <ProfViewModal
          prof={viewProfItem.prof}
          cRows={cRows}
          onClose={() => setViewProfItem(null)}
        />
      )}
    </div>
  )
}
