"use client"

import { type CSSProperties, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import {
  ABA_EXIB_PSICO_NAMES, B, DIAS_LIST, DIAS_ORD, EXCLUIR_OCUP, EXIB_NOME,
  HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP, isProfBloqueadoTemp,
} from "@/lib/cronograma/constants"
import {
  buildCronoUnitMeta, fm, fmtName, isLaudoComAlta, pm,
  shouldShowSessionUnit, unidadeBadgeText,
} from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import type { CsvRow, LaudoRow, CfgState } from "@/types/cronograma"

// ─── Types ────────────────────────────────────────────────────────────────────

type Estrategia = "S1" | "S2" | "S3"
type Status     = "acompanhamento" | "inviavel"

interface VComp { tP: string; prof: string; hora: string }
interface ProfAlt { tP: string; prof: string; unidade: string }

interface Sugestao {
  id: string
  esp: string
  tP: string
  dia: string; hora: string; prof: string; unidade: string
  tipo: "adjacente" | "dia-novo"
  vComp: VComp[]
  vCompAlts: Record<string, VComp[]>
  profAlts: ProfAlt[]
}

interface GapInfo { esp: string; aut: number; of: number; dif: number }

interface AceiteSessao {
  dia: string; hora: string; tP: string; prof: string; unidade: string
}

interface AceitePacBundle {
  id: string; pac: string; ts: number; origem: "ocp-paciente"
  sessoes: AceiteSessao[]
  status: "pendente" | "confirmado" | "recusado"
  inviavelSlots: string[]
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

const ESTRATEGIA_META: Record<Estrategia, {
  label: string; short: string; desc: string
  bg: string; c: string; border: string; disponivel: boolean
}> = {
  S1: {
    label: "Acrescentar sessões",
    short: "S1",
    desc: "Adiciona sessões em vagas adjacentes à agenda do paciente. Qualquer profissional disponível. Não remaeja sessões existentes.",
    bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd", disponivel: true,
  },
  S2: {
    label: "Remanejamento — mesmo profissional",
    short: "S2",
    desc: "Move sessões existentes para liberar horários de maior déficit. Mantém o mesmo profissional na sessão remanejada.",
    bg: "#ecfdf5", c: "#059669", border: "#6ee7b7", disponivel: false,
  },
  S3: {
    label: "Remanejamento — outro profissional",
    short: "S3",
    desc: "Move sessões existentes podendo atribuir a outro profissional. Alto índice de recusa — use apenas se necessário.",
    bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff", disponivel: false,
  },
}

const STATUS_META: Record<Status, { label: string; bg: string; c: string }> = {
  acompanhamento: { label: "Em Acompanhamento", bg: B.blueLt,  c: B.blue    },
  inviavel:       { label: "Inviável",           bg: "var(--muted)", c: "var(--muted-foreground)" },
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ABA_EXT_NAMES = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa"])
const EXCLUIR_GAPS  = new Set([
  "Coordenador de Caso", "Supervisão ABA",
  "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa",
])
const SK         = "aba_ocup_pac_status_v1"
const SK_ACEITES = "aba_ocup_pac_aceites_v1"
const DIAS_UTIL  = DIAS_LIST.slice(0, 5)
const DIA_ABR: Record<string, string> = {
  "Segunda-feira": "Seg", "Terça-feira": "Ter", "Quarta-feira": "Qua",
  "Quinta-feira":  "Qui", "Sexta-feira":  "Sex",
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

function countSlots(rows: CsvRow[]): number {
  const s = new Set<string>()
  for (const r of rows) s.add(`${r["Dia da Semana"]}|||${hiStr(r)}`)
  return s.size
}

// Pedido 1: encontra slot livre mais próximo para deslocar a Supervisão ABA
function findSupervTarget(dia: string, hora: string, prof: string, cRows: CsvRow[]): string | null {
  const myHMin = pm(hora) ?? 0
  let best: { dist: number; hora: string } | null = null
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Livre") continue
    if (r["Dia da Semana"] !== dia) continue
    if (r.Terapia !== "Supervisão ABA") continue
    if (r.Profissional !== prof) continue
    const h = pm(hiStr(r)) ?? hiMin(r)
    const canonical = fm(h)
    if (!canonical) continue
    const dist = Math.abs(h - myHMin)
    if (!best || dist < best.dist) best = { dist, hora: canonical }
  }
  return best?.hora ?? null
}

// ─── buildSugestoes ───────────────────────────────────────────────────────────

function buildSugestoes(
  pac: string,
  agend: CsvRow[],
  agendClin: CsvRow[],
  cRows: CsvRow[],
  gapMap: Record<string, { dif: number; aut: number; of: number }>,
): Sugestao[] {
  const pacClinRows = agendClin.filter(r => r["Nome Favorecido"] === pac)
  const clinPuras   = pacClinRows.filter(r => !ABA_EXT_NAMES.has(r.Terapia))

  let manhaCt = 0, tardeCt = 0
  for (const r of clinPuras) {
    const h = pm(hiStr(r)) ?? hiMin(r)
    if (!h && h !== 0) continue
    if (h < 720) manhaCt++; else tardeCt++
  }
  const clinTurno: "manhã" | "tarde" | null =
    manhaCt + tardeCt === 0 ? null : manhaCt >= tardeCt ? "manhã" : "tarde"

  function hMin(r: CsvRow): number { return pm(hiStr(r)) ?? hiMin(r) }

  function isTurnoOk(hMinVal: number): boolean {
    if (clinTurno === null) return true
    return clinTurno === "manhã" ? hMinVal < 720 : hMinVal >= 720
  }

  const dayHours: Record<string, Set<string>> = {}
  for (const r of clinPuras) {
    const d = r["Dia da Semana"]
    const h = hMin(r)
    if (!h && h !== 0) continue
    const canonical = fm(h)
    if (!canonical) continue
    if (!dayHours[d]) dayHours[d] = new Set()
    dayHours[d].add(canonical)
  }

  const pacUnidades = new Set(pacClinRows.map(r => rowUnid(r)))

  const pacGaps = Object.entries(gapMap)
    .filter(([k]) => k.startsWith(`${pac}|||`))
    .map(([k, v]) => ({ esp: k.split("|||")[1], ...v }))
    .filter(v => v.dif > 0)
    .sort((a, b) => b.dif - a.dif)

  if (pacGaps.length === 0) return []

  const espDif: Record<string, number> = {}
  for (const g of pacGaps) espDif[g.esp] = g.dif

  const seenFree = new Set<string>()
  const allFreeRows: Array<CsvRow & { _hMin: number; _hora: string }> = []
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Livre") continue
    if (isProfBloqueadoTemp(r.Profissional)) continue
    if (EXCLUIR_OCUP.has(r.Terapia)) continue
    const esp = TERAPIA_TO_ESP[r.Terapia]
    if (!esp || !espDif[esp]) continue
    if (pacUnidades.size > 0 && !pacUnidades.has(rowUnid(r))) continue
    const h = hMin(r)
    if (!isTurnoOk(h)) continue
    const canonical = fm(h)
    if (!canonical) continue
    const dk = `${r["Dia da Semana"]}|||${h}|||${r.Terapia}|||${r.Profissional}`
    if (seenFree.has(dk)) continue
    seenFree.add(dk)
    allFreeRows.push({ ...r, _hMin: h, _hora: canonical })
  }

  const slotMap: Record<string, typeof allFreeRows> = {}
  for (const r of allFreeRows) {
    const k = `${r["Dia da Semana"]}|||${r._hMin}`
    if (!slotMap[k]) slotMap[k] = []
    slotMap[k].push(r)
  }

  const sugestoes: Sugestao[] = []

  for (const [slotKey, slotRows] of Object.entries(slotMap)) {
    const parts = slotKey.split("|||")
    const dia  = parts[0]
    const hora = slotRows[0]._hora

    if (dayHours[dia]?.has(hora)) continue

    const byEspRows: Record<string, typeof allFreeRows> = {}
    const seenProf = new Set<string>()
    for (const r of slotRows) {
      const esp = TERAPIA_TO_ESP[r.Terapia]!
      const pk = `${esp}|||${r.Profissional}`
      if (seenProf.has(pk)) continue
      seenProf.add(pk)
      if (!byEspRows[esp]) byEspRows[esp] = []
      byEspRows[esp].push(r)
    }

    let bestEsp: string | null = null
    let bestDif = -1
    for (const esp of Object.keys(byEspRows)) {
      if ((espDif[esp] ?? 0) > bestDif) { bestDif = espDif[esp]; bestEsp = esp }
    }
    if (!bestEsp) continue

    const espRows = byEspRows[bestEsp]
    const [primaryRow, ...altRows] = espRows
    const profAlts: ProfAlt[] = altRows.map(r => ({ tP: r.Terapia, prof: r.Profissional, unidade: rowUnid(r) }))

    const prof = primaryRow.Profissional
    const unid = rowUnid(primaryRow)
    const id   = `${dia}|||${hora}|||${bestEsp}`

    const hoursOnDay = dayHours[dia]
    const hasDay = !!hoursOnDay && hoursOnDay.size > 0
    const adjs   = adjHs(hora)
    const isAdj  = hasDay && adjs.some(a => hoursOnDay!.has(a))

    if (hasDay && isAdj) {
      sugestoes.push({
        id, esp: bestEsp, tP: primaryRow.Terapia,
        dia, hora, prof, unidade: unid,
        tipo: "adjacente", vComp: [], vCompAlts: {},
        profAlts,
      })
    } else if (!hasDay) {
      const seenComp = new Set<string>()
      const compRows: Array<{ tP: string; prof: string; hora: string }> = []
      for (const r of cRows) {
        if (r["Status do Agendamento"] !== "Livre") continue
        if (isProfBloqueadoTemp(r.Profissional)) continue
        if (r["Dia da Semana"] !== dia) continue
        if (rowUnid(r) !== unid) continue
        if (EXCLUIR_OCUP.has(r.Terapia)) continue
        const compEsp = TERAPIA_TO_ESP[r.Terapia]
        if (!compEsp || !espDif[compEsp]) continue
        const ch = hMin(r)
        if (!isTurnoOk(ch)) continue
        const cHora = fm(ch)
        if (!adjs.includes(cHora)) continue
        const ck = `${r.Terapia}|||${r.Profissional}|||${cHora}`
        if (seenComp.has(ck)) continue
        seenComp.add(ck)
        compRows.push({ tP: r.Terapia, prof: r.Profissional, hora: cHora })
      }

      if (compRows.length > 0) {
        const byHora: Record<string, VComp[]> = {}
        for (const c of compRows) {
          if (!byHora[c.hora]) byHora[c.hora] = []
          byHora[c.hora].push(c)
        }
        sugestoes.push({
          id, esp: bestEsp, tP: primaryRow.Terapia,
          dia, hora, prof, unidade: unid,
          tipo: "dia-novo",
          vComp: Object.values(byHora).map(g => g[0]),
          vCompAlts: byHora,
          profAlts,
        })
      }
    }
  }

  sugestoes.sort((a, b) =>
    (a.tipo === "adjacente" ? 0 : 1) - (b.tipo === "adjacente" ? 0 : 1) ||
    ((DIAS_ORD[a.dia] ?? 9) - (DIAS_ORD[b.dia] ?? 9)) ||
    ((pm(a.hora) || 0) - (pm(b.hora) || 0))
  )
  const slotFinal = new Set<string>()
  const slotFiltered = sugestoes.filter(s => {
    const k = `${s.dia}|||${s.hora}`
    if (slotFinal.has(k)) return false
    slotFinal.add(k)
    return true
  })

  // R5.1 para dia-novo: múltiplos pares independentes no mesmo dia criam buraco.
  // Mantém apenas a sugestão de maior gap por dia novo — um bloco contíguo por dia.
  const diaNovoByDay: Record<string, Sugestao> = {}
  const finalResult: Sugestao[] = []
  for (const s of slotFiltered) {
    if (s.tipo !== "dia-novo") { finalResult.push(s); continue }
    const existing = diaNovoByDay[s.dia]
    if (!existing || (espDif[s.esp] ?? 0) > (espDif[existing.esp] ?? 0)) {
      diaNovoByDay[s.dia] = s
    }
  }
  return [...finalResult, ...Object.values(diaNovoByDay)]
}

// ─── TodasSugestoesModal ──────────────────────────────────────────────────────

interface TodasSugestoesModalProps {
  pac: string; cRows: CsvRow[]; sugestoes: Sugestao[]; pacGaps: GapInfo[]
  stOf: (s: Sugestao) => Status | null
  setSt: (s: Sugestao, st: Status | null) => void
  onClose: () => void
  estrategia: Estrategia; setEstrategia: (e: Estrategia) => void
  onAceitar: (bundle: { sessoes: AceiteSessao[] }) => void
}

function TodasSugestoesModal({
  pac, cRows, sugestoes, pacGaps, stOf, setSt, onClose,
  estrategia, setEstrategia, onAceitar,
}: TodasSugestoesModalProps) {
  const [selIdx, setSelIdx]       = useState<Record<string, Record<string, number>>>({})
  const [profSelIdx, setProfSelIdx] = useState<Record<string, number>>({})
  // Pedido 4: checkboxes para seleção em lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function getActiveEntry(s: Sugestao): { tP: string; prof: string; unidade: string } {
    const idx = profSelIdx[s.id] ?? 0
    if (idx === 0 || !s.profAlts[idx - 1]) return { tP: s.tP, prof: s.prof, unidade: s.unidade }
    return s.profAlts[idx - 1]
  }

  function getActiveVComps(s: Sugestao): VComp[] {
    return s.vComp.map(v => {
      const alts = s.vCompAlts[v.hora] || [v]
      return alts[selIdx[s.id]?.[v.hora] ?? 0] ?? v
    })
  }

  // Pedido 4: montar o bundle com as sessões da seleção atual
  function handleAceitar() {
    const toAccept = sugestoes.filter(s => selectedIds.has(s.id) && stOf(s) !== "inviavel")
    if (!toAccept.length) return
    const sessoes: AceiteSessao[] = []
    for (const s of toAccept) {
      const ae = getActiveEntry(s)
      sessoes.push({ dia: s.dia, hora: s.hora, tP: ae.tP, prof: ae.prof, unidade: ae.unidade })
      for (const vc of getActiveVComps(s)) {
        sessoes.push({ dia: s.dia, hora: vc.hora, tP: vc.tP, prof: vc.prof, unidade: ae.unidade })
      }
    }
    onAceitar({ sessoes })
    setSelectedIds(new Set())
  }

  const sessPac = useMemo(() => {
    const seen = new Set<string>()
    const res: { dia: string; hora: string; tP: string; tE?: string; prof: string; unidade: string; tipo: "exist" | "admin" }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac || ABA_EXT_NAMES.has(r.Terapia)) continue
      const hm = pm(hiStr(r)) ?? Number(r.HI || 0)
      const hora = fm(hm) || hiStr(r)
      const k = `${r["Dia da Semana"]}|||${hm}|||${r.Terapia}|||${r.Profissional}`
      if (seen.has(k)) continue; seen.add(k)
      res.push({
        dia: r["Dia da Semana"], hora,
        tP: r.Terapia, tE: tExib(r.Terapia),
        prof: r.Profissional, unidade: rowUnid(r),
        tipo: EXCLUIR_OCUP.has(r.Terapia) ? "admin" : "exist",
      })
    }
    return res
  }, [pac, cRows])

  type CellInfo = {
    tP: string; tE?: string; prof: string
    tipo: "proposta" | "aceito" | "admin" | "exist" | "supervDesloc"
    unidade: string; target?: string
  }

  const cMap: Record<string, CellInfo[]> = {}
  for (const s of sessPac) {
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    if (!cMap[k].some(x => x.tP === s.tP && x.prof === s.prof)) {
      cMap[k].push({ tP: s.tP, tE: s.tE, prof: s.prof, tipo: s.tipo, unidade: s.unidade })
    }
  }

  // Passo 1: registrar todos os slots principais — garantia de prioridade
  const mainSlots = new Set<string>()
  for (const s of sugestoes) {
    if (stOf(s) === "inviavel") continue
    mainSlots.add(`${s.dia}|||${s.hora}`)
  }

  // Passo 2: adicionar entradas principais ao cMap
  for (const s of sugestoes) {
    const st = stOf(s)
    if (st === "inviavel") continue
    const tipo: CellInfo["tipo"] = st === "acompanhamento" ? "aceito" : "proposta"
    const ae = getActiveEntry(s)
    const kP = `${s.dia}|||${s.hora}`
    if (!cMap[kP]) cMap[kP] = []
    if (!cMap[kP].some(x => x.tP === ae.tP && x.prof === ae.prof && x.tipo === tipo)) {
      cMap[kP].push({ tP: ae.tP, tE: tExib(ae.tP), prof: ae.prof, tipo, unidade: ae.unidade })
    }
  }

  // Passo 3: vComps só vão para slots sem proposta principal (e sem outro vComp)
  const seenSlot = new Set<string>(mainSlots)
  for (const s of sugestoes) {
    const st = stOf(s)
    if (st === "inviavel") continue
    const tipo: CellInfo["tipo"] = st === "acompanhamento" ? "aceito" : "proposta"
    const activeVComps = getActiveVComps(s)
    for (const vc of activeVComps) {
      const kC = `${s.dia}|||${vc.hora}`
      if (seenSlot.has(kC)) continue
      seenSlot.add(kC)
      if (!cMap[kC]) cMap[kC] = []
      if (!cMap[kC].some(x => x.tP === vc.tP && x.prof === vc.prof)) {
        cMap[kC].push({ tP: vc.tP, tE: tExib(vc.tP), prof: vc.prof, tipo, unidade: s.unidade })
      }
    }
  }

  // Pedido 1: detectar Supervisão ABA deslocável e pintar de preto
  for (const [k, cells] of Object.entries(cMap)) {
    const hasProposal = cells.some(c => c.tipo === "proposta" || c.tipo === "aceito")
    if (!hasProposal) continue
    const supervIdx = cells.findIndex(c => c.tipo === "admin" && c.tP === "Supervisão ABA")
    if (supervIdx === -1) continue
    const sv = cells[supervIdx]
    const kParts = k.split("|||")
    const target = findSupervTarget(kParts[0], kParts[1], sv.prof, cRows)
    cells[supervIdx] = { ...sv, tipo: "supervDesloc", target: target ?? undefined }
  }

  const dias   = [...DIAS_UTIL].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const horas  = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))
  const unitMeta = buildCronoUnitMeta(dias, cMap)

  const cSt = (tipo: string) => {
    if (tipo === "supervDesloc") return { bg: "var(--card-foreground)", bd: "var(--card-foreground)",  label: "↔ mover" }
    if (tipo === "aceito")       return { bg: B.blueLt,  bd: B.blue,    label: "Aceito"   }
    if (tipo === "proposta")     return { bg: B.limeLt,  bd: B.lime,    label: "Proposta" }
    if (tipo === "admin")        return { bg: "var(--muted)", bd: "var(--border)", label: null }
    return                              { bg: "var(--muted)", bd: "var(--border)", label: null }
  }

  const byEsp: Record<string, Sugestao[]> = {}
  for (const s of sugestoes) {
    if (!byEsp[s.esp]) byEsp[s.esp] = []
    byEsp[s.esp].push(s)
  }

  const TIPO_META = {
    adjacente:  { label: "Adjacente", bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
    "dia-novo": { label: "Dia novo",  bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  }

  const selectedCount = [...selectedIds].filter(id => {
    const s = sugestoes.find(x => x.id === id)
    return s && stOf(s) !== "inviavel"
  }).length

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", padding: "12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 24px 80px rgba(0,0,0,.22)", width: "96vw", maxWidth: "1160px", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--card)", borderRadius: "18px 18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "15px", color: B.navy }}>{fmtName(pac)}</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px" }}>
              Agenda completa · {sugestoes.length} proposta{sugestoes.length !== 1 ? "s" : ""} disponíve{sugestoes.length !== 1 ? "is" : "l"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
            <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "var(--muted)", cursor: "pointer", fontSize: "16px", color: "var(--muted-foreground)" }}>×</button>
          </div>
        </div>

        {/* Seletor de estratégia */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginRight: "4px" }}>Estratégia:</span>
          {(["S1", "S2", "S3"] as Estrategia[]).map(s => {
            const m = ESTRATEGIA_META[s]
            const isActive = estrategia === s
            return (
              <button key={s}
                onClick={() => m.disponivel && setEstrategia(s)}
                disabled={!m.disponivel}
                title={m.desc}
                style={{
                  padding: "4px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                  cursor: m.disponivel ? "pointer" : "not-allowed", fontFamily: "inherit",
                  border: `1px solid ${isActive ? m.border : "var(--border)"}`,
                  background: isActive ? m.bg : "var(--muted)",
                  color: isActive ? m.c : "var(--muted-foreground)",
                  opacity: m.disponivel ? 1 : 0.5,
                  display: "flex", alignItems: "center", gap: "5px",
                }}>
                <span style={{ padding: "1px 5px", borderRadius: "4px", fontSize: "10px", fontWeight: 800, background: isActive ? m.c : "var(--border)", color: isActive ? "white" : "var(--muted-foreground)" }}>{m.short}</span>
                {m.label}
                {!m.disponivel && <span style={{ fontSize: "9px", background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "3px", padding: "0 4px" }}>Em breve</span>}
              </button>
            )
          })}
        </div>

        {/* Corpo: lado a lado */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* ── Esquerda: propostas ──────────────────────────────────────── */}
          <div style={{ width: "480px", flexShrink: 0, borderRight: "2px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0 }}>

            {/* Legenda */}
            <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: "10px", fontSize: "10px", color: "var(--muted-foreground)", flexWrap: "wrap", flexShrink: 0 }}>
              {[
                { bg: "var(--muted)", bd: "var(--border)", label: "Existente" },
                { bg: "var(--muted)", bd: "var(--border)", label: "Adm." },
                { bg: B.limeLt,  bd: B.lime,    label: "Proposta" },
                { bg: "var(--card-foreground)", bd: "var(--card-foreground)",  label: "Superv. deslocável" },
              ].map(({ bg, bd, label }) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                  <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "2px", background: bg, border: `1px solid ${bd}` }} />
                  {label}
                </span>
              ))}
            </div>

            {/* Lista scrollável */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
              {sugestoes.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "20px", fontSize: "12px" }}>Nenhuma proposta gerada para esta estratégia.</div>
              ) : Object.entries(byEsp).map(([esp, sugs]) => {
                const gap = pacGaps.find(g => g.esp === esp)
                return (
                  <div key={esp} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                      <span style={{ fontWeight: 800, fontSize: "12px", color: B.navy }}>{esp}</span>
                      {gap && <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }}>−{gap.dif} ({gap.of}/{gap.aut})</span>}
                    </div>
                    {/* Pedido 2: grade 2-colunas com altura uniforme */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", alignItems: "start" }}>
                      {sugs.map(s => {
                        const st       = stOf(s)
                        const stM      = st ? STATUS_META[st] : null
                        const tm       = TIPO_META[s.tipo]
                        const ae       = getActiveEntry(s)
                        const allProfs = [{ tP: s.tP, prof: s.prof, unidade: s.unidade }, ...s.profAlts]
                        const isInv    = st === "inviavel"
                        const isChk    = selectedIds.has(s.id) && !isInv
                        return (
                          <div key={s.id} style={{
                            border: `1px solid ${isChk ? B.blue + "77" : isInv ? "var(--border)" : "var(--border)"}`,
                            borderRadius: "10px", padding: "8px 9px",
                            background: isChk ? "var(--muted)" : isInv ? "var(--card)" : "var(--card)",
                            opacity: isInv ? 0.55 : 1,
                            display: "flex", flexDirection: "column", gap: "3px",
                          }}>
                            {/* Header: badges + checkbox */}
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "3px" }}>
                              <div style={{ flex: 1, display: "flex", gap: "3px", flexWrap: "wrap" }}>
                                <span style={{ padding: "1px 4px", borderRadius: "4px", fontSize: "9px", fontWeight: 800, background: tm.bg, color: tm.c, border: `1px solid ${tm.border}` }}>{tm.label}</span>
                                {stM && <span style={{ padding: "1px 4px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, background: stM.bg, color: stM.c }}>{stM.label}</span>}
                              </div>
                              {!isInv && (
                                <input type="checkbox" checked={isChk} onChange={() => toggleSelected(s.id)}
                                  style={{ cursor: "pointer", accentColor: B.navy, flexShrink: 0, marginTop: "1px" }} />
                              )}
                            </div>
                            {/* Dia/hora */}
                            <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "11px", color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</div>
                            {/* Terapia */}
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--card-foreground)" }}>{ae.tP}</div>
                            <div style={{ fontSize: "9px", color: "var(--muted-foreground)" }}>{fmtName(ae.prof)}</div>
                            {/* Seletor de profissional — exclusivo (Pedido 3) */}
                            {allProfs.length > 1 && (
                              <div style={{ display: "flex", alignItems: "center", gap: "2px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "8px", fontWeight: 700, color: "var(--muted-foreground)" }}>Prof:</span>
                                {allProfs.map((p, i) => {
                                  const isSel = (profSelIdx[s.id] ?? 0) === i
                                  return (
                                    <button key={i}
                                      onClick={() => setProfSelIdx(prev => ({ ...prev, [s.id]: i }))}
                                      style={{ padding: "1px 5px", borderRadius: "4px", fontSize: "8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: isSel ? B.navy : "var(--muted)", color: isSel ? "white" : "var(--card-foreground)", borderColor: isSel ? B.navy : "var(--border)" }}>
                                      {fmtName(p.prof)}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                            {/* vComp selector */}
                            {s.tipo === "dia-novo" && s.vComp.map(v => {
                              const alts = s.vCompAlts[v.hora] || [v]
                              const idx  = selIdx[s.id]?.[v.hora] ?? 0
                              return (
                                <div key={v.hora} style={{ display: "flex", alignItems: "center", gap: "2px", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "8px", fontWeight: 700, color: "#16a34a" }}>+{v.hora}:</span>
                                  {alts.map((alt, i) => (
                                    <button key={i}
                                      onClick={() => setSelIdx(prev => ({ ...prev, [s.id]: { ...(prev[s.id] || {}), [v.hora]: i } }))}
                                      style={{ padding: "1px 5px", borderRadius: "4px", fontSize: "8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: i === idx ? "#16a34a" : "var(--muted)", color: i === idx ? "white" : "var(--card-foreground)", borderColor: i === idx ? "#16a34a" : "var(--border)" }}>
                                      {alt.tP} · {fmtName(alt.prof)}
                                    </button>
                                  ))}
                                </div>
                              )
                            })}
                            {/* Ações */}
                            <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "2px" }}>
                              {!isInv && (
                                <button
                                  onClick={() => {
                                    setSt(s, "inviavel")
                                    setSelectedIds(prev => { const n = new Set(prev); n.delete(s.id); return n })
                                  }}
                                  style={{ ...btnStyle("#fef2f2", "#dc2626", "#fca5a5"), fontSize: "9px" }}>
                                  ⛔ Inviável
                                </button>
                              )}
                              {isInv && (
                                <button onClick={() => setSt(s, null)} style={{ ...btnStyle("var(--muted)", "var(--muted-foreground)", "var(--border)"), fontSize: "9px" }}>Desfazer</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer: Fechar + Aceitar selecionados */}
            <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--card)", borderRadius: "0 0 0 18px", flexShrink: 0, display: "flex", gap: "6px", alignItems: "center", justifyContent: "space-between" }}>
              <button onClick={onClose} style={btnStyle("var(--muted)", "var(--card-foreground)", "var(--border)")}>Fechar</button>
              <button
                disabled={selectedCount === 0}
                onClick={handleAceitar}
                style={{
                  ...btnStyle(selectedCount > 0 ? B.navy : "var(--muted)", selectedCount > 0 ? "white" : "var(--muted-foreground)", selectedCount > 0 ? B.navy : "var(--border)"),
                  opacity: selectedCount === 0 ? 0.5 : 1,
                }}>
                Aceitar ({selectedCount}) → Acomp.
              </button>
            </div>
          </div>

          {/* ── Direita: grade do cronograma ─────────────────────────────── */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "10px 16px 16px" }}>
            {!horas.length ? (
              <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "20px" }}>Nenhuma sessão encontrada.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: `${52 + dias.length * 110}px`, width: "100%" }}>
                <colgroup>
                  <col style={{ width: "48px" }} />
                  {dias.map(d => <col key={d} style={{ width: "110px" }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ paddingBottom: "8px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                    {dias.map(d => (
                      <th key={d} style={{ paddingBottom: "8px", textAlign: "center", fontSize: "12px", color: B.navy, fontWeight: 800 }}>
                        <div>{d.replace("-feira", "")}</div>
                        <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horas.map(hora => (
                    <tr key={hora} style={{ borderTop: hora === "13:00" ? "2px solid var(--border)" : "1px solid var(--border)" }}>
                      <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "12px", fontWeight: 800, color: B.navy }}>
                        {hora}
                      </td>
                      {dias.map(d => {
                        const cells = cMap[`${d}|||${hora}`] || []
                        return (
                          <td key={d} style={{ padding: "2px", verticalAlign: "top", height: "1px" }}>
                            {cells.map((c, ci) => {
                              const cs    = cSt(c.tipo)
                              const isDark = c.tipo === "supervDesloc"
                              return (
                                <div key={ci} style={{ background: cs.bg, border: `1px solid ${cs.bd}`, borderRadius: "7px", padding: "5px 7px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <div style={{ fontSize: "10px", fontWeight: 700, color: isDark ? "white" : "var(--card-foreground)", lineHeight: "1.3" }}>{c.tP}</div>
                                  {c.tE && <div style={{ fontSize: "8px", color: "var(--muted-foreground)", fontStyle: "italic" }}>({c.tE})</div>}
                                  <div style={{ fontSize: "9px", color: isDark ? "var(--border)" : "var(--muted-foreground)" }}>{fmtName(c.prof)}</div>
                                  {/* Pedido 1: destino do deslocamento */}
                                  {isDark && (
                                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#fbbf24", marginTop: "auto" }}>
                                      {c.target ? `→ ${c.target}` : "→ verificar"}
                                    </div>
                                  )}
                                  {cs.label && !isDark && (
                                    <div style={{ fontSize: "9px", fontWeight: 700, color: c.tipo === "aceito" ? B.blue : "#4a6e20", marginTop: "auto" }}>{cs.label}</div>
                                  )}
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
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── AceitesPanel ─────────────────────────────────────────────────────────────

const BUNDLE_STATUS_META = {
  pendente:   { label: "Pendente",  bg: "#fef3c7", c: "#92400e", bd: "#fbbf24" },
  confirmado: { label: "Confirmou", bg: "#dcfce7", c: "#14532d", bd: "#86efac" },
  recusado:   { label: "Recusou",   bg: "#fee2e2", c: "#7f1d1d", bd: "#fca5a5" },
}

function AceitesPanel({
  pac, aceites, onUpdate,
}: {
  pac: string
  aceites: AceitePacBundle[]
  onUpdate: (updated: AceitePacBundle[]) => void
}) {
  const pacAceites = aceites.filter(a => a.pac === pac)
  if (!pacAceites.length) return null

  function updateBundle(id: string, patch: Partial<AceitePacBundle>) {
    onUpdate(aceites.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  function deleteBundle(id: string) {
    onUpdate(aceites.filter(a => a.id !== id))
  }

  function toggleInviavel(bundleId: string, slotKey: string) {
    const bundle = aceites.find(a => a.id === bundleId)
    if (!bundle) return
    const inviavelSlots = bundle.inviavelSlots.includes(slotKey)
      ? bundle.inviavelSlots.filter(k => k !== slotKey)
      : [...bundle.inviavelSlots, slotKey]
    updateBundle(bundleId, { inviavelSlots })
  }

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px", marginTop: "16px" }}>
      <div style={{ fontWeight: 800, color: B.navy, fontSize: "13px", marginBottom: "12px" }}>
        Aceites e Recusas — ocp. paciente
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {pacAceites.map(bundle => {
          const sm = BUNDLE_STATUS_META[bundle.status]
          const d  = new Date(bundle.ts)
          const dateStr = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
          return (
            <div key={bundle.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "12px", background: "var(--card)" }}>
              {/* Bundle header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)" }}>{dateStr}</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted-foreground)", background: "var(--muted)", padding: "0 6px", borderRadius: "4px" }}>ocp. paciente</span>
                  <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "9px", fontWeight: 800, background: sm.bg, color: sm.c, border: `1px solid ${sm.bd}` }}>{sm.label}</span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", flexShrink: 0 }}>{bundle.sessoes.length} sessão(ões)</span>
              </div>

              {/* Sessões */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "6px", marginBottom: "10px" }}>
                {bundle.sessoes.map((s, i) => {
                  const slotKey  = `${s.dia}|||${s.hora}`
                  const isInv    = bundle.inviavelSlots.includes(slotKey)
                  return (
                    <div key={i} style={{ border: `1px solid ${isInv ? "#fca5a5" : "var(--border)"}`, borderRadius: "8px", padding: "7px 9px", background: isInv ? "#fff1f2" : "var(--card)", opacity: isInv ? 0.7 : 1 }}>
                      <div style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 800, color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--card-foreground)", marginTop: "2px" }}>{s.tP}</div>
                      <div style={{ fontSize: "9px", color: "var(--muted-foreground)" }}>{fmtName(s.prof)}</div>
                      <button
                        onClick={() => toggleInviavel(bundle.id, slotKey)}
                        style={{ ...btnStyle(isInv ? "var(--muted)" : "#fef2f2", isInv ? "var(--muted-foreground)" : "#dc2626", isInv ? "var(--border)" : "#fca5a5"), fontSize: "8px", marginTop: "5px", width: "100%", textAlign: "center" }}>
                        {isInv ? "↩ Desfazer" : "⛔ Inviável"}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Ações do bundle */}
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "8px", alignItems: "center" }}>
                <button
                  onClick={() => updateBundle(bundle.id, { status: "confirmado" })}
                  style={{ ...btnStyle(bundle.status === "confirmado" ? "#dcfce7" : "#f0fdf4", "#14532d", bundle.status === "confirmado" ? "#86efac" : "#bbf7d0"), fontSize: "10px" }}>
                  ✓ Responsável Confirmou
                </button>
                <button
                  onClick={() => updateBundle(bundle.id, { status: "recusado" })}
                  style={{ ...btnStyle(bundle.status === "recusado" ? "#fee2e2" : "#fef2f2", "#7f1d1d", bundle.status === "recusado" ? "#fca5a5" : "#fecaca"), fontSize: "10px" }}>
                  ✗ Recusou
                </button>
                {bundle.status !== "pendente" && (
                  <button onClick={() => updateBundle(bundle.id, { status: "pendente" })} style={{ ...btnStyle("var(--muted)", "var(--muted-foreground)", "var(--border)"), fontSize: "10px" }}>Desfazer</button>
                )}
                <button onClick={() => deleteBundle(bundle.id)} style={{ ...btnStyle("#fef2f2", "#dc2626", "#fca5a5"), fontSize: "10px", marginLeft: "auto" }}>Cancelar</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PacAgendaGrid ────────────────────────────────────────────────────────────

function PacAgendaGrid({ pac, cRows, sugestoes, onVerAll }: { pac: string; cRows: CsvRow[]; sugestoes: Sugestao[]; onVerAll: () => void }) {
  const sessionMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac || r["Status do Agendamento"] !== "Agendado") continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}`
      if (!m[k]) m[k] = []
      if (!m[k].includes(r.Terapia)) m[k].push(r.Terapia)
    }
    return m
  }, [pac, cRows])

  const sugMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const s of sugestoes) {
      const k = `${s.dia}|||${s.hora}`
      if (!m[k]) m[k] = []
      if (!m[k].includes(s.esp)) m[k].push(s.esp)
    }
    return m
  }, [sugestoes])

  const activeDias = [...DIAS_UTIL].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))

  const allHoras = useMemo(() => {
    const hs = new Set<string>()
    for (const k of [...Object.keys(sessionMap), ...Object.keys(sugMap)]) hs.add(k.split("|||")[1])
    return [...hs].sort((a, b) => (pm(a) || 0) - (pm(b) || 0))
  }, [sessionMap, sugMap])

  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
        <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>Agenda atual do paciente</div>
        <button onClick={onVerAll} style={btnStyle("var(--muted)", "var(--card-foreground)", "var(--border)")}>🗓 Ver aperfeiçoamentos</button>
      </div>
      <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px" }}>
        Sessões agendadas{sugestoes.length > 0 ? " + propostas destacadas" : ""}
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        {[
          { bg: "#22c55e", label: "Agendado" },
          ...(sugestoes.length ? [{ bg: "#fef3c7", bd: "#fbbf24", label: "Proposta" }] : []),
        ].map(({ bg, label, bd }: { bg: string; label: string; bd?: string }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: bg, border: bd ? `1px solid ${bd}` : undefined }} />
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{label}</span>
          </div>
        ))}
      </div>

      {!allHoras.length && (
        <div style={{ textAlign: "center", color: "var(--muted-foreground)", fontSize: "11px", padding: "16px 0" }}>Nenhuma sessão agendada.</div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", fontSize: "11px", width: `${48 + activeDias.length * 100}px` }}>
          <colgroup>
            <col style={{ width: "48px" }} />
            {activeDias.map(d => <col key={d} style={{ width: "100px" }} />)}
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
                  <td style={{ padding: "2px 6px", color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 500, height: "40px", verticalAlign: "middle", whiteSpace: "nowrap" }}>{hora}</td>
                  {activeDias.map(d => {
                    const k      = `${d}|||${hora}`
                    const sesses = sessionMap[k]
                    const sugs   = sugMap[k]
                    // Pedido 1: slot tem Supervisão ABA + proposta → célula preta
                    const hasSupervConflict = sesses?.includes("Supervisão ABA") && !!sugs?.length

                    if (hasSupervConflict) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "var(--card-foreground)", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 6px", gap: "2px" }}>
                            <div style={{ fontWeight: 700, fontSize: "10px", lineHeight: 1.2, color: "white", textAlign: "center" }}>Superv. ABA</div>
                            <div style={{ fontSize: "9px", color: "#fbbf24", fontWeight: 700 }}>↔ deslocar</div>
                          </div>
                        </td>
                      )
                    }
                    if (sesses?.length) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "#22c55e", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", textAlign: "center", padding: "4px 6px", gap: "2px" }}>
                            {sesses.slice(0, 2).map((t, i) => (
                              <div key={i} style={{ fontWeight: 700, fontSize: i === 0 ? "10px" : "9px", lineHeight: 1.2, opacity: i > 0 ? 0.85 : 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                                {t.length > 14 ? t.slice(0, 13) + "…" : t}
                              </div>
                            ))}
                            {sesses.length > 2 && <div style={{ fontSize: "9px", opacity: 0.7 }}>+{sesses.length - 2}</div>}
                          </div>
                        </td>
                      )
                    }
                    if (sugs?.length) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 4px", gap: "1px" }}>
                            {sugs.slice(0, 2).map((t, i) => (
                              <div key={i} style={{ fontWeight: 600, fontSize: "9px", color: "#92400e", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                                {t.length > 14 ? t.slice(0, 13) + "…" : t}
                              </div>
                            ))}
                            <div style={{ fontSize: "9px", color: "#d97706", fontWeight: 700 }}>proposta ↓</div>
                          </div>
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

// ─── OcupPacMode ──────────────────────────────────────────────────────────────

interface Props { cRows: CsvRow[]; lRows: LaudoRow[]; cfg: CfgState }

export function OcupPacMode({ cRows, lRows, cfg }: Props) {
  const [pac, setPac]           = useState("")
  const [inputVal, setInputVal] = useState("")
  const [dropOpen, setDropOpen] = useState(false)
  const [estrategia, setEstrategia] = useState<Estrategia>("S1")
  const [maxAdic, setMaxAdic]   = useState<number | "">("")
  const [statusMap, setStatusMap] = useState<Record<string, Status>>(() => {
    try { return JSON.parse(localStorage.getItem(SK) || "{}") } catch { return {} }
  })
  const [showModal, setShowModal] = useState(false)
  const [aceites, setAceites]   = useState<AceitePacBundle[]>(() => {
    try { return JSON.parse(localStorage.getItem(SK_ACEITES) || "[]") } catch { return [] }
  })

  function persistStatus(m: Record<string, Status>) {
    setStatusMap(m)
    try { localStorage.setItem(SK, JSON.stringify(m)) } catch {}
  }

  function persistAceites(a: AceitePacBundle[]) {
    setAceites(a)
    try { localStorage.setItem(SK_ACEITES, JSON.stringify(a)) } catch {}
  }

  function handleAceitar({ sessoes }: { sessoes: AceiteSessao[] }) {
    if (!sessoes.length) return
    const bundle: AceitePacBundle = {
      id: `${Date.now()}_${pac.slice(0, 8)}`,
      pac, ts: Date.now(),
      origem: "ocp-paciente",
      sessoes,
      status: "pendente",
      inviavelSlots: [],
    }
    persistAceites([...aceites, bundle])
  }

  const stKey = (sugestao: Sugestao) => `${pac}|||${sugestao.id}`
  const stOf  = (sugestao: Sugestao): Status | null => statusMap[stKey(sugestao)] || null
  const setSt = (sugestao: Sugestao, s: Status | null) => {
    const k = stKey(sugestao)
    if (s === null) { const m = { ...statusMap }; delete m[k]; persistStatus(m) }
    else persistStatus({ ...statusMap, [k]: s })
  }

  // ── Dados derivados ─────────────────────────────────────────────────────────

  const agend = useMemo(() => cRows.filter(r => r["Status do Agendamento"] === "Agendado"), [cRows])
  const agendClin = useMemo(() =>
    agend.filter(r => r["Nome Favorecido"] && !PACS_ADMIN.has(r["Nome Favorecido"]) && !EXCLUIR_GAPS.has(r.Terapia)),
    [agend])

  const gapMap = useMemo(() => {
    if (!cRows.length || !lRows.length) return {} as Record<string, { dif: number; aut: number; of: number }>
    const qtdOf: Record<string, number> = {}
    for (const r of agend) {
      const p = r["Nome Favorecido"]
      if (!p || PACS_ADMIN.has(p) || EXCLUIR_GAPS.has(r.Terapia)) continue
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp) continue
      qtdOf[`${p}|||${esp}`] = (qtdOf[`${p}|||${esp}`] || 0) + 1
    }
    const qtdAut: Record<string, number> = {}
    const altaSet = new Set<string>()
    for (const l of lRows) {
      const p   = String(l["Paciente"] || "").trim()
      const esp = String(l["Especialidade"] || "").trim()
      if (!p || PACS_ADMIN.has(p) || !esp) continue
      if (isLaudoComAlta(l)) { altaSet.add(`${p}|||${esp}`); continue }
      const sit = String(l["Situação"] || "").trim().toLowerCase()
      if (sit && sit !== "vigente") continue
      const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
      if (aut <= 0) continue
      const k = `${p}|||${esp}`
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

  const todosPacs = useMemo(() => {
    const pacs = new Set<string>()
    for (const k of Object.keys(gapMap)) pacs.add(k.split("|||")[0])
    return [...pacs].filter(p => !PACS_ADMIN.has(p)).sort()
  }, [gapMap])

  const filteredPacs = useMemo(() =>
    inputVal.trim() ? todosPacs.filter(p => p.toLowerCase().includes(inputVal.toLowerCase())) : todosPacs,
    [todosPacs, inputVal])

  const pacAllRows   = useMemo(() => agend.filter(r => r["Nome Favorecido"] === pac), [pac, agend])
  const currentSlots = useMemo(() => countSlots(pacAllRows), [pacAllRows])

  const pacGaps = useMemo((): GapInfo[] =>
    Object.entries(gapMap)
      .filter(([k]) => k.startsWith(`${pac}|||`))
      .map(([k, v]) => ({ esp: k.split("|||")[1], ...v }))
      .filter(v => v.dif > 0)
      .sort((a, b) => b.dif - a.dif),
    [pac, gapMap])

  const sugestoes = useMemo(() => {
    if (!pac || estrategia !== "S1") return [] as Sugestao[]
    return buildSugestoes(pac, agend, agendClin, cRows, gapMap)
  }, [pac, estrategia, agend, agendClin, cRows, gapMap])

  const sugestoesLimitadas = useMemo(() => {
    if (maxAdic === "") return sugestoes
    return sugestoes.slice(0, maxAdic as number)
  }, [sugestoes, maxAdic])

  const totalAceitos = aceites.filter(a => a.pac === pac).reduce((acc, b) => acc + b.sessoes.length, 0)

  const gapChartData = useMemo(() => {
    const ESP_COLORS = ["#2563eb","#059669","#7e22ce","#c2410c","#0369a1","#a16207","#dc2626","#0891b2"]
    return pacGaps.map((g, i) => ({
      name: g.esp.length > 16 ? g.esp.slice(0, 15) + "…" : g.esp,
      value: g.dif,
      fill: ESP_COLORS[i % ESP_COLORS.length],
    }))
  }, [pacGaps])

  const tipoChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sugestoesLimitadas) counts[s.tipo] = (counts[s.tipo] || 0) + 1
    const TIPO_COLORS: Record<string, string> = { adjacente: "#0369a1", "dia-novo": "#7e22ce" }
    const TIPO_LABELS: Record<string, string> = { adjacente: "Adjacente", "dia-novo": "Dia novo" }
    return Object.entries(counts).map(([t, v]) => ({ name: TIPO_LABELS[t] || t, value: v, fill: TIPO_COLORS[t] || "var(--muted-foreground)" }))
  }, [sugestoesLimitadas])

  function selectPac(p: string) { setPac(p); setInputVal(p); setDropOpen(false) }

  return (
    <>
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

        {/* ── Coluna esquerda ─────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, width: "340px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Seletor de paciente */}
          <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px" }}>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "15px", marginBottom: "4px" }}>
              Aumentar Ocupação — Paciente
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "14px" }}>
              Selecione um paciente com déficit de sessões e explore as estratégias disponíveis.
            </div>

            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "6px" }}>Paciente</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setPac(""); setDropOpen(true) }}
                onFocus={() => setDropOpen(true)}
                onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                placeholder="Buscar paciente..."
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "9px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "var(--color-card, white)", color: "inherit" }}
              />
              {dropOpen && filteredPacs.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", maxHeight: "200px", overflowY: "auto" }}>
                  {filteredPacs.map(p => (
                    <button key={p} onMouseDown={() => selectPac(p)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: p === pac ? "var(--muted)" : "none", border: "none", fontSize: "12px", cursor: "pointer", color: p === pac ? B.navy : "var(--card-foreground)", fontWeight: p === pac ? 700 : 400, fontFamily: "inherit" }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "6px" }}>Limite de sessões adicionais</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {["sem limite", 1, 2, 3, 4, 5].map(v => {
                  const val = v === "sem limite" ? "" : v as number
                  const active = maxAdic === val
                  return (
                    <button key={String(v)} onClick={() => setMaxAdic(val)}
                      style={{ padding: "4px 10px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: active ? B.navy : "var(--muted)", color: active ? "white" : "var(--card-foreground)", borderColor: active ? B.navy : "var(--border)" }}>
                      {v === "sem limite" ? "∞" : `+${v}`}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "5px" }}>
                {maxAdic === "" ? "Sem restrição de quantidade." : `Máximo de ${maxAdic} sessão(ões) adicionais ao total atual.`}
              </div>
            </div>
          </div>

          {/* Resumo e gaps */}
          {pac && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "16px" }}>
              <div style={{ fontWeight: 800, color: B.navy, fontSize: "13px", marginBottom: "10px" }}>Resumo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
                {[
                  { label: "Sessões atuais",        value: currentSlots,                color: B.navy },
                  { label: "Terapias com déficit",   value: pacGaps.length,              color: pacGaps.length > 0 ? "#dc2626" : "var(--muted-foreground)" },
                  { label: "Sugestões disponíveis",  value: sugestoesLimitadas.length,   color: sugestoesLimitadas.length > 0 ? "#16a34a" : "var(--muted-foreground)" },
                  { label: "Em Acompanhamento",      value: totalAceitos,                color: totalAceitos > 0 ? B.blue : "var(--muted-foreground)" },
                  ...(maxAdic !== "" ? [{ label: "Restam aceitar", value: Math.max(0, (maxAdic as number) - totalAceitos), color: totalAceitos >= (maxAdic as number) ? "#dc2626" : B.navy }] : []),
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{label}</span>
                    <span style={{ fontSize: "14px", fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {pacGaps.length > 0 && (
                <>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: "6px" }}>DÉFICIT POR ESPECIALIDADE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "14px" }}>
                    {pacGaps.map(g => (
                      <div key={g.esp} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <div style={{ flex: 1, fontSize: "11px", color: "var(--card-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.esp}</div>
                        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", flexShrink: 0 }}>{g.of}/{g.aut}</span>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#dc2626", flexShrink: 0 }}>−{g.dif}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {gapChartData.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: "6px" }}>DÉFICIT (gráfico)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "90px", height: "90px", flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={gapChartData} cx="50%" cy="50%" innerRadius={24} outerRadius={40} dataKey="value" paddingAngle={2}>
                            {gapChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v: number, n: string) => [v, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1, overflow: "hidden" }}>
                      {gapChartData.map(d => (
                        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                          <span style={{ fontSize: "10px", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{d.name}</span>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--card-foreground)", flexShrink: 0 }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tipoChartData.length > 0 && (
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.05em", marginBottom: "6px" }}>SUGESTÕES POR TIPO</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "90px", height: "90px", flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={tipoChartData} cx="50%" cy="50%" innerRadius={24} outerRadius={40} dataKey="value" paddingAngle={2}>
                            {tipoChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v: number, n: string) => [v, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1 }}>
                      {tipoChartData.map(d => (
                        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{d.name}</span>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--card-foreground)", marginLeft: "auto" }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Coluna direita ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {!pac && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>🧒</div>
              <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--card-foreground)", marginBottom: "4px" }}>Selecione um paciente</div>
              <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Apenas pacientes com déficit de sessões autorizadas aparecem na lista.</div>
            </div>
          )}

          {pac && (
            <>
              <PacAgendaGrid pac={pac} cRows={cRows} sugestoes={sugestoesLimitadas} onVerAll={() => setShowModal(true)} />

              {pacGaps.length === 0 && (
                <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "24px", textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700 }}>Nenhum déficit encontrado para este paciente.</div>
                </div>
              )}
              {pacGaps.length > 0 && sugestoesLimitadas.length === 0 && (
                <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "24px", textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 700, marginBottom: "4px" }}>Nenhuma vaga adjacente encontrada no turno do paciente.</div>
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Verifique se o CSV está carregado e se há vagas livres na grade.</div>
                </div>
              )}
              {sugestoesLimitadas.length > 0 && (() => {
                const byEsp: Record<string, Sugestao[]> = {}
                for (const s of sugestoesLimitadas) {
                  if (!byEsp[s.esp]) byEsp[s.esp] = []
                  byEsp[s.esp].push(s)
                }
                return Object.entries(byEsp).map(([esp, sugs]) => {
                  const gap = pacGaps.find(g => g.esp === esp)
                  return (
                    <div key={esp} style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", paddingBottom: "4px", borderBottom: `2px solid ${B.navy}22` }}>
                        <span style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>{esp}</span>
                        {gap && <span style={{ fontSize: "11px", color: "#dc2626", fontWeight: 700 }}>−{gap.dif} ({gap.of}/{gap.aut})</span>}
                        <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{sugs.length} vaga{sugs.length > 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {sugs.map(s => (
                          <SugestaoCard
                            key={s.id}
                            sugestao={s}
                            stOf={stOf}
                            setSt={setSt}
                            limitReached={false}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}

              {/* Pedido 4: painel de aceites e recusas */}
              <AceitesPanel pac={pac} aceites={aceites} onUpdate={persistAceites} />
            </>
          )}
        </div>
      </div>

      {showModal && (
        <TodasSugestoesModal
          pac={pac}
          cRows={cRows}
          sugestoes={sugestoesLimitadas}
          pacGaps={pacGaps}
          stOf={stOf}
          setSt={setSt}
          onClose={() => setShowModal(false)}
          estrategia={estrategia}
          setEstrategia={setEstrategia}
          onAceitar={handleAceitar}
        />
      )}
    </>
  )
}

// ─── SugestaoCard ─────────────────────────────────────────────────────────────

function SugestaoCard({
  sugestao, stOf, setSt, limitReached,
}: {
  sugestao: Sugestao
  stOf: (s: Sugestao) => Status | null
  setSt: (s: Sugestao, st: Status | null) => void
  limitReached: boolean
}) {
  const st  = stOf(sugestao)
  const stM = st ? STATUS_META[st] : null

  const TIPO_META = {
    adjacente:  { label: "Adjacente", bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
    "dia-novo": { label: "Dia novo",  bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  }
  const tm = TIPO_META[sugestao.tipo]

  return (
    <div style={{
      border: `1px solid ${st === "acompanhamento" ? B.blue + "44" : "var(--border)"}`,
      borderRadius: "10px", padding: "10px 12px",
      background: st === "acompanhamento" ? "var(--muted)" : "var(--card)",
      display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap",
    }}>
      <div style={{ flex: "1 1 180px" }}>
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "5px" }}>
          <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 800, background: tm.bg, color: tm.c, border: `1px solid ${tm.border}` }}>
            {tm.label}
          </span>
          {stM && <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 700, background: stM.bg, color: stM.c }}>{stM.label}</span>}
        </div>

        <div style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "14px", color: B.navy }}>
          {sugestao.dia.replace("-feira", "")} · {sugestao.hora}
        </div>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--card-foreground)", marginTop: "1px" }}>{sugestao.tP}</div>
        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}>
          {fmtName(sugestao.prof)}
          <span style={{ color: "var(--muted-foreground)", marginLeft: "5px" }}>· {sugestao.unidade}</span>
        </div>

        {sugestao.vComp.length > 0 && (
          <div style={{ fontSize: "10px", color: "#16a34a", fontWeight: 700, marginTop: "4px" }}>
            Oferecer junto: {sugestao.vComp.map(v => {
              const nAlts = (sugestao.vCompAlts[v.hora] || [v]).length
              return `${v.hora} — ${nAlts > 1 ? `${nAlts} opções` : `${v.tP} · ${fmtName(v.prof)}`}`
            }).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "5px", alignItems: "center", flexWrap: "wrap", flexShrink: 0, alignSelf: "center" }}>
        {!st && (
          <button onClick={() => setSt(sugestao, "inviavel")} style={btnStyle("#fef2f2", "#dc2626", "#fca5a5")}>
            ⛔ Inviável
          </button>
        )}
        {st === "inviavel" && (
          <button onClick={() => setSt(sugestao, null)} style={btnStyle("var(--muted)", "var(--muted-foreground)", "var(--border)")}>
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
