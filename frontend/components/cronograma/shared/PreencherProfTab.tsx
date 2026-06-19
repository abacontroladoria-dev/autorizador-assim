"use client"

import { useCallback, useMemo, useState } from "react"
import {
  B, ABA_EXT, DIAS_LIST, DIAS_ORD, ESP_CLINICO, EXCLUIR_OCUP, FOCO_CAMILA_PROF,
  HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP, isProfBloqueadoTemp,
  reservaSlotKey, reservasAtivasFromWa, DIAS_UTIL, SK_PREENCHER,
} from "@/lib/cronograma/constants"
import {
  buildCronoUnitMeta, fm, fmtName, isLaudoComAlta, pm,
  shouldShowSessionUnit, turnoFromHora, turnoNome, unidadeBadgeText,
} from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import type { CsvRow, LaudoRow, WaMap } from "@/types/cronograma"


// ─── Constants ────────────────────────────────────────────────────────────────
const UNIDS_SIM = ["Realengo", "Padre Miguel", "Fazendinha"] as const
const EXCLUIR_GAPS = new Set([
  "Coordenador de Caso", "Supervisão ABA",
  "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa",
])

// ─── Types ────────────────────────────────────────────────────────────────────
interface GapItem { pac: string; esp: string; aut: number; of: number; gap: number }
interface VCompItem { tP: string; tE: string; prof: string; dia: string; hora: string; unidade: string }
interface RemInfo { tP: string; prof: string; dia: string; hora: string; unidade: string }
interface CandInfo {
  pac: string; gap: number; aut: number; of: number; tipo: string; rank: number
  sessD: string[]; diasUn: string; vComp: string; vCompSlots: VCompItem[]
  conflito?: string; remanejamento?: RemInfo
}
interface SlotData { dia: string; hora: string; unidade: string; terapia: string; esp: string; cands: CandInfo[] }
interface SimSlotItem { dia: string; turno: string; unid: string; hora: string; cands: CandInfo[] }
interface SimPart { dia: string; turno: string; unid: string; nPac: number; sessTotal: number; slots: SimSlotItem[] }
interface UnitRankItem { unid: string; nPac: number; sessTotal: number; parts: SimPart[] }
interface PacSlot extends SlotData { rank: number; tipo: string; prof: string }
interface PropostaItem {
  prof: string; dia: string; hora: string; unidade: string
  terapia: string; esp: string; vCompSlots: VCompItem[]
}
interface ModalItemData { pac: string; proposta: PropostaItem }

type LocalWaStatus = "aguardando" | "aceito" | "recusado" | "inviavel"
const WA_S: Record<LocalWaStatus, { bg: string; c: string; l: string }> = {
  aguardando: { bg: B.blueLt, c: B.blue, l: "Aguardando WA" },
  aceito: { bg: B.limeLt, c: "#4a6e20", l: "Aceito" },
  recusado: { bg: "#fef2f2", c: "#dc2626", l: "Recusado" },
  inviavel: { bg: "#f3f4f6", c: "#6b7280", l: "Inviável" },
}

// ─── Pure helpers (defined outside to be stable across renders) ───────────────
function hiStr(r: CsvRow): string { return String(r.HI_str || "") }
function hiMin(r: CsvRow): number { return Number(r.HI || 0) }
function rowUnid(r: CsvRow): string { return String(r.Unidade || "Desconhecida") }
function adjHs(hora: string): string[] {
  const hi = pm(hora)
  if (hi === null) return []
  return [hi + 40, hi - 40].filter(v => v >= 0).map(fm)
}

