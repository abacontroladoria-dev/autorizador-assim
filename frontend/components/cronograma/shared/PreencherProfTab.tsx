"use client"

import { useCallback, useMemo, useState } from "react"
import { Info, Star, Target } from "lucide-react"
import {
  ABA_EXT, DIAS_LIST, DIAS_ORD, ESP_CLINICO, EXCLUIR_OCUP, FOCO_CAMILA_PROF,
  HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP, isProfBloqueadoTemp,
  reservaSlotKey, reservasAtivasFromWa, DIAS_UTIL, SK_PREENCHER,
} from "@/lib/cronograma/constants"
import {
  buildCronoUnitMeta, fm, fmtName, isLaudoComAlta, pm,
  shouldShowSessionUnit, turnoFromHora, turnoNome, unidadeBadgeText,
} from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { SegmentedTabs, type SegmentedTab } from "@/components/cronograma/ui/SegmentedTabs"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { Button } from "@/components/ui/button"
import { type Tone } from "@/components/cronograma/ui/tones"
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
const WA_S: Record<LocalWaStatus, { tone: Tone; l: string }> = {
  aguardando: { tone: "blue",  l: "Aguardando WA" },
  aceito:     { tone: "green", l: "Aceito" },
  recusado:   { tone: "red",   l: "Recusado" },
  inviavel:   { tone: "slate", l: "Inviável" },
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
    <span
      onMouseEnter={() => setV(true)}
      onMouseLeave={() => setV(false)}
      onClick={e => { e.stopPropagation(); setV(x => !x) }}
      className="relative ml-1 inline-flex shrink-0 cursor-help align-middle"
    >
      <span className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-full bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">
        <Info size={10} strokeWidth={2.5} />
      </span>
      {v && (
        <span className="absolute left-[18px] top-[-8px] z-[800] w-60 rounded-xl bg-slate-900 dark:bg-slate-800 px-2.5 py-2 text-[11px] leading-snug text-white shadow-2xl">
          {text}
        </span>
      )}
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

  const ws = waStatus as LocalWaStatus | null
  const wsS = ws && WA_S[ws] ? WA_S[ws] : null

  return (
    <ScheduleModal
      title={pac}
      maxWidth={960}
      onClose={onClose}
      subtitle={
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone="blue" variant="solid" dense>Convênio: {convenioPac || "—"}</StatusPill>
          <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
          <StatusPill tone="green" variant="solid" dense>
            Nova: {proposta.terapia} · {proposta.dia.replace("-feira", "")} {proposta.hora} · {proposta.unidade}
            {proposta.vCompSlots.length ? ` + ${proposta.vCompSlots.length} complementar(es)` : ""}
          </StatusPill>
          {wsS && <StatusPill tone={wsS.tone} variant="solid" dense>{wsS.l}</StatusPill>}
        </div>
      }
      footer={
        <>
          <div className="mr-auto text-[11px] text-muted-foreground">Cronograma atual + sessão proposta em verde.</div>
          {!ws && <Button variant="default" size="sm" onClick={() => onStatus("aguardando")}>Oferecer via WA</Button>}
          {ws === "aguardando" && <>
            <Button variant="outline" size="sm" onClick={() => onStatus(null)}>Desfazer envio</Button>
            <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onStatus("aceito")}>Aceito</Button>
            <Button variant="destructive" size="sm" onClick={() => onStatus("recusado")}>Recusado</Button>
            <Button variant="outline" size="sm" onClick={() => onStatus("inviavel")}>Inviável</Button>
          </>}
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Nova sessão proposta</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-muted" /> Existente</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-muted" /> Administrativo</span>
      </div>
      {!horasGrid.length ? (
        <div className="py-8 text-center text-muted-foreground">Nenhuma sessão encontrada.</div>
      ) : (
        <table className="w-full min-w-[400px] border-collapse">
          <thead><tr>
            <th className="w-[52px] pb-2 pr-2.5 text-right text-xs font-normal text-muted-foreground">Hora</th>
            {diasComSess.map(d => (
              <th key={d} className={`min-w-[130px] pb-2 text-center text-[13px] font-extrabold ${d === proposta.dia ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>
                <div>{d.replace("-feira", "")} {d === proposta.dia && <span className="ml-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 px-1 py-px text-[10px] text-emerald-700 dark:text-emerald-400">nova</span>}</div>
                <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {horasGrid.map(hora => (
              <tr key={hora} className="border-t border-border">
                <td className={`pr-2.5 pt-2 text-right align-top font-mono text-[15px] font-extrabold tabular-nums ${hora === proposta.hora ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>{hora}</td>
                {diasComSess.map(d => {
                  const cells = cMap[`${d}|||${hora}`] || []
                  return (
                    <td key={d} className="p-0.5 align-top">
                      {cells.map((c, ci) => {
                        const prop = c.tipo === "proposta"
                        return (
                          <div key={ci} className={`mb-0.5 flex min-h-[58px] flex-col gap-0.5 rounded-lg border px-2 py-1.5 ${prop ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-muted"}`}>
                            <div className="text-xs font-bold leading-tight text-foreground">{c.tP}</div>
                            <div className="text-[11px] text-muted-foreground">{fmtName(c.prof)}</div>
                            {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                              <div className="w-fit rounded-full bg-sky-50 dark:bg-sky-950/30 px-1.5 py-px text-[10px] font-extrabold text-sky-700 dark:text-sky-400">
                                {unidadeBadgeText(c.unidade)}
                              </div>
                            )}
                            {prop && <div className="mt-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Nova sessão</div>}
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
    </ScheduleModal>
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

// ─── Shared presentation bits ─────────────────────────────────────────────────

const SELECT_CLS = "rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"

function StatMini({ n, l, tone, tip }: { n: number; l: string; tone: Tone; tip: string }) {
  const TONE_TEXT: Record<Tone, string> = {
    green: "text-emerald-600 dark:text-emerald-400", amber: "text-amber-600 dark:text-amber-400",
    blue: "text-sky-600 dark:text-sky-400", purple: "text-violet-600 dark:text-violet-400",
    red: "text-rose-600 dark:text-rose-400", slate: "text-foreground",
  }
  const TONE_BORDER: Record<Tone, string> = {
    green: "border-emerald-200 dark:border-emerald-900", amber: "border-amber-200 dark:border-amber-900",
    blue: "border-sky-200 dark:border-sky-900", purple: "border-violet-200 dark:border-violet-900",
    red: "border-rose-200 dark:border-rose-900", slate: "border-border",
  }
  return (
    <div className={`flex-[1_1_110px] rounded-xl border bg-card p-3 text-center ${TONE_BORDER[tone]}`}>
      <div className={`text-2xl font-black tabular-nums ${TONE_TEXT[tone]}`}>{n}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{l}<InfoTip text={tip} /></div>
    </div>
  )
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

const MODE_TABS: SegmentedTab<"prof" | "sim" | "paciente">[] = [
  { value: "prof", label: "Profissional" },
  { value: "sim", label: "Simulação" },
  { value: "paciente", label: "Paciente" },
]

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
      <div className={`flex flex-wrap items-start gap-2 rounded-xl border p-2.5 ${ws ? "border-sky-300 dark:border-sky-800 bg-muted" : "border-border bg-card"}`}>
        <div className="flex-[1_1_160px]">
          <div className="text-xs font-bold text-foreground">{c.pac}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Aut: <strong>{c.aut}</strong> · Of: <strong>{c.of}</strong> · <span className="font-bold text-rose-600 dark:text-rose-400">Gap −{c.gap}</span></div>
          {c.tipo && (
            <div className={`mt-px flex items-center gap-1 text-[10px] font-bold ${c.rank === 0 ? "text-emerald-600 dark:text-emerald-400" : c.rank === 1 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
              <Target size={10} /> {c.tipo}
            </div>
          )}
          {c.sessD?.length > 0 && <div className="mt-px text-[10px] text-muted-foreground">Já neste dia: {c.sessD.join(", ")}</div>}
          {!c.sessD?.length && c.diasUn && <div className="mt-px text-[10px] text-muted-foreground">Frequenta a unidade em: {c.diasUn}</div>}
          {c.vComp && <div className="mt-px text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Oferecer junto: {c.vComp}</div>}
          {c.conflito && <div className="mt-px text-[10px] text-orange-600 dark:text-orange-400">Conflito: {c.conflito}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {wsS && <StatusPill tone={wsS.tone} variant="solid" dense>{wsS.l}</StatusPill>}
          <Button variant="outline" size="xs" onClick={() => setModalItem({ pac: c.pac, proposta })}>Ver</Button>
          {!ws && <Button variant="default" size="xs" onClick={() => setWst(c.pac, dia, hora, profKey, "aguardando")}>Oferecer via WA</Button>}
          {ws === "aguardando" && <>
            <Button variant="outline" size="xs" onClick={() => setWst(c.pac, dia, hora, profKey, null)}>Desfazer envio</Button>
            <Button variant="default" size="xs" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setWst(c.pac, dia, hora, profKey, "aceito")}>Aceito</Button>
            <Button variant="destructive" size="xs" onClick={() => setWst(c.pac, dia, hora, profKey, "recusado")}>Recusado</Button>
            <Button variant="outline" size="xs" onClick={() => setWst(c.pac, dia, hora, profKey, "inviavel")}>Inviável</Button>
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
    <div className="flex flex-col gap-3">

      {/* Mode / filters card */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-extrabold text-foreground">
            {mode === "sim" ? "Simulação de Novo Prestador" : mode === "paciente" ? "Aumentar Ocupação (Paciente)" : "Aumentar Ocupação (Profissional)"}
          </span>
          {!fixedMode && (
            <SegmentedTabs value={mode} onChange={setMode} tabs={MODE_TABS} ariaLabel="Modo" className="ml-auto" />
          )}
        </div>

        <div className="mb-2.5 flex items-start gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Info size={13} className="mt-px shrink-0" />
          Bloqueio temporário ativo: Djinane Ferreira Da Silva e Ana Carolina Mendes França não aparecem como vagas ofertáveis enquanto ainda constarem livres no CSV.
        </div>

        {/* Prof mode */}
        {mode === "prof" && <>
          <div className="mb-2.5 text-xs text-muted-foreground">Selecione a profissional para ver seus slots Livres e os candidatos elegíveis.</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-[1_1_240px] flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Profissional</span>
              <select value={fpProf} onChange={e => { setFpProf(e.target.value); setFpEsp(""); setFpDia("") }} className={SELECT_CLS}>
                <option value="">Selecionar…</option>
                {todosProfs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {fpProf && espsDisp.length > 0 && <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Especialidade</span>
              <select value={fpEsp} onChange={e => setFpEsp(e.target.value)} className={SELECT_CLS}>
                <option value="">Todas</option>{espsDisp.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>}
            {fpProf && diasDisp.length > 0 && <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Dia</span>
              <select value={fpDia} onChange={e => setFpDia(e.target.value)} className={SELECT_CLS}>
                <option value="">Todos</option>{diasDisp.map(d => <option key={d} value={d}>{d.replace("-feira", "")}</option>)}
              </select>
            </div>}
          </div>
          {fpProf === FOCO_CAMILA_PROF && (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <Target size={13} className="mt-px shrink-0" /> Foco Camila ativo: terça usa Padre Miguel; demais slots aparecem conforme a unidade do CSV.
            </div>
          )}
        </>}

        {/* Sim mode */}
        {mode === "sim" && <>
          <div className="mb-2.5 text-xs text-muted-foreground">
            Simule um novo profissional por terapia, dia e turno. A recomendação pode combinar unidades por turno quando isso aumenta ocupação, respeitando a restrição geográfica de Padre Miguel.
            <InfoTip text="A simulação considera pacientes com Autorizado > Ofertado, adjacência no mesmo dia/unidade, turno clínico compatível e ausência de conflito no horário." />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-[1_1_280px] flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Especialidade <InfoTip text="Digite parte do nome da terapia e escolha uma opção da lista." /></span>
              <input
                list="preencher-esp-options" value={simEsp}
                onChange={e => { setSimEsp(e.target.value); setSimUnid("") }}
                onBlur={() => { const match = espOptions.find(e => e.toLowerCase() === simEsp.trim().toLowerCase()); if (match) setSimEsp(match) }}
                placeholder="Digite para pesquisar e selecione da lista…"
                className={`rounded-lg border px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${simEspValida ? "border-border bg-card" : "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"}`}
              />
              <datalist id="preencher-esp-options">{espOptions.map(e => <option key={e} value={e} />)}</datalist>
              {!simEspValida && <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Selecione uma especialidade válida da lista.</span>}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-muted p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-foreground">Dias e turnos afetados <InfoTip text="Marque manhã, tarde ou dia inteiro. A recomendação avalia cada período separadamente." /></span>
              <Button variant="outline" size="xs" onClick={toggleSimTodos}>Todos</Button>
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {(DIAS_UTIL as readonly string[]).map(d => (
                <div key={d} className="flex min-h-[92px] flex-col gap-2">
                  <span className="text-xs font-extrabold text-foreground">{d.replace("-feira", "")}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["manha", "tarde"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleSimTurno(d, t)}
                        className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition-colors ${simDT?.[d]?.[t] ? "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {turnoNome[t]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSimDiaInteiro(d)}
                    className="h-[30px] w-fit rounded-lg border border-border bg-card px-2.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    Dia inteiro
                  </button>
                </div>
              ))}
            </div>
            {!simPeriodos.length && <div className="mt-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">Selecione pelo menos um dia/turno para simular.</div>}
          </div>
        </>}

        {/* Paciente mode */}
        {mode === "paciente" && <>
          <div className="mb-2.5 text-xs text-muted-foreground">Selecione um paciente para completar as terapias autorizadas em laudo. A busca prioriza acréscimos nas extremidades e mostra remanejamentos simples quando precisa abrir o horário.</div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-[1_1_280px] flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Paciente com gap</span>
              <select value={pacSel} onChange={e => { setPacSel(e.target.value); setPacEsp("") }} className={SELECT_CLS}>
                <option value="">Selecionar paciente…</option>
                {pacsComGap.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {pacSel && gapsPaciente.length > 0 && <div className="flex flex-[1_1_220px] flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground">Especialidade autorizada pendente</span>
              <select value={pacEspAtiva} onChange={e => setPacEsp(e.target.value)} className={SELECT_CLS}>
                {gapsPaciente.map(g => <option key={g.esp} value={g.esp}>{g.esp} | gap {g.gap} (aut {g.aut}, of {g.of})</option>)}
              </select>
            </div>}
          </div>
          {pacSel && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {gapsPaciente.map(g => (
                <StatusPill key={g.esp} tone={g.esp === pacEspAtiva ? "blue" : "slate"} variant={g.esp === pacEspAtiva ? "solid" : "soft"} dense>
                  {g.esp}: faltam {g.gap}
                </StatusPill>
              ))}
            </div>
          )}
        </>}
      </div>

      {/* PROF MODE results */}
      {mode === "prof" && fpProf && cRows.length > 0 && <>
        <div className="flex flex-wrap gap-2">
          <StatMini n={slotFilt.length} l="slots livres" tone="slate" tip="Quantidade de horários livres da profissional após filtros, já ignorando profissionais bloqueadas temporariamente." />
          <StatMini n={slotFilt.filter(s => s.cands.some(c => c.rank === 0)).length} l="adjacentes" tone="green" tip="Slots em que existe paciente com gap e sessão clínica encostada no mesmo dia, unidade e turno." />
          <StatMini n={slotFilt.filter(s => s.cands.some(c => c.rank === 2)).length} l="novo dia válido" tone="blue" tip="Horários livres que podem compor novo comparecimento com pelo menos mais uma sessão útil." />
          <StatMini n={slotFilt.filter(s => s.cands.length === 0).length} l="sem candidato" tone="amber" tip="Horários livres sem paciente elegível após regras de gap, turno, adjacência, conflito e reserva WA." />
        </div>
        {diasDisp.filter(d => !fpDia || fpDia === d).map(dia => {
          const sD = slotFilt.filter(s => s.dia === dia); if (!sD.length) return null
          return (
            <div key={dia} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
                <span className="text-sm font-extrabold text-foreground">{dia.replace("-feira", "")}</span>
                <span className="text-[11px] text-muted-foreground">{sD[0]?.unidade}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{sD.length} slot(s) · {sD.filter(s => s.cands.length > 0).length} com candidato</span>
              </div>
              {sD.map((s, si) => (
                <div key={si} className={`flex flex-wrap gap-3 border-b border-border px-4 py-3 ${s.cands.length > 0 ? "bg-card" : "bg-muted/40"}`}>
                  <div className="w-[110px] shrink-0">
                    <div className="font-mono text-lg font-black text-foreground">{s.hora}</div>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">{s.esp}</span>
                    {s.cands.length === 0 && <div className="mt-1 text-[10px] font-semibold text-orange-600 dark:text-orange-400">Sem candidatos</div>}
                  </div>
                  {s.cands.length > 0 ? (
                    <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                      {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unidade} terapia={s.terapia} profKey={fpProf} />)}
                    </div>
                  ) : <div className="flex flex-1 items-center text-xs italic text-muted-foreground">Nenhum paciente elegível neste dia/unidade/horário.</div>}
                </div>
              ))}
            </div>
          )
        })}
      </>}

      {/* SIM MODE results */}
      {mode === "sim" && cRows.length > 0 && simEspValida && simPeriodos.length > 0 && <>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2.5 text-[13px] font-extrabold text-foreground">
            Qual combinação aproveita melhor {simEsp}? <InfoTip text="O card recomendado pode variar a unidade por turno. Se Padre Miguel for escolhido em um turno, o sistema não mistura com outra unidade no outro turno do mesmo dia." />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSimUnid("")}
              className={`flex-[1_1_180px] rounded-xl border-2 p-3 text-center transition-colors ${!simUnid ? "border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30" : "border-border bg-card hover:bg-muted/40"}`}
            >
              <div className="flex items-center justify-center gap-1 text-[11px] font-extrabold text-muted-foreground"><Star size={11} /> Recomendado inteligente</div>
              <div className={`mt-0.5 text-2xl font-black ${!simUnid ? "text-sky-700 dark:text-sky-400" : "text-foreground"}`}>{planoStats.nPac}</div>
              <div className="text-[10px] text-muted-foreground">pacientes · ~{planoStats.sessTotal} sessões</div>
              <div className="mt-1 text-[11px] font-bold text-foreground">{planoRecomendado.map(p => `${p.dia.replace("-feira", "")} ${turnoNome[p.turno as "manha" | "tarde"] || p.turno}: ${p.unid}`).join(" · ")}</div>
            </button>
            {unitRank.map((u, i) => (
              <button
                key={u.unid}
                type="button"
                onClick={() => setSimUnid(simUnid === u.unid ? "" : u.unid)}
                className={`flex-[1_1_130px] rounded-xl border-2 p-3 text-center transition-colors ${simUnid === u.unid ? "border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30" : "border-border bg-card hover:bg-muted/40"}`}
              >
                <div className="text-[11px] font-bold text-muted-foreground">{i === 0 ? "Unidade fixa forte" : u.unid}</div>
                <div className={`mt-0.5 text-2xl font-black ${simUnid === u.unid ? "text-sky-700 dark:text-sky-400" : "text-foreground"}`}>{u.nPac}</div>
                <div className="text-[10px] text-muted-foreground">pacientes · ~{u.sessTotal} sessões</div>
                <div className="mt-0.5 text-[13px] font-bold text-foreground">{u.unid}</div>
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <strong>Pacientes</strong> = quem tem gap em {simEsp}, já frequenta a unidade no dia/turno avaliado e possui sessão adjacente sem conflito. <strong>Sessões</strong> = soma dos encaixes possíveis.
            <InfoTip text="A contagem de sessões pode ser maior que a de pacientes porque um mesmo paciente pode caber em mais de um horário." />
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
            <span className="text-sm font-extrabold text-foreground">{simUnid ? `Unidade fixa: ${simUnid}` : "Plano recomendado inteligente"}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{simSlots.length} sessão(ões) com candidatos <InfoTip text="Cada bloco mostra dia, turno, unidade sugerida e horários com pacientes elegíveis." /></span>
          </div>
          {!simSlots.length ? <div className="p-6 text-center text-[13px] text-muted-foreground">Nenhuma sessão com candidatos nesta combinação.</div>
            : simSlots.map((s, si) => {
              const terapiaSim = (ESP_CLINICO[simEsp] || [simEsp]).filter(t => !EXCLUIR_OCUP.has(t))[0] || simEsp
              return (
                <div key={`${s.dia}-${s.turno}-${s.unid}-${s.hora}-${si}`} className="flex flex-wrap gap-3 border-b border-border px-4 py-3">
                  <div className="w-[150px] shrink-0">
                    <div className="mb-0.5 text-[11px] font-extrabold text-sky-700 dark:text-sky-400">{s.dia.replace("-feira", "")} · {turnoNome[s.turno as "manha" | "tarde"] || s.turno}</div>
                    <div className="font-mono text-lg font-black text-foreground">{s.hora}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{s.unid} · {s.cands.length} candidato(s)</div>
                  </div>
                  <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                    {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unid} terapia={terapiaSim} profKey={`sim:${s.dia}:${s.unid}`} />)}
                  </div>
                </div>
              )
            })}
        </div>
      </>}

      {/* PACIENTE MODE results */}
      {mode === "paciente" && pacSel && cRows.length > 0 && <>
        <div className="flex flex-wrap gap-2">
          <StatMini n={pacienteSlots.length} l="opções encontradas" tone="slate" tip="Total de slots livres elegíveis para a especialidade escolhida." />
          <StatMini n={pacienteSlots.filter(s => s.rank === 0).length} l="extremidades" tone="green" tip="Acréscimos antes ou depois de sessões existentes do paciente no mesmo dia e unidade." />
          <StatMini n={pacienteSlots.filter(s => s.rank === 1).length} l="remanejamentos" tone="amber" tip="Casos em que o paciente já tem outra terapia naquele horário e existe alternativa simples para mover a sessão atual." />
          <StatMini n={pacienteSlots.filter(s => s.rank === 2).length} l="novo dia conjunto" tone="blue" tip="Novo dia aceito somente quando há outra sessão complementar autorizada para ofertar junto." />
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
            <span className="text-sm font-extrabold text-foreground">{pacEspAtiva || "Especialidade"}</span>
            <span className="text-[11px] text-muted-foreground">{pacSel}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{pacienteSlots.length} sugestão(ões)</span>
          </div>
          {!pacienteSlots.length ? <div className="p-6 text-center text-[13px] text-muted-foreground">Nenhuma vaga elegível para este paciente/especialidade com as regras atuais.</div>
            : pacienteSlots.map((s, si) => (
              <div key={`${s.prof}-${s.dia}-${s.hora}-${si}`} className={`flex flex-wrap gap-3 border-b border-border px-4 py-3 ${s.rank === 1 ? "bg-orange-50/50 dark:bg-orange-950/20" : "bg-card"}`}>
                <div className="w-[150px] shrink-0">
                  <div className={`mb-0.5 text-[11px] font-extrabold ${s.rank === 1 ? "text-orange-600 dark:text-orange-400" : s.rank === 2 ? "text-sky-600 dark:text-sky-400" : "text-emerald-600 dark:text-emerald-400"}`}>{s.tipo}</div>
                  <div className="font-mono text-lg font-black text-foreground">{s.hora}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{s.dia.replace("-feira", "")} · {s.unidade}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{fmtName(s.prof)}</div>
                </div>
                <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                  {s.cands.map((c, ci) => <CandCard key={ci} c={c} dia={s.dia} hora={s.hora} unidade={s.unidade} terapia={s.terapia} profKey={s.prof} />)}
                </div>
              </div>
            ))}
        </div>
      </>}

      {!cRows.length && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 px-4 py-3.5 text-xs text-orange-800 dark:text-orange-300">
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
