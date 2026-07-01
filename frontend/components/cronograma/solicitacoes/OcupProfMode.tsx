"use client"

import { type CSSProperties, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import {
  ABA_EXIB_PSICO_NAMES, B, DIAS_LIST, DIAS_ORD, EXCLUIR_OCUP, EXIB_NOME,
  HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP, isProfBloqueadoTemp,
} from "@/lib/cronograma/constants"
import {
  buildCronoUnitMeta, fm, fmtName, gPrio, isLaudoComAlta, pm,
  shouldShowSessionUnit, unidadeBadgeText,
} from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import type { CsvRow, LaudoRow, CfgState } from "@/types/cronograma"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"

// ─── Types ────────────────────────────────────────────────────────────────────

type Regra  = "R1" | "R2" | "R3"
// R1 = Completar slot existente (Musicoterapia — grupo)
// R2 = Slot livre adjacente à sessão existente no dia
// R3 = Dia novo — oferecer com sessão complementar

type Prio   = 1 | 2 | 3 | 4 | 5
type Status = "acompanhamento" | "inviavel"

const PRIO_META: Record<Prio, { short: string; bg: string; c: string; border: string; label: string }> = {
  1: { short: "P1", bg: "#fef2f2", c: "#dc2626", border: "#fca5a5", label: "Liminar + conv. alto valor" },
  2: { short: "P2", bg: "#fff7ed", c: "#c2410c", border: "#fdba74", label: "Outro convênio" },
  3: { short: "P3", bg: "#fefce8", c: "#a16207", border: "#fde047", label: "Liminar + ASSIM" },
  4: { short: "P4", bg: "#eff6ff", c: "#2563eb", border: "#93c5fd", label: "ASSIM" },
  5: { short: "P5", bg: "#f0fdf4", c: "#16a34a", border: "#86efac", label: "LEVE" },
}

const REGRA_META: Record<Regra, { label: string; bg: string; c: string; border: string; desc: string }> = {
  "R1": { label: "R1", bg: "#ecfdf5", c: "#059669", border: "#6ee7b7", desc: "Completar slot existente — grupo de Musicoterapia" },
  "R2": { label: "R2", bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd", desc: "Slot livre adjacente à sessão existente no dia" },
  "R3": { label: "R3", bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff", desc: "Dia novo — oferecer junto com sessão complementar" },
}

const STATUS_META: Record<Status, { label: string; bg: string; c: string }> = {
  acompanhamento: { label: "Em Acompanhamento", bg: B.blueLt,  c: B.blue    },
  inviavel:       { label: "Inviável",           bg: "var(--muted)", c: "var(--muted-foreground)" },
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface VComp { tP: string; prof: string; hora: string; dif: number }

interface CandInfo {
  pac: string
  prio: Prio
  regra: Regra
  dif: number; aut: number; of: number
  sessNoDia: string[]
  vComp: VComp[]
  vCompAlts: Record<string, VComp[]>
}

interface SlotResult {
  dia: string; hora: string; prof: string; unidade: string; terapia: string; esp: string
  cands: CandInfo[]
}

interface ModalItem {
  pac: string
  slot: SlotResult
  vComp: VComp[]
  vCompAlts: Record<string, VComp[]>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }
function hiMin(r: CsvRow): number { return Number(r.HI || 0) }
function rowUnid(r: CsvRow): string { return String(r.Unidade || "Desconhecida") }

function adjHs(hora: string): string[] {
  const hi = pm(hora)
  if (hi === null) return []
  return [hi + 40, hi - 40].filter(v => v >= 0).map(fm)
}

function tExib(tP: string): string | undefined {
  return ABA_EXIB_PSICO_NAMES.has(tP) ? EXIB_NOME[2271] : undefined
}

function fmtPacAbr(full: string): string {
  const particles = new Set(["da", "de", "do", "das", "dos", "e", "di"])
  const words = full.trim().split(/\s+/).filter(w => !particles.has(w.toLowerCase()))
  if (words.length <= 1) return words[0] ?? full
  return `${words[0]} ${words[1]}`
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ABA_EXT_NAMES = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa"])
const EXCLUIR_GAPS  = new Set([
  "Coordenador de Caso", "Supervisão ABA",
  "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa",
])
const SK = "aba_ocup_prof_status_v1"
const DIAS_UTIL = DIAS_LIST.slice(0, 5)
const DIA_ABR: Record<string, string> = {
  "Segunda-feira": "Seg", "Terça-feira": "Ter", "Quarta-feira": "Qua",
  "Quinta-feira":  "Qui", "Sexta-feira":  "Sex",
}

// ─── AgendaModal ──────────────────────────────────────────────────────────────

interface AgendaModalProps {
  item: ModalItem
  cRows: CsvRow[]
  onClose: () => void
  currentSt: Status | null
  onAceitar: () => void
  onDesfazer: () => void
}

function AgendaModal({ item, cRows, onClose, currentSt, onAceitar, onDesfazer }: AgendaModalProps) {
  const { pac, slot, vComp, vCompAlts } = item
  const [selIdx, setSelIdx] = useState<Record<string, number>>({})

  const activeVComps: VComp[] = vComp.map(v => {
    const alts = vCompAlts[v.hora] || [v]
    return alts[selIdx[v.hora] ?? 0] ?? v
  })

  const sessPac = useMemo(() => {
    const seen = new Set<string>()
    const res: { dia: string; hora: string; tP: string; tE?: string; prof: string; unidade: string; tipo: "exist" | "admin" }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac || ABA_EXT_NAMES.has(r.Terapia)) continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${r.Terapia}|||${r.Profissional}`
      if (seen.has(k)) continue; seen.add(k)
      res.push({
        dia: r["Dia da Semana"], hora: hiStr(r),
        tP: r.Terapia, tE: tExib(r.Terapia),
        prof: r.Profissional, unidade: rowUnid(r),
        tipo: EXCLUIR_OCUP.has(r.Terapia) ? "admin" : "exist",
      })
    }
    return res
  }, [pac, cRows])

  type CellInfo = { tP: string; tE?: string; prof: string; tipo: "proposta" | "admin" | "exist"; unidade: string }
  const cMap: Record<string, CellInfo[]> = {}
  for (const s of sessPac) {
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    cMap[k].push({ tP: s.tP, tE: s.tE, prof: s.prof, tipo: s.tipo, unidade: s.unidade })
  }
  const kP = `${slot.dia}|||${slot.hora}`
  if (!cMap[kP]) cMap[kP] = []
  cMap[kP].push({ tP: slot.terapia, tE: tExib(slot.terapia), prof: slot.prof, tipo: "proposta", unidade: slot.unidade })
  for (const vc of activeVComps) {
    const kC = `${slot.dia}|||${vc.hora}`
    if (!cMap[kC]) cMap[kC] = []
    cMap[kC].push({ tP: vc.tP, tE: tExib(vc.tP), prof: vc.prof, tipo: "proposta", unidade: slot.unidade })
  }

  const dias = [...new Set([...DIAS_UTIL, ...sessPac.map(s => s.dia), slot.dia])]
    .sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const horas = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))
  const unitMeta = buildCronoUnitMeta(dias, cMap)

  const cSt = (tipo: string) => {
    if (tipo === "proposta") return { bg: B.limeLt, bd: B.lime,     label: "Proposta" }
    if (tipo === "admin")   return { bg: "var(--muted)", bd: "var(--border)", label: null }
    return                         { bg: "var(--muted)", bd: "var(--border)", label: null }
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", padding: "12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 24px 80px rgba(0,0,0,.22)", width: "96vw", maxWidth: "960px", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--card)", borderRadius: "18px 18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={{ fontWeight: 900, fontSize: "15px", color: B.navy }}>{fmtName(pac)}</span>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
              <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
              <span style={{ background: B.limeLt, color: "#4a6e20", border: `1px solid ${B.lime}88`, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 700 }}>
                Proposta: {slot.terapia} · {slot.dia.replace("-feira", "")} {slot.hora} · {slot.unidade}
                {activeVComps.length > 0 && ` + ${activeVComps.length} complementar(es)`}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "var(--muted)", cursor: "pointer", fontSize: "16px", color: "var(--muted-foreground)" }}>×</button>
        </div>

        {/* Seletor de sessões complementares (R3) */}
        {vComp.length > 0 && (
          <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "#fafff7", display: "flex", flexDirection: "column", gap: "8px" }}>
            {vComp.map(v => {
              const alts = vCompAlts[v.hora] || [v]
              const idx  = selIdx[v.hora] ?? 0
              return (
                <div key={v.hora}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", marginBottom: "4px" }}>
                    Sessão complementar às {v.hora}:
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {alts.map((alt, i) => (
                      <button
                        key={i}
                        onClick={() => setSelIdx(s => ({ ...s, [v.hora]: i }))}
                        style={{
                          padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit", border: "1px solid",
                          background: i === idx ? B.navy : "var(--muted)",
                          color: i === idx ? "white" : "var(--card-foreground)",
                          borderColor: i === idx ? B.navy : "var(--border)",
                        }}
                      >
                        {alt.tP} · {fmtName(alt.prof)}
                        {alts.length > 1 && <span style={{ opacity: 0.7, marginLeft: "5px", fontSize: "10px" }}>Dif. −{alt.dif}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legenda */}
        <div style={{ padding: "8px 20px 0", display: "flex", gap: "10px", fontSize: "10px", color: "var(--muted-foreground)", flexWrap: "wrap" }}>
          {[
            { bg: B.limeLt, bd: B.lime,     label: "Sessão proposta" },
            { bg: "var(--muted)", bd: "var(--border)", label: "Existente" },
            { bg: "var(--muted)", bd: "var(--border)", label: "Administrativo" },
          ].map(({ bg, bd, label }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "3px", background: bg, border: `1px solid ${bd}` }} />
              {label}
            </span>
          ))}
        </div>

        {/* Grade */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px 20px" }}>
          {!horas.length ? (
            <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "32px" }}>Nenhuma sessão encontrada.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "400px" }}>
              <thead>
                <tr>
                  <th style={{ width: "52px", paddingBottom: "8px", textAlign: "right", paddingRight: "10px", fontSize: "12px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                  {dias.map(d => (
                    <th key={d} style={{ minWidth: "130px", paddingBottom: "8px", textAlign: "center", fontSize: "13px", color: d === slot.dia ? B.purple : B.navy, fontWeight: 800 }}>
                      <div>
                        {d.replace("-feira", "")}
                        {d === slot.dia && <span style={{ fontSize: "9px", background: B.limeLt, color: "#4a6e20", borderRadius: "4px", padding: "1px 4px", marginLeft: "4px" }}>proposta</span>}
                      </div>
                      <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horas.map(hora => (
                  <tr key={hora} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ textAlign: "right", paddingRight: "10px", verticalAlign: "top", paddingTop: "8px", fontFamily: "monospace", fontSize: "14px", fontWeight: 800, color: hora === slot.hora ? B.purple : B.navy }}>
                      {hora}
                    </td>
                    {dias.map(d => {
                      const cells = cMap[`${d}|||${hora}`] || []
                      return (
                        <td key={d} style={{ padding: "3px", verticalAlign: "top", height: "1px" }}>
                          {cells.map((c, ci) => {
                            const cs = cSt(c.tipo)
                            return (
                              <div key={ci} style={{ background: cs.bg, border: `1px solid ${cs.bd}`, borderRadius: "9px", padding: "7px 9px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--card-foreground)", lineHeight: "1.3" }}>{c.tP}</div>
                                {c.tE && <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontStyle: "italic" }}>({c.tE})</div>}
                                <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{fmtName(c.prof)}</div>
                                {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                                  <div style={{ fontSize: "10px", fontWeight: 800, color: B.blue, background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "1px 6px", width: "fit-content" }}>
                                    {unidadeBadgeText(c.unidade)}
                                  </div>
                                )}
                                {cs.label && <div style={{ fontSize: "11px", fontWeight: 700, color: "#4a6e20", marginTop: "auto" }}>{cs.label}</div>}
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
          )}
        </div>

        {/* Footer com Aceitar / Desfazer / Fechar */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--card)", borderRadius: "0 0 18px 18px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          {currentSt !== "acompanhamento" && (
            <button
              onClick={() => { onAceitar(); onClose() }}
              style={btnStyle(B.navy, "white", "transparent")}
            >
              Aceitar (→ Acompanhamento)
            </button>
          )}
          {currentSt === "acompanhamento" && (
            <button onClick={onDesfazer} style={btnStyle("var(--muted)", "var(--muted-foreground)", "var(--border)")}>
              Desfazer
            </button>
          )}
          <button onClick={onClose} style={btnStyle("var(--muted)", "var(--card-foreground)", "var(--border)")}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── ProfAgendaGrid ───────────────────────────────────────────────────────────

function ProfAgendaGrid({ prof, cRows, resultados }: { prof: string; cRows: CsvRow[]; resultados: SlotResult[] }) {
  const agendoMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const r of cRows) {
      if (r.Profissional !== prof || r["Status do Agendamento"] !== "Agendado") continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}`
      if (!m[k]) m[k] = []
      const pac = r["Nome Favorecido"] || ""
      if (pac && !m[k].includes(pac)) m[k].push(pac)
    }
    return m
  }, [prof, cRows])

  const candMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of resultados) {
      if (s.cands.length > 0) m[`${s.dia}|||${s.hora}`] = s.cands.length
    }
    return m
  }, [resultados])

  const freeSet = useMemo(() => {
    const s = new Set<string>()
    for (const r of resultados) s.add(`${r.dia}|||${r.hora}`)
    return s
  }, [resultados])

  const allHoras = useMemo(() => {
    const hs = new Set<string>()
    for (const k of [...Object.keys(agendoMap), ...freeSet]) hs.add(k.split("|||")[1])
    return [...hs].sort((a, b) => (pm(a) || 0) - (pm(b) || 0))
  }, [agendoMap, freeSet])

  const activeDias = useMemo(() => {
    const hasSomething = new Set<string>()
    for (const k of [...Object.keys(agendoMap), ...freeSet]) hasSomething.add(k.split("|||")[0])
    return DIAS_UTIL.filter(d => hasSomething.has(d))
  }, [agendoMap, freeSet])

  if (!allHoras.length || !activeDias.length) return null

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px", marginBottom: "16px" }}>
      <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>
        Agenda do profissional
      </div>
      <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px" }}>
        Sessões agendadas e vagas livres desta semana
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        {[
          { bg: "#22c55e", label: "Agendado" },
          { bg: "#fef3c7", bd: "#fbbf24", label: "Livre — com candidatos" },
          { bg: "var(--border)", label: "Livre — sem candidatos" },
        ].map(({ bg, bd, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: bg, border: bd ? `1px solid ${bd}` : undefined }} />
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", fontSize: "11px", width: `${48 + activeDias.length * 90}px` }}>
          <colgroup>
            <col style={{ width: "48px" }} />
            {activeDias.map(d => <col key={d} style={{ width: "90px" }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "4px 6px", borderBottom: "2px solid var(--border)" }} />
              {activeDias.map(d => (
                <th key={d} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, fontSize: "13px", color: B.navy, borderBottom: `2px solid ${B.navy}` }}>
                  {DIA_ABR[d] ?? d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allHoras.map(hora => {
              const isSep = hora === "13:00"
              return (
                <tr key={hora} style={{ borderTop: isSep ? "2px solid var(--border)" : "1px solid var(--border)" }}>
                  <td style={{ padding: "2px 6px", color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 500, height: "40px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                    {hora}
                  </td>
                  {activeDias.map(d => {
                    const k = `${d}|||${hora}`
                    const pacs   = agendoMap[k]
                    const nCands = candMap[k]
                    const isFree = freeSet.has(k)

                    if (pacs?.length) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "#22c55e", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", textAlign: "center", padding: "4px 6px", gap: "2px" }}>
                            {pacs.slice(0, 2).map((p, i) => (
                              <div key={i} style={{ fontWeight: 700, fontSize: i === 0 ? "11px" : "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", lineHeight: 1.2, opacity: i > 0 ? 0.85 : 1 }}>
                                {fmtPacAbr(p)}
                              </div>
                            ))}
                            {pacs.length > 2 && <div style={{ fontSize: "9px", opacity: 0.7 }}>+{pacs.length - 2}</div>}
                          </div>
                        </td>
                      )
                    } else if (isFree) {
                      if (nCands) {
                        return (
                          <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                            <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 4px", gap: "1px" }}>
                              <div style={{ fontWeight: 600, fontSize: "10px", color: "#92400e" }}>{nCands} candidato{nCands > 1 ? "s" : ""}</div>
                              <div style={{ fontSize: "9px", color: "#d97706", fontWeight: 700 }}>ver ↓</div>
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "var(--border)", borderRadius: "8px", height: "36px" }} />
                        </td>
                      )
                    }
                    return <td key={d} style={{ padding: "2px 4px" }} />
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── OcupProfMode ─────────────────────────────────────────────────────────────

interface Props { cRows: CsvRow[]; lRows: LaudoRow[]; cfg: CfgState }

export function OcupProfMode({ cRows, lRows, cfg }: Props) {
  const { profMap, persistProfMap } = useCronogramaData()
  const [prof, setProf]         = useState("")
  const [inputVal, setInputVal] = useState("")
  const [dropOpen, setDropOpen] = useState(false)
  const [filtEsp, setFiltEsp]   = useState("")
  const [filtDia, setFiltDia]   = useState("")
  const [modalItem, setModalItem] = useState<ModalItem | null>(null)
  const comboRef = useRef<HTMLDivElement>(null)

  const statusMap = profMap as Record<string, Status>
  function persistStatus(m: Record<string, Status>) { persistProfMap(m) }
  const stKey = (pac: string, dia: string, hora: string) => `${pac}|||${prof}|||${dia}|||${hora}`
  const stOf  = (pac: string, dia: string, hora: string): Status | null => statusMap[stKey(pac, dia, hora)] || null
  const setSt = (pac: string, dia: string, hora: string, s: Status | null) => {
    const k = stKey(pac, dia, hora)
    if (s === null) { const m = { ...statusMap }; delete m[k]; persistStatus(m) }
    else persistStatus({ ...statusMap, [k]: s })
  }

  // ── Dados derivados ─────────────────────────────────────────────────────────

  const agend = useMemo(() => cRows.filter(r => r["Status do Agendamento"] === "Agendado"), [cRows])
  const agendClin = useMemo(() =>
    agend.filter(r => r["Nome Favorecido"] && !PACS_ADMIN.has(r["Nome Favorecido"]) && !EXCLUIR_GAPS.has(r.Terapia)),
    [agend])

  const cM = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of lRows) {
      const pac = String(l["Paciente"] || "").trim()
      if (pac && l["Plano"] && !m[pac]) m[pac] = String(l["Plano"])
    }
    return m
  }, [lRows])

  const jM = cfg.judicialMap || {}

  const gapMap = useMemo(() => {
    if (!cRows.length || !lRows.length) return {} as Record<string, { dif: number; aut: number; of: number }>
    const qtdOf: Record<string, number> = {}
    for (const r of agend) {
      const pac = r["Nome Favorecido"]
      if (!pac || PACS_ADMIN.has(pac) || EXCLUIR_GAPS.has(r.Terapia)) continue
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp) continue
      qtdOf[`${pac}|||${esp}`] = (qtdOf[`${pac}|||${esp}`] || 0) + 1
    }
    const qtdAut: Record<string, number> = {}
    const altaSet = new Set<string>()
    for (const l of lRows) {
      const pac = String(l["Paciente"] || "").trim()
      const esp = String(l["Especialidade"] || "").trim()
      if (!pac || PACS_ADMIN.has(pac) || !esp) continue
      if (isLaudoComAlta(l)) { altaSet.add(`${pac}|||${esp}`); continue }
      const sit = String(l["Situação"] || "").trim().toLowerCase()
      if (sit && sit !== "vigente") continue
      const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
      if (aut <= 0) continue
      const k = `${pac}|||${esp}`
      if (!qtdAut[k] || aut > qtdAut[k]) qtdAut[k] = aut
    }
    for (const k of altaSet) delete qtdAut[k]
    const result: Record<string, { dif: number; aut: number; of: number }> = {}
    for (const [k, aut] of Object.entries(qtdAut)) {
      const of_ = qtdOf[k] || 0
      const dif = Math.round((aut - of_) * 10) / 10
      if (dif > 0) result[k] = { dif, aut, of: of_ }
    }
    return result
  }, [cRows, lRows, agend])

  const todosProfs = useMemo(() =>
    [...new Set(cRows.map(r => r.Profissional).filter(Boolean))].sort(),
    [cRows])

  const filteredProfs = useMemo(() =>
    inputVal.trim() ? todosProfs.filter(p => p.toLowerCase().includes(inputVal.toLowerCase())) : todosProfs,
    [todosProfs, inputVal])

  // ── Sessões livres do profissional ──────────────────────────────────────────

  const profSessoes = useMemo(() => {
    if (!prof || !cRows.length) return [] as CsvRow[]
    const seen = new Set<string>()
    return cRows.filter(r => {
      if (r.Profissional !== prof || r["Status do Agendamento"] !== "Livre") return false
      if (isProfBloqueadoTemp(r.Profissional)) return false
      if (!TERAPIA_TO_ESP[r.Terapia] || EXCLUIR_OCUP.has(r.Terapia)) return false
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${rowUnid(r)}|||${r.Terapia}`
      if (seen.has(k)) return false; seen.add(k); return true
    }).sort((a, b) =>
      ((DIAS_ORD[a["Dia da Semana"]] ?? 9) - (DIAS_ORD[b["Dia da Semana"]] ?? 9)) ||
      ((pm(hiStr(a)) || 0) - (pm(hiStr(b)) || 0))
    )
  }, [prof, cRows])

  // ── Candidatos por sessão ───────────────────────────────────────────────────

  const resultados = useMemo((): SlotResult[] => {
    if (!prof) return []
    return profSessoes.map(sessao => {
      const dia     = sessao["Dia da Semana"]
      const hora    = hiStr(sessao)
      const unidade = rowUnid(sessao)
      const terapia = sessao.Terapia
      const esp     = TERAPIA_TO_ESP[terapia] || terapia
      const isMusico = terapia === "Musicoterapia"
      const adjs    = adjHs(hora)
      const horaMin = pm(hora) ?? 0
      const isManha = horaMin < 780

      const pacAtUnit = [...new Set(agendClin.filter(r => rowUnid(r) === unidade).map(r => r["Nome Favorecido"]))]
      const cands: CandInfo[] = []

      for (const pac of pacAtUnit) {
        const g = gapMap[`${pac}|||${esp}`]
        if (!g) continue

        const temConflito = agend.some(r =>
          r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia && hiStr(r) === hora
        )
        if (temConflito) continue

        const extRows = agend.filter(r => r["Nome Favorecido"] === pac && ABA_EXT_NAMES.has(r.Terapia))
        if (extRows.length) {
          const extM = extRows.some(r => hiMin(r) < 780)
          const extT = extRows.some(r => hiMin(r) >= 780)
          if (extM && !extT && isManha) continue
          if (extT && !extM && !isManha) continue
        } else {
          const cliRows = agendClin.filter(r => r["Nome Favorecido"] === pac)
          if (cliRows.length) {
            const clM = cliRows.some(r => hiMin(r) < 780)
            const clT = cliRows.some(r => hiMin(r) >= 780)
            if (clM && !clT && !isManha) continue
            if (clT && !clM && isManha) continue
          }
        }

        const sessNoDia = agendClin
          .filter(r => r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia && rowUnid(r) === unidade)
          .map(r => hiStr(r)).sort()

        const isAdj = agendClin.some(r =>
          r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia &&
          rowUnid(r) === unidade && adjs.includes(hiStr(r))
        )

        const temDia = agendClin.some(r => r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia)

        let regra: Regra | null = null
        let vComp: VComp[] = []
        let vCompAlts: Record<string, VComp[]> = {}

        if (sessNoDia.length > 0 && isAdj) {
          regra = isMusico ? "R1" : "R2"
        } else if (!temDia) {
          const compRows = cRows.filter(r => {
            if (r["Status do Agendamento"] !== "Livre" || isProfBloqueadoTemp(r.Profissional)) return false
            if (r["Dia da Semana"] !== dia || rowUnid(r) !== unidade) return false
            if (!adjs.includes(hiStr(r))) return false
            if (!TERAPIA_TO_ESP[r.Terapia] || EXCLUIR_OCUP.has(r.Terapia)) return false
            if (r.Profissional === sessao.Profissional && hiStr(r) === hora) return false
            return !!gapMap[`${pac}|||${TERAPIA_TO_ESP[r.Terapia]}`]
          })

          if (compRows.length) {
            const byHora: Record<string, VComp[]> = {}
            for (const r of compRows) {
              const h = hiStr(r)
              const compDif = gapMap[`${pac}|||${TERAPIA_TO_ESP[r.Terapia]}`]?.dif || 0
              if (!byHora[h]) byHora[h] = []
              byHora[h].push({ tP: r.Terapia, prof: r.Profissional, hora: h, dif: compDif })
            }
            for (const h of Object.keys(byHora)) byHora[h].sort((a, b) => b.dif - a.dif)
            vCompAlts = byHora
            vComp = Object.values(byHora).map(g => g[0])
            regra = "R3"
          }
        }

        if (!regra) continue

        cands.push({
          pac, prio: gPrio(pac, cM, jM) as Prio, regra,
          dif: g.dif, aut: g.aut, of: g.of,
          sessNoDia, vComp, vCompAlts,
        })
      }

      const REGRA_RANK: Record<Regra, number> = { R1: 0, R2: 1, R3: 2 }
      cands.sort((a, b) =>
        (REGRA_RANK[a.regra] - REGRA_RANK[b.regra]) ||
        (a.prio - b.prio) ||
        (b.dif - a.dif)
      )

      return { dia, hora, prof: sessao.Profissional, unidade, terapia, esp, cands }
    })
  }, [prof, profSessoes, agend, agendClin, gapMap, cM, jM, cRows])

  // ── Filtros e estatísticas ──────────────────────────────────────────────────

  const espsDisp = useMemo(() => [...new Set(resultados.map(s => s.esp))].sort(), [resultados])
  const diasDisp = useMemo(() => {
    const seen = new Set<string>()
    return resultados.map(s => s.dia).filter(d => seen.has(d) ? false : (seen.add(d), true))
  }, [resultados])

  const filtrados = useMemo(() =>
    resultados.filter(s =>
      (!filtEsp || s.esp === filtEsp) &&
      (!filtDia || s.dia === filtDia)
    ), [resultados, filtEsp, filtDia])

  const totalSessoes = filtrados.length
  const totalPacs    = filtrados.reduce((a, s) => a + s.cands.length, 0)
  const totalAcomp   = Object.entries(statusMap).filter(([k, v]) => k.includes(`|||${prof}|||`) && v === "acompanhamento").length

  const prioChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of filtrados) for (const c of s.cands) {
      const k = `P${c.prio}`
      counts[k] = (counts[k] || 0) + 1
    }
    const PRIO_COLORS: Record<string, string> = {
      P1: "#dc2626", P2: "#c2410c", P3: "#a16207", P4: "#2563eb", P5: "#16a34a",
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value, fill: PRIO_COLORS[name] || "var(--muted-foreground)" }))
  }, [filtrados])

  const regraChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of filtrados) for (const c of s.cands) {
      counts[c.regra] = (counts[c.regra] || 0) + 1
    }
    const REGRA_COLORS: Record<string, string> = {
      R1: "#059669", R2: "#0369a1", R3: "#7e22ce",
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value, fill: REGRA_COLORS[name] || "var(--muted-foreground)" }))
  }, [filtrados])

  function selectProf(p: string) {
    setProf(p); setInputVal(p); setDropOpen(false); setFiltEsp(""); setFiltDia("")
  }

  return (
    <>
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

        {/* ── Coluna esquerda ─────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, width: "340px", display: "flex", flexDirection: "column", gap: "12px" }}>

          <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px" }}>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "15px", marginBottom: "4px" }}>
              Aumentar Ocupação — Profissional
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "14px" }}>
              Selecione o profissional e encontre pacientes que encaixam nas sessões livres.
            </div>

            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "6px" }}>Profissional</div>
            <div ref={comboRef} style={{ position: "relative" }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setProf(""); setDropOpen(true) }}
                onFocus={() => setDropOpen(true)}
                onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                placeholder="Buscar profissional..."
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "9px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "var(--color-card, white)", color: "inherit" }}
              />
              {dropOpen && filteredProfs.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", maxHeight: "200px", overflowY: "auto" }}>
                  {filteredProfs.map(p => (
                    <button key={p} onMouseDown={() => selectProf(p)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: p === prof ? "var(--muted)" : "none", border: "none", fontSize: "12px", cursor: "pointer", color: p === prof ? B.navy : "var(--card-foreground)", fontWeight: p === prof ? 700 : 400, fontFamily: "inherit" }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {prof && resultados.length > 0 && (
              <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "4px" }}>Especialidade</div>
                  <select value={filtEsp} onChange={e => setFiltEsp(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "inherit", background: "var(--color-card, white)", color: "inherit" }}>
                    <option value="">Todas</option>
                    {espsDisp.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "4px" }}>Dia</div>
                  <select value={filtDia} onChange={e => setFiltDia(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "inherit", background: "var(--color-card, white)", color: "inherit" }}>
                    <option value="">Todos</option>
                    {diasDisp.map(d => <option key={d} value={d}>{d.replace("-feira", "")}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {prof && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px" }}>
              <div style={{ fontWeight: 800, color: B.navy, fontSize: "13px", marginBottom: "10px" }}>Resumo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                {[
                  { label: "Sessões livres",      value: totalSessoes, color: B.navy },
                  { label: "Pacientes elegíveis", value: totalPacs,    color: totalPacs > 0 ? "#16a34a" : "var(--muted-foreground)" },
                  { label: "Em Acompanhamento",   value: totalAcomp,   color: totalAcomp > 0 ? B.blue : "var(--muted-foreground)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{label}</span>
                    <span style={{ fontSize: "14px", fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Donut: Prioridade */}
              {prioChartData.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: "6px" }}>PRIORIDADE</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "100px", height: "100px", flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={prioChartData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={2}>
                            {prioChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v, n) => [v ?? 0, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                      {prioChartData.map(d => (
                        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{d.name}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--card-foreground)", marginLeft: "auto" }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Donut: Regra */}
              {regraChartData.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: "6px" }}>REGRA</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "100px", height: "100px", flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={regraChartData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={2}>
                            {regraChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v, n) => [v ?? 0, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                      {regraChartData.map(d => (
                        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{d.name}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--card-foreground)", marginLeft: "auto" }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em" }}>LEGENDA DE REGRAS</div>
                {(Object.entries(REGRA_META) as [Regra, typeof REGRA_META[Regra]][]).map(([k, m]) => (
                  <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
                    <span style={{ padding: "1px 6px", borderRadius: "5px", fontSize: "10px", fontWeight: 800, background: m.bg, color: m.c, border: `1px solid ${m.border}`, flexShrink: 0, marginTop: "1px" }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--muted-foreground)", lineHeight: "1.4" }}>{m.desc}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em" }}>LEGENDA DE PRIORIDADE</div>
                {(Object.entries(PRIO_META) as [string, typeof PRIO_META[1]][]).map(([k, m]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 800, background: m.bg, color: m.c, border: `1px solid ${m.border}`, flexShrink: 0 }}>{m.short}</span>
                    <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Coluna direita: Resultados ───────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!prof && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>👤</div>
              <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--card-foreground)", marginBottom: "4px" }}>Selecione um profissional</div>
              <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>As sessões livres e os pacientes elegíveis aparecerão aqui.</div>
            </div>
          )}
          {prof && profSessoes.length === 0 && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: "#ef4444", fontWeight: 700, marginBottom: "4px" }}>Nenhuma sessão livre encontrada</div>
              <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Verifique se o CSV está carregado e se o profissional possui sessões com status "Livre".</div>
            </div>
          )}

          {/* Grade da agenda do profissional (Pedido 2) */}
          {prof && profSessoes.length > 0 && (
            <ProfAgendaGrid prof={prof} cRows={cRows} resultados={resultados} />
          )}

          {prof && profSessoes.length > 0 && filtrados.length === 0 && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Nenhum resultado para o filtro selecionado.</div>
            </div>
          )}
          {filtrados.length > 0 && (() => {
            const byDia: Record<string, SlotResult[]> = {}
            for (const s of filtrados) {
              if (!byDia[s.dia]) byDia[s.dia] = []
              byDia[s.dia].push(s)
            }
            return Object.entries(byDia).map(([dia, sessoes]) => (
              <div key={dia} style={{ marginBottom: "16px" }}>
                <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "8px", paddingBottom: "4px", borderBottom: `2px solid ${B.navy}22` }}>
                  {dia.replace("-feira", "")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {sessoes.map((s, i) => (
                    <SessaoCard key={i} slot={s} stOf={stOf} setSt={setSt} onVer={item => setModalItem(item)} />
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      </div>

      {modalItem && (
        <AgendaModal
          item={modalItem}
          cRows={cRows}
          onClose={() => setModalItem(null)}
          currentSt={stOf(modalItem.pac, modalItem.slot.dia, modalItem.slot.hora)}
          onAceitar={() => setSt(modalItem.pac, modalItem.slot.dia, modalItem.slot.hora, "acompanhamento")}
          onDesfazer={() => setSt(modalItem.pac, modalItem.slot.dia, modalItem.slot.hora, null)}
        />
      )}
    </>
  )
}

// ─── SessaoCard ───────────────────────────────────────────────────────────────

function SessaoCard({
  slot, stOf, setSt, onVer,
}: {
  slot: SlotResult
  stOf: (pac: string, dia: string, hora: string) => Status | null
  setSt: (pac: string, dia: string, hora: string, s: Status | null) => void
  onVer: (item: ModalItem) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const nCands = slot.cands.length

  return (
    <div style={{ background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
      <button
        onClick={() => setExpanded(x => !x)}
        style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px", background: "var(--muted)", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", borderBottom: expanded ? "1px solid var(--border)" : "none" }}
      >
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "14px", color: B.navy, flexShrink: 0 }}>{slot.hora}</span>
        <span style={{ fontWeight: 700, fontSize: "12px", color: "var(--card-foreground)", flex: 1 }}>
          {slot.terapia}
          <span style={{ fontWeight: 400, color: "var(--muted-foreground)", marginLeft: "6px" }}>· {slot.unidade}</span>
        </span>
        <span style={{ fontSize: "11px", fontWeight: 700, flexShrink: 0, color: nCands > 0 ? "#16a34a" : "var(--muted-foreground)" }}>
          {nCands > 0 ? `${nCands} paciente${nCands > 1 ? "s" : ""}` : "sem pacientes"}
        </span>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", marginLeft: "4px" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {nCands === 0 ? (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", padding: "8px 4px", fontStyle: "italic" }}>
              Nenhum paciente elegível para esta sessão.
            </div>
          ) : slot.cands.map((c, ci) => (
            <PacCard key={ci} c={c} slot={slot} stOf={stOf} setSt={setSt} onVer={onVer} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PacCard ─────────────────────────────────────────────────────────────────

function PacCard({
  c, slot, stOf, setSt, onVer,
}: {
  c: CandInfo
  slot: SlotResult
  stOf: (pac: string, dia: string, hora: string) => Status | null
  setSt: (pac: string, dia: string, hora: string, s: Status | null) => void
  onVer: (item: ModalItem) => void
}) {
  const st  = stOf(c.pac, slot.dia, slot.hora)
  const stM = st ? STATUS_META[st] : null
  const pm_ = PRIO_META[c.prio]
  const rm_ = REGRA_META[c.regra]

  return (
    <div style={{
      border: `1px solid ${st ? B.blue + "44" : "var(--border)"}`,
      borderRadius: "10px", padding: "10px 12px",
      background: st ? "var(--muted)" : "var(--card)",
      display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 180px" }}>
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "5px" }}>
          <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 800, background: pm_.bg, color: pm_.c, border: `1px solid ${pm_.border}` }}>
            {pm_.short}
          </span>
          <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 800, background: rm_.bg, color: rm_.c, border: `1px solid ${rm_.border}` }}>
            {rm_.label}
          </span>
          {stM && <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 700, background: stM.bg, color: stM.c }}>{stM.label}</span>}
        </div>

        <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--card-foreground)" }}>{fmtName(c.pac)}</div>

        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>
          Autorizado: <strong>{c.aut}</strong> · Ofertado: <strong>{c.of}</strong> · <span style={{ color: "#dc2626", fontWeight: 700 }}>Diferença: −{c.dif}</span>
        </div>

        {c.sessNoDia.length > 0 && (
          <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "2px" }}>
            Já neste dia: {c.sessNoDia.join(", ")}
          </div>
        )}

        {c.vComp.length > 0 && (
          <div style={{ fontSize: "10px", color: "#16a34a", fontWeight: 700, marginTop: "4px" }}>
            Oferecer junto: {c.vComp.map(v => {
              const nAlts = (c.vCompAlts[v.hora] || [v]).length
              return `${v.hora} — ${nAlts > 1 ? `${nAlts} opções` : `${v.tP} · ${fmtName(v.prof)}`}`
            }).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap", flexShrink: 0, alignSelf: "center" }}>
        <button
          onClick={() => onVer({ pac: c.pac, slot, vComp: c.vComp, vCompAlts: c.vCompAlts })}
          style={btnStyle("var(--muted)", "var(--card-foreground)", "var(--border)")}
        >
          🗓 Ver
        </button>

        {!st && (
          <button onClick={() => setSt(c.pac, slot.dia, slot.hora, "inviavel")} style={btnStyle("#fef2f2", "#dc2626", "#fca5a5")}>
            ⛔ Inviável
          </button>
        )}

        {st === "inviavel" && (
          <button onClick={() => setSt(c.pac, slot.dia, slot.hora, null)} style={btnStyle("var(--muted)", "var(--muted-foreground)", "var(--border)")}>
            Desfazer
          </button>
        )}
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string, border: string): CSSProperties {
  return { padding: "5px 10px", borderRadius: "8px", background: bg, color, border: `1px solid ${border}`, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }
}