// ─── InfoTip ──────────────────────────────────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [v, setV] = useState(false)
  return (
    <span onMouseEnter={() => setV(true)} onMouseLeave={() => setV(false)}
      onClick={e => { e.stopPropagation(); setV(x => !x) }}
      style={{ position: "relative", cursor: "help", display: "inline-flex", flexShrink: 0, marginLeft: 5, verticalAlign: "middle" }}>
      <span style={{ width: 15, height: 15, borderRadius: "50%", background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}55`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>i</span>
      {v && <span style={{ position: "absolute", left: 18, top: -8, zIndex: 800, width: 240, background: B.navy, color: "white", borderRadius: 10, padding: "8px 10px", fontSize: 11, lineHeight: 1.35, boxShadow: "0 8px 24px rgba(0,0,0,.22)" }}>{text}</span>}
    </span>
  )
}

// ─── PacPreencherModal ────────────────────────────────────────────────────────
const ABA_EXT_S = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa"])

interface ModalProps {
  pac: string; proposta: PropostaItem; cRows: CsvRow[]
  waStatus: string | null
  onStatus: (s: LocalWaStatus | null) => void
  onClose: () => void
}

function PacPreencherModal({ pac, proposta, cRows, waStatus, onStatus, onClose }: ModalProps) {
  const sessPac = useMemo(() => {
    const seen = new Set<string>()
    const res: { dia: string; hora: string; terapia: string; prof: string; unidade: string; isAdmin: boolean }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac) continue
      if (ABA_EXT_S.has(r.Terapia)) continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${r.Terapia}|||${r.Profissional}`
      if (seen.has(k)) continue; seen.add(k)
      res.push({ dia: r["Dia da Semana"], hora: hiStr(r), terapia: r.Terapia, prof: r.Profissional, unidade: rowUnid(r), isAdmin: EXCLUIR_OCUP.has(r.Terapia) })
    }
    return res
  }, [pac, cRows])

  type CellInfo = { tP: string; prof: string; tipo: "proposta" | "admin" | "exist"; unidade: string }
  const cMap: Record<string, CellInfo[]> = {}
  for (const s of sessPac) {
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    cMap[k].push({ tP: s.terapia, prof: s.prof, tipo: s.isAdmin ? "admin" : "exist", unidade: s.unidade })
  }
  const kP = `${proposta.dia}|||${proposta.hora}`
  if (!cMap[kP]) cMap[kP] = []
  cMap[kP].push({ tP: proposta.terapia, prof: proposta.prof || "Novo profissional", tipo: "proposta", unidade: proposta.unidade })
  for (const vc of proposta.vCompSlots) {
    const kC = `${vc.dia || proposta.dia}|||${vc.hora}`
    if (!cMap[kC]) cMap[kC] = []
    cMap[kC].push({ tP: vc.tP, prof: vc.prof || "Novo profissional", tipo: "proposta", unidade: vc.unidade || proposta.unidade })
  }

  const diasComSess = [...new Set([...DIAS_LIST.slice(0, 5), ...sessPac.map(s => s.dia), proposta.dia, ...proposta.vCompSlots.map(vc => vc.dia || proposta.dia)])]
    .sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const horasGrid = HORAS_GRID.filter(h => diasComSess.some(d => cMap[`${d}|||${h}`]?.length))
  const unitMeta = buildCronoUnitMeta(diasComSess, cMap)

  const convRowPac = cRows.find(r => r["Nome Favorecido"] === pac && (r["Convênio"] || r["Convenio"]))
  const convenioPac = String(convRowPac?.["Convênio"] || convRowPac?.["Convenio"] || "")

  const cSt = (tipo: string) => {
    if (tipo === "proposta") return { bg: B.limeLt, bd: B.lime, label: "Nova sessão", lc: B.purple }
    if (tipo === "admin") return { bg: "#f3f4f6", bd: "#d1d5db", label: null, lc: null }
    return { bg: "#f8fafc", bd: "#e2e8f0", label: null, lc: null }
  }

  const ws = waStatus as LocalWaStatus | null
  const wsS = ws && WA_S[ws] ? WA_S[ws] : null

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", padding: 12 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: "white", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.22)", width: "96vw", maxWidth: 960, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa", borderRadius: "18px 18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: B.navy }}>{pac}</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>Convênio: {convenioPac || "—"}</span>
              <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
              <span style={{ background: B.limeLt, color: "#4a6e20", border: `1px solid ${B.lime}88`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                Nova: {proposta.terapia} · {proposta.dia.replace("-feira", "")} {proposta.hora} · {proposta.unidade}
                {proposta.vCompSlots.length ? ` + ${proposta.vCompSlots.length} complementar(es)` : ""}
              </span>
              {wsS && <span style={{ background: wsS.bg, color: wsS.c, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{wsS.l}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: 16, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 10, color: "#9ca3af", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: B.limeLt, border: `1px solid ${B.lime}` }} /> Nova sessão proposta</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#f8fafc", border: "1px solid #e2e8f0" }} /> Existente</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#f3f4f6", border: "1px solid #d1d5db" }} /> Administrativo</span>
          </div>
          {!horasGrid.length ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>Nenhuma sessão encontrada.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
              <thead><tr>
                <th style={{ width: 52, paddingBottom: 8, textAlign: "right", paddingRight: 10, fontSize: 12, color: "#9ca3af", fontWeight: 400 }}>Hora</th>
                {diasComSess.map(d => (
                  <th key={d} style={{ minWidth: 130, paddingBottom: 8, textAlign: "center", fontSize: 13, color: d === proposta.dia ? B.purple : B.navy, fontWeight: 800 }}>
                    <div>{d.replace("-feira", "")} {d === proposta.dia && <span style={{ fontSize: 10, background: B.limeLt, color: "#4a6e20", borderRadius: 4, padding: "1px 4px", marginLeft: 2 }}>nova</span>}</div>
                    <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {horasGrid.map(hora => (
                  <tr key={hora} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ textAlign: "right", paddingRight: 10, verticalAlign: "top", paddingTop: 8, fontFamily: "monospace", fontSize: 15, fontWeight: 800, color: hora === proposta.hora ? B.purple : B.navy }}>{hora}</td>
                    {diasComSess.map(d => {
                      const cells = cMap[`${d}|||${hora}`] || []
                      return (
                        <td key={d} style={{ padding: 3, verticalAlign: "top" }}>
                          {cells.map((c, ci) => {
                            const cs = cSt(c.tipo)
                            return (
                              <div key={ci} style={{ background: cs.bg, border: `1px solid ${cs.bd}`, borderRadius: 9, padding: "7px 9px", marginBottom: 3, minHeight: 58, display: "flex", flexDirection: "column", gap: 2 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{c.tP}</div>
                                <div style={{ fontSize: 11, color: "#6b7280" }}>{fmtName(c.prof)}</div>
                                {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                                  <div style={{ fontSize: 10, fontWeight: 800, color: B.blue, background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: 999, padding: "1px 6px", width: "fit-content" }}>
                                    {unidadeBadgeText(c.unidade)}
                                  </div>
                                )}
                                {cs.label && <div style={{ fontSize: 11, fontWeight: 700, color: cs.lc ?? undefined, marginTop: "auto" }}>{cs.label}</div>}
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

        <div style={{ padding: "10px 20px", borderTop: "1px solid #f0f0f0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", background: "#fafafa", borderRadius: "0 0 18px 18px" }}>
          <div style={{ flex: 1, fontSize: 11, color: "#9ca3af" }}>Cronograma atual + sessão proposta em verde.</div>
          {!ws && <button onClick={() => onStatus("aguardando")} style={{ padding: "7px 13px", borderRadius: 9, border: "none", background: B.blue, color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Oferecer via WA</button>}
          {ws === "aguardando" && <>
            <button onClick={() => onStatus(null)} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Desfazer envio</button>
            <button onClick={() => onStatus("aceito")} style={{ padding: "7px 12px", borderRadius: 9, border: "none", background: "#16a34a", color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Aceito</button>
            <button onClick={() => onStatus("recusado")} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Recusado</button>
            <button onClick={() => onStatus("inviavel")} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#6b7280", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Inviável</button>
          </>}
          <button onClick={onClose} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── usePreencherGaps ─────────────────────────────────────────────────────────
function usePreencherGaps(lRows: LaudoRow[], cRows: CsvRow[]): GapItem[] {
  return useMemo(() => {
    if (!cRows.length || !lRows.length) return []
    const qtdOf: Record<string, number> = {}
    for (const r of cRows) {
      if (r["Status do Agendamento"] !== "Agendado") continue
      const pac = r["Nome Favorecido"]
      if (!pac || PACS_ADMIN.has(pac)) continue
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp || EXCLUIR_GAPS.has(r.Terapia)) continue
      const k = `${pac}|||${esp}`
      qtdOf[k] = (qtdOf[k] || 0) + 1
    }
    const qtdAut: Record<string, number> = {}
    const altaSet = new Set<string>()
    for (const l of lRows) {
      const pac = String(l["Paciente"] || "").trim()
      const esp = String(l["Especialidade"] || "").trim()
      if (!pac || PACS_ADMIN.has(pac) || !esp) continue
      if (isLaudoComAlta(l)) { altaSet.add(`${pac}|||${esp}`); continue }
      const sit = String(l["Situação"] || "").trim()
      if (sit && sit !== "Vigente" && sit !== "vigente") continue
      const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
      if (aut <= 0) continue
      const k = `${pac}|||${esp}`
      if (!qtdAut[k] || aut > qtdAut[k]) qtdAut[k] = aut
    }
    for (const k of altaSet) delete qtdAut[k]
    const gaps: GapItem[] = []
    for (const [k, aut] of Object.entries(qtdAut)) {
      const of_ = qtdOf[k] || 0
      const gap = Math.round((aut - of_) * 10) / 10
      if (gap > 0) {
        const [pac, esp] = k.split("|||")
        gaps.push({ pac, esp, aut, of: of_, gap })
      }
    }
    return gaps
  }, [lRows, cRows])
}

// ─── PreencherProfTab ─────────────────────────────────────────────────────────
interface Props {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  waMap?: WaMap
  onWaChange?: (m: WaMap) => void
  initialMode?: "prof" | "sim" | "paciente"
  fixedMode?: boolean
}

export function PreencherProfTab({ cRows, lRows, waMap: waMapProp, onWaChange, initialMode = "prof", fixedMode = false }: Props) {
  const [modeState, setMode] = useState<"prof" | "sim" | "paciente">(initialMode)
  const mode = fixedMode ? initialMode : modeState

  const [fpProf, setFpProf] = useState("")
  const [fpEsp, setFpEsp] = useState("")
  const [fpDia, setFpDia] = useState("")

  const [simEsp, setSimEsp] = useState("Terapia Alimentar")
  const [simUnid, setSimUnid] = useState("")
  const [simDT, setSimDT] = useState<Record<string, { manha?: boolean; tarde?: boolean }>>({ "Quarta-feira": { manha: true, tarde: true } })

  const [pacSel, setPacSel] = useState("")
  const [pacEsp, setPacEsp] = useState("")

  const [localWaMap, setLocalWaMap] = useState<WaMap>(() => {
    try { return JSON.parse(localStorage.getItem(SK_PREENCHER) || "{}") } catch { return {} }
  })
  const waMap = waMapProp ?? localWaMap
  const saveWa = (m: WaMap) => {
    if (onWaChange) onWaChange(m)
    else { setLocalWaMap(m); try { localStorage.setItem(SK_PREENCHER, JSON.stringify(m)) } catch {} }
  }

  const [modalItem, setModalItem] = useState<ModalItemData | null>(null)

  const allGaps = usePreencherGaps(lRows, cRows)
  const gapMap = useMemo(() => {
    const m: Record<string, GapItem> = {}
    for (const g of allGaps) m[`${g.pac}|||${g.esp}`] = g
    return m
  }, [allGaps])

  const espOptions = useMemo(() => [...new Set(Object.values(TERAPIA_TO_ESP))].filter(Boolean).sort(), [])
  const simEspValida = espOptions.includes(simEsp)

  const agend = useMemo(() => cRows.filter(r => r["Status do Agendamento"] === "Agendado"), [cRows])
  const agendClin = useMemo(() =>
    agend.filter(r => !EXCLUIR_GAPS.has(r.Terapia) && r["Nome Favorecido"] && !PACS_ADMIN.has(r["Nome Favorecido"])),
    [agend]
  )
  const reservasWa = useMemo(() => reservasAtivasFromWa(waMap), [waMap])

  const slotReservadoOutro = useCallback((pac: string, prof: string, dia: string, hora: string) => {
    const dono = reservasWa.get(reservaSlotKey(prof, dia, hora))
    return !!(dono && dono !== pac)
  }, [reservasWa])

  const todosProfs = useMemo(() => [...new Set(cRows.map(r => r.Profissional).filter(Boolean))].sort(), [cRows])

  const getPacTurno = useCallback((pac: string) => {
    const ext = agend.filter(r => r["Nome Favorecido"] === pac && ABA_EXT.has(r.Terapia))
    if (ext.length) {
      const manha = ext.some(r => hiMin(r) < 780)
      const tarde = ext.some(r => hiMin(r) >= 780)
      if (manha && !tarde) return "tarde"
      if (tarde && !manha) return "manha"
      return null
    }
    const cli = agendClin.filter(r => r["Nome Favorecido"] === pac)
    if (!cli.length) return null
    const manha = cli.some(r => hiMin(r) < 780)
    const tarde = cli.some(r => hiMin(r) >= 780)
    if (manha && !tarde) return "manha"
    if (tarde && !manha) return "tarde"
    return "ambos"
  }, [agend, agendClin])

  const turnoOk = useCallback((pac: string, hora: string) => {
    const hi = pm(hora); const t = getPacTurno(pac)
    if (hi === null || !t || t === "ambos") return true
    return t === "manha" ? hi < 780 : hi >= 780
  }, [getPacTurno])

  const isAdjacente = useCallback((pac: string, dia: string, unidade: string, hora: string) =>
    agendClin.some(r => r["Nome Favorecido"] === pac && r["Dia da Semana"] === dia && rowUnid(r) === unidade && adjHs(hora).includes(hiStr(r))),
    [agendClin]
  )

  const gapRestante = useCallback((pac: string, esp: string, consumo = 0) =>
    (gapMap[`${pac}|||${esp}`]?.gap || 0) - consumo, [gapMap]
  )

  const complementosNovoDia = useCallback((
    pac: string, espBase: string, dia: string, unidade: string, hora: string, slotAtual: CsvRow | null
  ): VCompItem[] => {
    const hs = adjHs(hora); const out: VCompItem[] = []; const seen = new Set<string>()
    for (const r of cRows) {
      if (r["Status do Agendamento"] !== "Livre" || isProfBloqueadoTemp(r.Profissional)) continue
      if (r["Dia da Semana"] !== dia || rowUnid(r) !== unidade || !hs.includes(hiStr(r))) continue
      const compEsp = TERAPIA_TO_ESP[r.Terapia]
      if (!compEsp || EXCLUIR_OCUP.has(r.Terapia) || !gapMap[`${pac}|||${compEsp}`]) continue
      if (slotAtual && r.Profissional === slotAtual.Profissional && hiStr(r) === hiStr(slotAtual) && r.Terapia === slotAtual.Terapia) continue
      if (gapRestante(pac, compEsp, compEsp === espBase ? 1 : 0) <= 0) continue
      if (!turnoOk(pac, hiStr(r)) || slotReservadoOutro(pac, r.Profissional, dia, hiStr(r))) continue
      if (agend.some(a => a["Nome Favorecido"] === pac && a["Dia da Semana"] === dia && hiStr(a) === hiStr(r))) continue
      const k = `${r.Profissional}|||${hiStr(r)}|||${r.Terapia}`
      if (seen.has(k)) continue; seen.add(k)
      out.push({ tP: r.Terapia, tE: compEsp, prof: r.Profissional, dia, hora: hiStr(r), unidade })
    }
    return out
  }, [cRows, gapMap, agend, turnoOk, gapRestante, slotReservadoOutro])

  // WA helpers
  const waKey = (pac: string, dia: string, hora: string, prof: string) => `${pac}|||${prof || fpProf}|||${dia}|||${hora}`
  const wstOf = (pac: string, dia: string, hora: string, prof: string): LocalWaStatus | null =>
    (waMap[waKey(pac, dia, hora, prof)] as LocalWaStatus) || null
  const setWst = (pac: string, dia: string, hora: string, prof: string, status: LocalWaStatus | null) => {
    const k = waKey(pac, dia, hora, prof)
    if (status === null) { const m = { ...waMap }; delete m[k]; saveWa(m) }
    else saveWa({ ...waMap, [k]: status })
  }

  // CandCard — defined in component body to close over wstOf/setWst/setModalItem
  function CandCard({ c, dia, hora, unidade, terapia, profKey }: { c: CandInfo; dia: string; hora: string; unidade: string; terapia: string; profKey: string }) {
    const ws = wstOf(c.pac, dia, hora, profKey)
    const wsS = ws ? WA_S[ws] : null
    const proposta: PropostaItem = { prof: profKey || "Novo profissional", dia, hora, unidade, terapia, esp: TERAPIA_TO_ESP[terapia] || terapia, vCompSlots: c.vCompSlots || [] }
    return (
      <div style={{ background: ws ? "#f8fafc" : "white", border: `1px solid ${ws ? B.blue + "44" : "#e5e7eb"}`, borderRadius: 10, padding: "9px 11px", display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: "#1f2937" }}>{c.pac}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Aut: <strong>{c.aut}</strong> · Of: <strong>{c.of}</strong> · <span style={{ color: "#dc2626", fontWeight: 700 }}>Gap −{c.gap}</span></div>
          {c.tipo && <div style={{ fontSize: 10, color: c.rank === 0 ? "#4a6e20" : c.rank === 1 ? B.orange : "#6b7280", fontWeight: 700, marginTop: 1 }}>🎯 {c.tipo}</div>}
          {c.sessD?.length > 0 && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Já neste dia: {c.sessD.join(", ")}</div>}
          {!c.sessD?.length && c.diasUn && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Frequenta a unidade em: {c.diasUn}</div>}
          {c.vComp && <div style={{ fontSize: 10, color: "#4a6e20", marginTop: 1, fontWeight: 700 }}>Oferecer junto: {c.vComp}</div>}
          {c.conflito && <div style={{ fontSize: 10, color: B.orange, marginTop: 1 }}>Conflito: {c.conflito}</div>}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          {wsS && <span style={{ background: wsS.bg, color: wsS.c, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{wsS.l}</span>}
          <button onClick={() => setModalItem({ pac: c.pac, proposta })} style={{ padding: "4px 9px", borderRadius: 7, background: "#f3f4f6", color: B.navy, border: "1px solid #e5e7eb", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Ver</button>
          {!ws && <button onClick={() => setWst(c.pac, dia, hora, profKey, "aguardando")} style={{ padding: "4px 9px", borderRadius: 7, background: B.blue, color: "white", border: "none", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Oferecer via WA</button>}
          {ws === "aguardando" && <>
            <button onClick={() => setWst(c.pac, dia, hora, profKey, null)} style={{ padding: "4px 7px", borderRadius: 7, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Desfazer envio</button>
            <button onClick={() => setWst(c.pac, dia, hora, profKey, "aceito")} style={{ padding: "4px 7px", borderRadius: 7, background: "#16a34a", color: "white", border: "none", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Aceito</button>
            <button onClick={() => setWst(c.pac, dia, hora, profKey, "recusado")} style={{ padding: "4px 7px", borderRadius: 7, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Recusado</button>
            <button onClick={() => setWst(c.pac, dia, hora, profKey, "inviavel")} style={{ padding: "4px 7px", borderRadius: 7, background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Inviável</button>
          </>}
        </div>
      </div>
    )
  }

  // ─── PROF MODE logic ─────────────────────────────────────────────────────────
  const profSlots = useMemo(() => {
    if (!fpProf || !cRows.length) return []
    const seen = new Set<string>()
    return cRows.filter(r => {
      if (r.Profissional !== fpProf || r["Status do Agendamento"] !== "Livre" || isProfBloqueadoTemp(r.Profissional)) return false
      if (!TERAPIA_TO_ESP[r.Terapia] || EXCLUIR_OCUP.has(r.Terapia)) return false
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${rowUnid(r)}|||${r.Terapia}`
      if (seen.has(k)) return false; seen.add(k); return true
    }).sort((a, b) => ((DIAS_ORD[a["Dia da Semana"]] ?? 9) - (DIAS_ORD[b["Dia da Semana"]] ?? 9)) || ((pm(hiStr(a)) || 0) - (pm(hiStr(b)) || 0)))
  }, [fpProf, cRows])

  const profSlotData = useMemo((): SlotData[] => profSlots.map(slot => {
    const dia = slot["Dia da Semana"], hora = hiStr(slot), unidade = rowUnid(slot), terapia = slot.Terapia
    const esp = TERAPIA_TO_ESP[terapia] || terapia
    const pacDia = new Set(agendClin.filter(r => r["Dia da Semana"] === dia && rowUnid(r) === unidade).map(r => r["Nome Favorecido"]))
    const pacUn = new Set(agendClin.filter(r => rowUnid(r) === unidade).map(r => r["Nome Favorecido"]))
    const cands: CandInfo[] = [...pacUn].filter(p => gapMap[`${p}|||${esp}`]).map((p): CandInfo | null => {
      const g = gapMap[`${p}|||${esp}`]
      if (!turnoOk(p, hora) || slotReservadoOutro(p, slot.Profissional, dia, hora)) return null
      const wsK = waMap[`${p}|||${slot.Profissional}|||${dia}|||${hora}`]
      if (wsK === "recusado" || wsK === "inviavel") return null
      if (agend.some(r => r["Nome Favorecido"] === p && r["Dia da Semana"] === dia && hiStr(r) === hora)) return null
      const mesmoDia = pacDia.has(p)
      const adjOk = isAdjacente(p, dia, unidade, hora)
      const comp = mesmoDia ? [] : complementosNovoDia(p, esp, dia, unidade, hora, slot).slice(0, 2)
      if (mesmoDia && !adjOk) return null
      if (!mesmoDia && !comp.length) return null
      const rank = mesmoDia ? 0 : 2
      const tipo = mesmoDia ? "Adjacente no mesmo dia" : "Novo dia com 2 sessões"
      const sessD = agendClin.filter(r => r["Nome Favorecido"] === p && r["Dia da Semana"] === dia && rowUnid(r) === unidade && !EXCLUIR_GAPS.has(r.Terapia)).map(r => hiStr(r)).sort()
      const diasUn = [...new Set(agendClin.filter(r => r["Nome Favorecido"] === p && rowUnid(r) === unidade).map(r => r["Dia da Semana"].replace("-feira", "")).filter(Boolean))].join(", ")
      const vComp = comp.length ? comp.map(c => `${c.tP} ${c.hora}`).join(" | ") : ""
      return { pac: p, gap: g.gap, aut: g.aut, of: g.of, sessD, diasUn, tipo, rank, vComp, vCompSlots: comp, conflito: "" }
    }).filter((x): x is CandInfo => x !== null).sort((a, b) => a.rank - b.rank || b.gap - a.gap || a.pac.localeCompare(b.pac))
    return { dia, hora, unidade, terapia, esp, cands }
  }), [profSlots, agendClin, agend, gapMap, turnoOk, isAdjacente, complementosNovoDia, slotReservadoOutro, waMap])

  const diasDisp = [...new Set(profSlotData.map(s => s.dia))]
  const espsDisp = [...new Set(profSlotData.map(s => s.esp))].sort()
  const slotFilt = profSlotData.filter(s => (!fpEsp || s.esp === fpEsp) && (!fpDia || s.dia === fpDia))

  // ─── SIM MODE logic ─────────────────────────────────────────────────────────
  const simPeriodos = useMemo(() =>
    (DIAS_UTIL as readonly string[]).flatMap(d =>
      (["manha", "tarde"] as const).filter(t => simDT?.[d]?.[t]).map(t => ({ dia: d, turno: t as string }))
    ), [simDT]
  )

  const avaliaSimPeriodo = useCallback((dia: string, turno: string, unid: string): SimPart => {
    if (!simEspValida || !cRows.length) return { dia, turno, unid, nPac: 0, sessTotal: 0, slots: [] }
    const slots: SimSlotItem[] = []; const validPac = new Set<string>(); let sessTotal = 0
    const pacDia = new Set(agendClin.filter(r => r["Dia da Semana"] === dia && rowUnid(r) === unid).map(r => r["Nome Favorecido"]))
    for (const hora of HORAS_GRID.filter(h => turnoFromHora(h) === turno)) {
      const pacConf = new Set(agend.filter(r => r["Dia da Semana"] === dia && hiStr(r) === hora && r["Nome Favorecido"] && r["Nome Favorecido"] !== "Ainda não selecionado").map(r => r["Nome Favorecido"]))
      const cands: CandInfo[] = [...pacDia].filter(p => gapMap[`${p}|||${simEsp}`] && !pacConf.has(p) && turnoOk(p, hora) && isAdjacente(p, dia, unid, hora)).map(p => {
        const g = gapMap[`${p}|||${simEsp}`]
        const sessD = agendClin.filter(r => r["Nome Favorecido"] === p && r["Dia da Semana"] === dia && rowUnid(r) === unid).map(r => hiStr(r)).sort()
        return { pac: p, gap: g.gap, aut: g.aut, of: g.of, sessD, diasUn: "", tipo: "Adjacente no mesmo dia", rank: 0, vComp: "", vCompSlots: [] }
      }).sort((a, b) => b.gap - a.gap || a.pac.localeCompare(b.pac))
      if (cands.length) { slots.push({ dia, turno, unid, hora, cands }); sessTotal += cands.length; cands.forEach(c => validPac.add(c.pac)) }
    }
    return { dia, turno, unid, nPac: validPac.size, sessTotal, slots }
  }, [simEsp, simEspValida, cRows, agendClin, agend, gapMap, turnoOk, isAdjacente])

  const unitRank = useMemo((): UnitRankItem[] => {
    if (!simEspValida || !cRows.length || !simPeriodos.length) return []
    return ([...UNIDS_SIM] as string[]).map(unid => {
      const parts = simPeriodos.map(p => avaliaSimPeriodo(p.dia, p.turno, unid))
      const pacs = new Set<string>(); let sessTotal = 0
      for (const part of parts) { sessTotal += part.sessTotal; part.slots.forEach(sl => sl.cands.forEach(c => pacs.add(c.pac))) }
      return { unid, nPac: pacs.size, sessTotal, parts }
    }).sort((a, b) => b.sessTotal - a.sessTotal || b.nPac - a.nPac || a.unid.localeCompare(b.unid))
  }, [simEspValida, cRows, simPeriodos, avaliaSimPeriodo])

  const planoRecomendado = useMemo((): SimPart[] => {
    if (!simPeriodos.length) return []
    const escolhas: SimPart[] = simPeriodos.map(p =>
      ([...UNIDS_SIM] as string[]).map(unid => avaliaSimPeriodo(p.dia, p.turno, unid)).sort((a, b) => b.sessTotal - a.sessTotal || b.nPac - a.nPac || a.unid.localeCompare(b.unid))[0]
    )
    for (const dia of DIAS_UTIL as readonly string[]) {
      const idxs = escolhas.map((e, i) => e?.dia === dia ? i : -1).filter(i => i >= 0)
      if (idxs.length < 2) continue
      const unids = new Set(idxs.map(i => escolhas[i]?.unid))
      if (unids.has("Padre Miguel") && unids.size > 1) {
        const melhorFixa = ([...UNIDS_SIM] as string[]).map(unid => {
          const parts = idxs.map(i => avaliaSimPeriodo(escolhas[i].dia, escolhas[i].turno, unid))
          const pacs = new Set(parts.flatMap(p => p.slots.flatMap(sl => sl.cands.map(c => c.pac))))
          return { unid, score: parts.reduce((a, p) => a + p.sessTotal, 0), pacs: pacs.size, parts }
        }).sort((a, b) => b.score - a.score || b.pacs - a.pacs || a.unid.localeCompare(b.unid))[0]
        idxs.forEach((i, j) => { escolhas[i] = melhorFixa.parts[j] })
      }
    }
    return escolhas
  }, [simPeriodos, avaliaSimPeriodo])

  const planoStats = useMemo(() => {
    const pacs = new Set<string>(); let sessTotal = 0
    for (const p of planoRecomendado) { sessTotal += p.sessTotal; p.slots.forEach(sl => sl.cands.forEach(c => pacs.add(c.pac))) }
    return { nPac: pacs.size, sessTotal }
  }, [planoRecomendado])

  const simSlots = useMemo((): SimSlotItem[] => {
    if (!simEspValida || !cRows.length || !simPeriodos.length) return []
    const base = simUnid ? simPeriodos.map(p => avaliaSimPeriodo(p.dia, p.turno, simUnid)) : planoRecomendado
    return base.flatMap(p => p.slots)
  }, [simEspValida, cRows, simPeriodos, simUnid, planoRecomendado, avaliaSimPeriodo])

  const toggleSimTurno = (dia: string, turno: "manha" | "tarde") => { setSimUnid(""); setSimDT(prev => ({ ...(prev || {}), [dia]: { ...(prev?.[dia] || {}), [turno]: !prev?.[dia]?.[turno] } })) }
  const toggleSimDiaInteiro = (dia: string) => { setSimUnid(""); setSimDT(prev => { const cur = prev?.[dia] || {}; const all = !!cur.manha && !!cur.tarde; return { ...(prev || {}), [dia]: { manha: !all, tarde: !all } } }) }
  const toggleSimTodos = () => { setSimUnid(""); setSimDT(() => { const all = (DIAS_UTIL as readonly string[]).every(d => simDT?.[d]?.manha && simDT?.[d]?.tarde); const next: Record<string, { manha: boolean; tarde: boolean }> = {}; for (const d of DIAS_UTIL) next[d] = { manha: !all, tarde: !all }; return next }) }

  // ─── PACIENTE MODE logic ─────────────────────────────────────────────────────
  const pacsComGap = useMemo(() => [...new Set(allGaps.map(g => g.pac))].sort(), [allGaps])
  const gapsPaciente = useMemo(() => allGaps.filter(g => g.pac === pacSel).sort((a, b) => b.gap - a.gap || a.esp.localeCompare(b.esp)), [allGaps, pacSel])
  const pacEspAtiva = (pacEsp && gapsPaciente.some(g => g.esp === pacEsp)) ? pacEsp : (gapsPaciente[0]?.esp || "")
  const sessoesPaciente = useMemo(() =>
    agendClin.filter(r => r["Nome Favorecido"] === pacSel).sort((a, b) => ((DIAS_ORD[a["Dia da Semana"]] ?? 9) - (DIAS_ORD[b["Dia da Semana"]] ?? 9)) || ((pm(hiStr(a)) || 0) - (pm(hiStr(b)) || 0))),
    [agendClin, pacSel]
  )
  const pacienteUnidades = useMemo(() => [...new Set(sessoesPaciente.map(r => rowUnid(r)).filter(Boolean))], [sessoesPaciente])

  const pacienteSlots = useMemo((): PacSlot[] => {
    if (!pacSel || !pacEspAtiva || !cRows.length) return []
    const terapias = (ESP_CLINICO[pacEspAtiva] || [pacEspAtiva]).filter(t => !EXCLUIR_OCUP.has(t))
    if (!terapias.length) return []
    const out: PacSlot[] = []
    const livreClin = cRows.filter(r => r["Status do Agendamento"] === "Livre" && !isProfBloqueadoTemp(r.Profissional))
    const diasPaciente = new Set(sessoesPaciente.map(r => r["Dia da Semana"]))
    const unidadesPaciente = new Set(pacienteUnidades)
    const seen = new Set<string>()
    for (const slot of livreClin) {
      const dia = slot["Dia da Semana"], hora = hiStr(slot), unidade = rowUnid(slot)
      if (!terapias.includes(slot.Terapia) || !unidadesPaciente.has(unidade)) continue
      if (!turnoOk(pacSel, hora) || slotReservadoOutro(pacSel, slot.Profissional, dia, hora)) continue
      const wsK = waMap[`${pacSel}|||${slot.Profissional}|||${dia}|||${hora}`]
      if (wsK === "recusado" || wsK === "inviavel") continue
      const conf = agend.filter(r => r["Nome Favorecido"] === pacSel && r["Dia da Semana"] === dia && hiStr(r) === hora)
      const mesmoDia = diasPaciente.has(dia)
      const adjOk = isAdjacente(pacSel, dia, unidade, hora)
      const comp = mesmoDia ? [] : complementosNovoDia(pacSel, pacEspAtiva, dia, unidade, hora, slot).slice(0, 2)
      let tipo = "", rank = 9; let vCompSlots = comp; let remanejamento: RemInfo | undefined
      if (!conf.length && mesmoDia && adjOk) { tipo = "Extremidade no dia atual"; rank = 0 }
      else if (!conf.length && !mesmoDia && comp.length) { tipo = "Novo dia com oferta conjunta"; rank = 2 }
      else if (conf.length === 1 && conf[0].Terapia !== slot.Terapia) {
        const ocupada = conf[0]
        const alt = livreClin.find(r =>
          r.Profissional === ocupada.Profissional && r.Terapia === ocupada.Terapia && rowUnid(r) === rowUnid(ocupada) &&
          !(r["Dia da Semana"] === dia && hiStr(r) === hora) && turnoOk(pacSel, hiStr(r)) &&
          !slotReservadoOutro(pacSel, r.Profissional, r["Dia da Semana"], hiStr(r)) &&
          !agend.some(a => a["Nome Favorecido"] === pacSel && a["Dia da Semana"] === r["Dia da Semana"] && hiStr(a) === hiStr(r))
        )
        if (alt) { tipo = `Remanejar ${ocupada.Terapia} para abrir espaço`; rank = 1; remanejamento = { tP: ocupada.Terapia, prof: alt.Profissional, dia: alt["Dia da Semana"], hora: hiStr(alt), unidade: rowUnid(alt) } }
      }
      if (!tipo) continue
      const k = `${slot.Profissional}|||${dia}|||${hora}|||${slot.Terapia}`
      if (seen.has(k)) continue; seen.add(k)
      const gapInfo = gapMap[`${pacSel}|||${pacEspAtiva}`]
      const conflito = remanejamento ? `Mover ${remanejamento.tP} para ${remanejamento.dia.replace("-feira", "")} ${remanejamento.hora}` : ""
      out.push({
        dia, hora, unidade, terapia: slot.Terapia, esp: pacEspAtiva, prof: slot.Profissional, rank, tipo,
        cands: [{ pac: pacSel, gap: gapInfo?.gap || 0, aut: gapInfo?.aut || 0, of: gapInfo?.of || 0, tipo, rank, vCompSlots, vComp: vCompSlots.length ? vCompSlots.map(c => `${c.tP} ${c.hora}`).join(" | ") : "", sessD: sessoesPaciente.filter(r => r["Dia da Semana"] === dia && rowUnid(r) === unidade).map(r => hiStr(r)).sort(), diasUn: [...diasPaciente].map(d => d.replace("-feira", "")).join(", "), conflito, remanejamento }],
      })
    }
    return out.sort((a, b) => a.rank - b.rank || ((DIAS_ORD[a.dia] ?? 9) - (DIAS_ORD[b.dia] ?? 9)) || ((pm(a.hora) || 0) - (pm(b.hora) || 0)))
  }, [pacSel, pacEspAtiva, cRows, sessoesPaciente, pacienteUnidades, turnoOk, slotReservadoOutro, waMap, agend, isAdjacente, complementosNovoDia, gapMap])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Mode / filters card */}
      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 800, color: B.navy, fontSize: 15 }}>
            {mode === "sim" ? "Simulação de Novo Prestador" : mode === "paciente" ? "Aumentar Ocupação (Paciente)" : "Aumentar Ocupação (Profissional)"}
          </span>
          {!fixedMode && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 3 }}>
              {(["prof", "sim", "paciente"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: mode === m ? B.navy : "transparent", color: mode === m ? "white" : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {m === "prof" ? "Profissional" : m === "sim" ? "Simulação" : "Paciente"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: "#6b7280", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 9, padding: "7px 10px", marginBottom: 10 }}>
          ⓘ Bloqueio temporário ativo: Djinane Ferreira Da Silva e Ana Carolina Mendes França não aparecem como vagas ofertáveis enquanto ainda constarem livres no CSV.
        </div>

        {/* Prof mode */}
        {mode === "prof" && <>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Selecione a profissional para ver seus slots Livres e os candidatos elegíveis.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 240px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Profissional</span>
              <select value={fpProf} onChange={e => { setFpProf(e.target.value); setFpEsp(""); setFpDia("") }} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 11px", fontSize: 13, fontFamily: "inherit" }}>
                <option value="">Selecionar...</option>
                {todosProfs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {fpProf && espsDisp.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Especialidade</span>
              <select value={fpEsp} onChange={e => setFpEsp(e.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 11px", fontSize: 13, fontFamily: "inherit" }}>
                <option value="">Todas</option>{espsDisp.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>}
            {fpProf && diasDisp.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Dia</span>
              <select value={fpDia} onChange={e => setFpDia(e.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 11px", fontSize: 13, fontFamily: "inherit" }}>
                <option value="">Todos</option>{diasDisp.map(d => <option key={d} value={d}>{d.replace("-feira", "")}</option>)}
              </select>
            </div>}
          </div>
          {fpProf === FOCO_CAMILA_PROF && <div style={{ marginTop: 10, background: B.limeLt, border: `1px solid ${B.lime}`, borderRadius: 10, padding: "9px 11px", fontSize: 12, color: "#4a6e20" }}>🎯 Foco Camila ativo: terça usa Padre Miguel; demais slots aparecem conforme a unidade do CSV.</div>}
        </>}

        {/* Sim mode */}
        {mode === "sim" && <>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Simule um novo profissional por terapia, dia e turno. A recomendação pode combinar unidades por turno quando isso aumenta ocupação, respeitando a restrição geográfica de Padre Miguel.<InfoTip text="A simulação considera pacientes com Autorizado > Ofertado, adjacência no mesmo dia/unidade, turno clínico compatível e ausência de conflito no horário." /></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 280px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Especialidade <InfoTip text="Digite parte do nome da terapia e escolha uma opção da lista." /></span>
              <input list="preencher-esp-options" value={simEsp} onChange={e => { setSimEsp(e.target.value); setSimUnid("") }}
                onBlur={() => { const match = espOptions.find(e => e.toLowerCase() === simEsp.trim().toLowerCase()); if (match) setSimEsp(match) }}
                placeholder="Digite para pesquisar e selecione da lista..."
                style={{ border: `1px solid ${simEspValida ? "#d1d5db" : "#fca5a5"}`, borderRadius: 8, padding: "8px 11px", fontSize: 13, fontFamily: "inherit", background: simEspValida ? "white" : "#fff7f7" }} />
              <datalist id="preencher-esp-options">{espOptions.map(e => <option key={e} value={e} />)}</datalist>
              {!simEspValida && <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>Selecione uma especialidade válida da lista.</span>}
            </div>
          </div>
          <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: B.navy }}>Dias e turnos afetados <InfoTip text="Marque manhã, tarde ou dia inteiro. A recomendação avalia cada período separadamente." /></span>
              <button onClick={toggleSimTodos} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Todos</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              {(DIAS_UTIL as readonly string[]).map(d => (
                <div key={d} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 92 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: B.navy }}>{d.replace("-feira", "")}</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {(["manha", "tarde"] as const).map(t => (
                      <button key={t} onClick={() => toggleSimTurno(d, t)} style={{ height: 32, padding: "0 10px", borderRadius: 9, border: `1px solid ${simDT?.[d]?.[t] ? B.blue : "#d1d5db"}`, background: simDT?.[d]?.[t] ? B.blueLt : "white", color: simDT?.[d]?.[t] ? B.blue : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{turnoNome[t]}</button>
                    ))}
                  </div>
                  <button onClick={() => toggleSimDiaInteiro(d)} style={{ height: 30, padding: "0 10px", borderRadius: 9, border: "1px solid #d1d5db", background: "white", color: "#6b7280", fontSize: 11, cursor: "pointer", fontFamily: "inherit", width: "fit-content" }}>Dia inteiro</button>
                </div>
              ))}
            </div>
            {!simPeriodos.length && <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626", fontWeight: 700 }}>Selecione pelo menos um dia/turno para simular.</div>}
          </div>
        </>}

        {/* Paciente mode */}
        {mode === "paciente" && <>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Selecione um paciente para completar as terapias autorizadas em laudo. A busca prioriza acréscimos nas extremidades e mostra remanejamentos simples quando precisa abrir o horário.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 280px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Paciente com gap</span>
              <select value={pacSel} onChange={e => { setPacSel(e.target.value); setPacEsp("") }} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 11px", fontSize: 13, fontFamily: "inherit" }}>
                <option value="">Selecionar paciente...</option>
                {pacsComGap.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {pacSel && gapsPaciente.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 220px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Especialidade autorizada pendente</span>
              <select value={pacEspAtiva} onChange={e => setPacEsp(e.target.value)} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 11px", fontSize: 13, fontFamily: "inherit" }}>
                {gapsPaciente.map(g => <option key={g.esp} value={g.esp}>{g.esp} | gap {g.gap} (aut {g.aut}, of {g.of})</option>)}
              </select>
            </div>}
          </div>
          {pacSel && <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {gapsPaciente.map(g => (
              <span key={g.esp} style={{ background: g.esp === pacEspAtiva ? B.blueLt : "#f8fafc", color: g.esp === pacEspAtiva ? B.blue : "#6b7280", border: `1px solid ${g.esp === pacEspAtiva ? B.blue + "44" : "#e5e7eb"}`, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>
                {g.esp}: faltam {g.gap}
              </span>
            ))}
          </div>}
        </>}
      </div>

      {/* PROF MODE results */}
      {mode === "prof" && fpProf && cRows.length > 0 && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { n: slotFilt.length, l: "slots livres", c: B.navy, tip: "Quantidade de horários livres da profissional após filtros, já ignorando profissionais bloqueadas temporariamente." },
            { n: slotFilt.filter(s => s.cands.some(c => c.rank === 0)).length, l: "adjacentes", c: B.lime, tip: "Slots em que existe paciente com gap e sessão clínica encostada no mesmo dia, unidade e turno." },
            { n: slotFilt.filter(s => s.cands.some(c => c.rank === 2)).length, l: "novo dia válido", c: B.blue, tip: "Horários livres que podem compor novo comparecimento com pelo menos mais uma sessão útil." },
            { n: slotFilt.filter(s => s.cands.length === 0).length, l: "sem candidato", c: "#f97316", tip: "Horários livres sem paciente elegível após regras de gap, turno, adjacência, conflito e reserva WA." },
          ].map(({ n, l, c, tip }) => (
            <div key={l} style={{ flex: "1 1 110px", background: "white", borderRadius: 12, border: `1px solid ${c}33`, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: c }}>{n}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{l}<InfoTip text={tip} /></div>
            </div>
          ))}
        </div>
        {diasDisp.filter(d => !fpDia || fpDia === d).map(dia => {
          const sD = slotFilt.filter(s => s.dia === dia); if (!sD.length) return null
          return (
            <div key={dia} style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <div style={{ padding: "11px 16px", background: "#f8fafc", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, color: B.navy, fontSize: 14 }}>{dia.replace("-feira", "")}</span>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{sD[0]?.unidade}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>{sD.length} slot(s) · {sD.filter(s => s.cands.length > 0).length} com candidato</span>
              </div>
              {sD.map((s, si) => (
                <div key={si} style={{ padding: "12px 16px", borderBottom: "1px solid #f9fafb", display: "flex", gap: 12, flexWrap: "wrap", background: s.cands.length > 0 ? "white" : "#fafafa" }}>
                  <div style={{ flexShrink: 0, width: 110 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: B.navy }}>{s.hora}</div>
                    <span style={{ background: "#e0f2fe", color: "#0369a1", borderRadius: 5, padding: "2px 6px", fontSize: 10, fontWeight: 600 }}>{s.esp}</span>
                    {s.cands.length === 0 && <div style={{ fontSize: 10, color: "#f97316", marginTop: 4, fontWeight: 600 }}>Sem candidatos</div>}
                  </div>
                  {s.cands.length > 0 ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                      {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unidade} terapia={s.terapia} profKey={fpProf} />)}
                    </div>
                  ) : <div style={{ flex: 1, display: "flex", alignItems: "center", color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>Nenhum paciente elegível neste dia/unidade/horário.</div>}
                </div>
              ))}
            </div>
          )
        })}
      </>}

      {/* SIM MODE results */}
      {mode === "sim" && cRows.length > 0 && simEspValida && simPeriodos.length > 0 && <>
        <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: 16 }}>
          <div style={{ fontWeight: 800, color: B.navy, fontSize: 13, marginBottom: 10 }}>Qual combinação aproveita melhor {simEsp}? <InfoTip text="O card recomendado pode variar a unidade por turno. Se Padre Miguel for escolhido em um turno, o sistema não mistura com outra unidade no outro turno do mesmo dia." /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setSimUnid("")} style={{ flex: "1 1 180px", padding: 12, borderRadius: 12, border: `2px solid ${!simUnid ? B.blue : "#e5e7eb"}`, background: !simUnid ? B.blueLt : "white", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>⭐ Recomendado inteligente</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: !simUnid ? B.blue : B.navy, marginTop: 2 }}>{planoStats.nPac}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>pacientes · ~{planoStats.sessTotal} sessões</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginTop: 4 }}>{planoRecomendado.map(p => `${p.dia.replace("-feira", "")} ${turnoNome[p.turno as "manha" | "tarde"] || p.turno}: ${p.unid}`).join(" · ")}</div>
            </button>
            {unitRank.map((u, i) => (
              <button key={u.unid} onClick={() => setSimUnid(simUnid === u.unid ? "" : u.unid)} style={{ flex: "1 1 130px", padding: 12, borderRadius: 12, border: `2px solid ${simUnid === u.unid ? B.blue : "#e5e7eb"}`, background: simUnid === u.unid ? B.blueLt : "white", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>{i === 0 ? "Unidade fixa forte" : u.unid}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: simUnid === u.unid ? B.blue : B.navy, marginTop: 2 }}>{u.nPac}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>pacientes · ~{u.sessTotal} sessões</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 2 }}>{u.unid}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", background: "#f8fafc", borderRadius: 8, padding: "7px 10px" }}>
            <strong>Pacientes</strong> = quem tem gap em {simEsp}, já frequenta a unidade no dia/turno avaliado e possui sessão adjacente sem conflito. <strong>Sessões</strong> = soma dos encaixes possíveis. <InfoTip text="A contagem de sessões pode ser maior que a de pacientes porque um mesmo paciente pode caber em mais de um horário." />
          </div>
        </div>
        <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", background: "#f8fafc", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, color: B.navy, fontSize: 14 }}>{simUnid ? `Unidade fixa: ${simUnid}` : "Plano recomendado inteligente"}</span>
            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>{simSlots.length} sessão(ões) com candidatos <InfoTip text="Cada bloco mostra dia, turno, unidade sugerida e horários com pacientes elegíveis." /></span>
          </div>
          {!simSlots.length ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Nenhuma sessão com candidatos nesta combinação.</div>
            : simSlots.map((s, si) => {
              const terapiaSim = (ESP_CLINICO[simEsp] || [simEsp]).filter(t => !EXCLUIR_OCUP.has(t))[0] || simEsp
              return (
                <div key={`${s.dia}-${s.turno}-${s.unid}-${s.hora}-${si}`} style={{ padding: "12px 16px", borderBottom: "1px solid #f9fafb", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flexShrink: 0, width: 150 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: B.blue, marginBottom: 2 }}>{s.dia.replace("-feira", "")} · {turnoNome[s.turno as "manha" | "tarde"] || s.turno}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: B.navy }}>{s.hora}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s.unid} · {s.cands.length} candidato(s)</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                    {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unid} terapia={terapiaSim} profKey={`sim:${s.dia}:${s.unid}`} />)}
                  </div>
                </div>
              )
            })}
        </div>
      </>}

      {/* PACIENTE MODE results */}
      {mode === "paciente" && pacSel && cRows.length > 0 && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { n: pacienteSlots.length, l: "opções encontradas", c: B.navy, tip: "Total de slots livres elegíveis para a especialidade escolhida." },
            { n: pacienteSlots.filter(s => s.rank === 0).length, l: "extremidades", c: B.lime, tip: "Acréscimos antes ou depois de sessões existentes do paciente no mesmo dia e unidade." },
            { n: pacienteSlots.filter(s => s.rank === 1).length, l: "remanejamentos", c: B.orange, tip: "Casos em que o paciente já tem outra terapia naquele horário e existe alternativa simples para mover a sessão atual." },
            { n: pacienteSlots.filter(s => s.rank === 2).length, l: "novo dia conjunto", c: B.blue, tip: "Novo dia aceito somente quando há outra sessão complementar autorizada para ofertar junto." },
          ].map(({ n, l, c, tip }) => (
            <div key={l} style={{ flex: "1 1 130px", background: "white", borderRadius: 12, border: `1px solid ${c}33`, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: c }}>{n}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{l}<InfoTip text={tip} /></div>
            </div>
          ))}
        </div>
        <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{ padding: "11px 16px", background: "#f8fafc", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, color: B.navy, fontSize: 14 }}>{pacEspAtiva || "Especialidade"}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{pacSel}</span>
            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>{pacienteSlots.length} sugestão(ões)</span>
          </div>
          {!pacienteSlots.length ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Nenhuma vaga elegível para este paciente/especialidade com as regras atuais.</div>
            : pacienteSlots.map((s, si) => (
              <div key={`${s.prof}-${s.dia}-${s.hora}-${si}`} style={{ padding: "12px 16px", borderBottom: "1px solid #f9fafb", display: "flex", gap: 12, flexWrap: "wrap", background: s.rank === 1 ? B.orangeLt : "white" }}>
                <div style={{ flexShrink: 0, width: 150 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: s.rank === 1 ? B.orange : s.rank === 2 ? B.blue : "#4a6e20", marginBottom: 2 }}>{s.tipo}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: B.navy }}>{s.hora}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s.dia.replace("-feira", "")} · {s.unidade}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{fmtName(s.prof)}</div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
                  {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unidade} terapia={s.terapia} profKey={s.prof} />)}
                </div>
              </div>
            ))}
        </div>
      </>}

      {!cRows.length && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "14px 16px", fontSize: 12, color: "#92400e" }}>
          Carregue o CSV da grade e o relatório de laudos para usar esta ferramenta.
        </div>
      )}

      {modalItem && (
        <PacPreencherModal
          pac={modalItem.pac}
          proposta={modalItem.proposta}
          cRows={cRows}
          waStatus={wstOf(modalItem.pac, modalItem.proposta.dia, modalItem.proposta.hora, modalItem.proposta.prof)}
          onStatus={status => { setWst(modalItem.pac, modalItem.proposta.dia, modalItem.proposta.hora, modalItem.proposta.prof, status); setModalItem(null) }}
          onClose={() => setModalItem(null)}
        />
      )}
    </div>
  )
}
