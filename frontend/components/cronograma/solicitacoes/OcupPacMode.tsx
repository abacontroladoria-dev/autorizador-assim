"use client"

import * as XLSX from "xlsx"
import { type CSSProperties, useEffect, useMemo, useState } from "react"
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
import type { CsvRow, LaudoRow, CfgState, RecItem, InvItem } from "@/types/cronograma"

// ─── Types ────────────────────────────────────────────────────────────────────

type Estrategia = "S1" | "S2" | "S3"
type Status     = "acompanhamento" | "inviavel"

interface VComp { tP: string; prof: string; hora: string }
interface ProfAlt { tP: string; prof: string; unidade: string }

interface EspAlt {
  esp: string; tP: string; prof: string; unidade: string
  profAlts: ProfAlt[]
  vComp: VComp[]
  vCompAlts: Record<string, VComp[]>
}

interface Sugestao {
  id: string
  esp: string
  tP: string
  dia: string; hora: string; prof: string; unidade: string
  tipo: "adjacente" | "dia-novo"
  vComp: VComp[]
  vCompAlts: Record<string, VComp[]>
  profAlts: ProfAlt[]
  espAlts: EspAlt[]
}

interface GapInfo { esp: string; aut: number; of: number; dif: number }

interface AceiteSessao {
  dia: string; hora: string; tP: string; prof: string; unidade: string
}

interface AceitePacBundle {
  id: string; pac: string; ts: number; origem: "ocp-paciente"
  sessoes: AceiteSessao[]
  status: "pendente" | "confirmado" | "recusado" | "inviavel"
  inviavelSlots: string[]
  motivo?: string
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
  inviavel:       { label: "Inviável",           bg: "#f3f4f6", c: "#6b7280" },
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ABA_EXT_NAMES = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa"])
const EXCLUIR_GAPS  = new Set([
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

// Normaliza variações de encoding comuns entre os dois CSVs (apóstrofo curvo vs reto,
// espaços duplos, NFC vs NFD) para permitir junção tolerante de nomes.
function normalizeName(n: string): string {
  return n
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "’")
    .replace(/\s+/g, " ")
    .trim()
}


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
  aceites: AceitePacBundle[] = [],
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

  // Todas as sessões do paciente — usado para evitar sugerir slot já ocupado
  const dayHours: Record<string, Set<string>> = {}
  for (const r of agend.filter(r => r["Nome Favorecido"] === pac)) {
    const d = r["Dia da Semana"]
    const h = hMin(r)
    if (!h && h !== 0) continue
    const canonical = fm(h)
    if (!canonical) continue
    if (!dayHours[d]) dayHours[d] = new Set()
    dayHours[d].add(canonical)
  }
  // Vagas comprometidas: sessões aguardando ou confirmadas que ainda não estão no agend
  for (const bundle of aceites) {
    if (bundle.pac !== pac) continue
    if (bundle.status !== "pendente" && bundle.status !== "confirmado") continue
    for (const s of bundle.sessoes) {
      if (!dayHours[s.dia]) dayHours[s.dia] = new Set()
      dayHours[s.dia].add(s.hora)
    }
  }

  // Apenas sessões clínicas (excl. EXCLUIR_OCUP) — usado para adjacência e hasDay
  const dayHoursClin: Record<string, Set<string>> = {}
  for (const r of agend.filter(r => r["Nome Favorecido"] === pac && !EXCLUIR_OCUP.has(r.Terapia) && !ABA_EXT_NAMES.has(r.Terapia))) {
    const d = r["Dia da Semana"]
    const h = hMin(r)
    if (!h && h !== 0) continue
    const canonical = fm(h)
    if (!canonical) continue
    if (!dayHoursClin[d]) dayHoursClin[d] = new Set()
    dayHoursClin[d].add(canonical)
  }

  const pacUnidades = new Set(pacClinRows.map(r => rowUnid(r)))

  // R5.4: mapa da unidade que o paciente já usa por dia+turno (manhã < 720 min; tarde ≥ 720)
  const pacDayTurnoUnid: Record<string, string> = {}
  for (const r of pacClinRows) {
    const d = r["Dia da Semana"]
    const h = hMin(r)
    if (!h && h !== 0) continue
    const turno = h < 720 ? "manha" : "tarde"
    const key = `${d}|||${turno}`
    if (!pacDayTurnoUnid[key]) pacDayTurnoUnid[key] = rowUnid(r)
  }

  const pacGaps = Object.entries(gapMap)
    .filter(([k]) => k.startsWith(`${pac}|||`))
    .map(([k, v]) => ({ esp: k.split("|||")[1], ...v }))
    .filter(v => v.dif > 0)
    .sort((a, b) => b.dif - a.dif)

  if (pacGaps.length === 0) return []

  const espDif: Record<string, number> = {}
  const espMeta: Record<string, { dif: number; aut: number; of: number }> = {}
  for (const g of pacGaps) { espDif[g.esp] = g.dif; espMeta[g.esp] = g }

  // Rastreia sessões já propostas nesta rodada para não ultrapassar o autorizado.
  const proposedOf: Record<string, number> = {}
  const effDif = (e: string, extra = 0) => (espDif[e] ?? 0) - (proposedOf[e] ?? 0) - extra

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

    const hoursOnDay = dayHoursClin[dia]
    const hasDay = !!hoursOnDay && hoursOnDay.size > 0
    const adjs   = adjHs(hora)
    const isAdj  = hasDay && adjs.some(a => hoursOnDay!.has(a))

    // Esps elegíveis: ordenadas por déficit efetivo desc; tiebreak por taxa de preenchimento asc.
    const eligibleEsps = Object.keys(byEspRows)
      .filter(esp => effDif(esp) > 0)
      .sort((a, b) => {
        const da = effDif(a), db = effDif(b)
        if (db !== da) return db - da
        const ra = (espMeta[a]?.aut ?? 0) > 0 ? (espMeta[a].of / espMeta[a].aut) : 0
        const rb = (espMeta[b]?.aut ?? 0) > 0 ? (espMeta[b].of / espMeta[b].aut) : 0
        return ra - rb
      })
    if (eligibleEsps.length === 0) continue

    // Constrói os dados de uma esp para este slot; retorna null se inválido.
    const buildEntry = (esp: string): EspAlt | null => {
      const espRows = byEspRows[esp]
      const [primaryRow, ...altRows] = espRows
      const unid = rowUnid(primaryRow)
      // Para dia-novo: restringe profAlts à mesma unidade do slot principal, pois os
      // vComps são calculados com base em `unid`. Trocar para um profAlt de outra unidade
      // causaria duas sessões consecutivas em unidades diferentes (viola R5.4).
      const profAlts = altRows
        .filter(r => !hasDay ? rowUnid(r) === unid : true)
        .map(r => ({ tP: r.Terapia, prof: r.Profissional, unidade: rowUnid(r) }))
      if (!hasDay) {
        const seenComp = new Set<string>()
        const compRows: Array<{ tP: string; prof: string; hora: string }> = []
        for (const r of cRows) {
          if (r["Status do Agendamento"] !== "Livre") continue
          if (isProfBloqueadoTemp(r.Profissional)) continue
          if (r["Dia da Semana"] !== dia) continue
          if (rowUnid(r) !== unid) continue
          if (EXCLUIR_OCUP.has(r.Terapia)) continue
          const compEsp = TERAPIA_TO_ESP[r.Terapia]
          // Desconta 1 do esp principal, pois ele já será adicionado neste slot.
          if (!compEsp || effDif(compEsp, compEsp === esp ? 1 : 0) <= 0) continue
          const ch = hMin(r)
          if (!isTurnoOk(ch)) continue
          const cHora = fm(ch)
          if (!adjs.includes(cHora)) continue
          const ck = `${r.Terapia}|||${r.Profissional}|||${cHora}`
          if (seenComp.has(ck)) continue
          seenComp.add(ck)
          compRows.push({ tP: r.Terapia, prof: r.Profissional, hora: cHora })
        }
        if (compRows.length === 0) return null
        // Ordena por déficit desc + taxa de preenchimento asc para que g[0] seja sempre
        // a especialidade mais necessária em cada hora.
        compRows.sort((a, b) => {
          const espA = TERAPIA_TO_ESP[a.tP] ?? "", espB = TERAPIA_TO_ESP[b.tP] ?? ""
          // Desconta 1 do esp principal ao comparar vComps do mesmo slot.
          const da = effDif(espA, espA === esp ? 1 : 0)
          const db = effDif(espB, espB === esp ? 1 : 0)
          if (db !== da) return db - da
          const ra = (espMeta[espA]?.aut ?? 0) > 0 ? (espMeta[espA].of / espMeta[espA].aut) : 0
          const rb = (espMeta[espB]?.aut ?? 0) > 0 ? (espMeta[espB].of / espMeta[espB].aut) : 0
          return ra - rb
        })
        const byHora: Record<string, VComp[]> = {}
        for (const c of compRows) {
          if (!byHora[c.hora]) byHora[c.hora] = []
          byHora[c.hora].push(c)
        }
        return {
          esp, tP: primaryRow.Terapia, prof: primaryRow.Profissional, unidade: unid, profAlts,
          vComp: Object.values(byHora).map(g => g[0]),
          vCompAlts: byHora,
        }
      }
      // R5.4: slot adjacente deve estar na mesma unidade que as sessões existentes do
      // paciente naquele dia+turno. Filtra todas as linhas pelo turno correto e rejeita
      // se nenhuma tiver a unidade esperada.
      const slotTurno = (pm(hora) ?? 0) < 720 ? "manha" : "tarde"
      const existingUnid = pacDayTurnoUnid[`${dia}|||${slotTurno}`]
      if (existingUnid) {
        const validRows = espRows.filter(r => rowUnid(r) === existingUnid)
        if (validRows.length === 0) return null
        const [vPrimary, ...vAlts] = validRows
        return {
          esp, tP: vPrimary.Terapia, prof: vPrimary.Profissional, unidade: existingUnid,
          profAlts: vAlts.map(r => ({ tP: r.Terapia, prof: r.Profissional, unidade: rowUnid(r) })),
          vComp: [], vCompAlts: {},
        }
      }
      return { esp, tP: primaryRow.Terapia, prof: primaryRow.Profissional, unidade: unid, profAlts, vComp: [], vCompAlts: {} }
    }

    // Encontra a esp default (maior gap com dados válidos) e coleta espAlts.
    let defaultEntry: EspAlt | null = null
    const altEntries: EspAlt[] = []
    for (const esp of eligibleEsps) {
      const entry = buildEntry(esp)
      if (!entry) continue
      if (!defaultEntry) { defaultEntry = entry; continue }
      altEntries.push(entry)
    }
    if (!defaultEntry) continue

    if (hasDay && isAdj) {
      sugestoes.push({
        id: `${dia}|||${hora}|||${defaultEntry.esp}`,
        esp: defaultEntry.esp, tP: defaultEntry.tP,
        dia, hora, prof: defaultEntry.prof, unidade: defaultEntry.unidade,
        tipo: "adjacente", vComp: [], vCompAlts: {},
        profAlts: defaultEntry.profAlts,
        espAlts: altEntries,
      })
      proposedOf[defaultEntry.esp] = (proposedOf[defaultEntry.esp] ?? 0) + 1
    } else if (!hasDay) {
      sugestoes.push({
        id: `${dia}|||${hora}|||${defaultEntry.esp}`,
        esp: defaultEntry.esp, tP: defaultEntry.tP,
        dia, hora, prof: defaultEntry.prof, unidade: defaultEntry.unidade,
        tipo: "dia-novo",
        vComp: defaultEntry.vComp, vCompAlts: defaultEntry.vCompAlts,
        profAlts: defaultEntry.profAlts,
        espAlts: altEntries,
      })
      proposedOf[defaultEntry.esp] = (proposedOf[defaultEntry.esp] ?? 0) + 1
      for (const vc of defaultEntry.vComp) {
        const e = TERAPIA_TO_ESP[vc.tP]
        if (e) proposedOf[e] = (proposedOf[e] ?? 0) + 1
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

  // R5.1 para dia-novo: um bloco contíguo por dia — mantém apenas o de maior gap.
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

type AcaoDiretaType = "aceitar" | "recusar" | "inviavel"
interface PendingAcaoInfo {
  sugestao: Sugestao; hora: string; tP: string; prof: string; unidade: string; acao: AcaoDiretaType
}

interface TodasSugestoesModalProps {
  pac: string; conv: string; cRows: CsvRow[]; sugestoes: Sugestao[]; pacGaps: GapInfo[]; pacAllEsp: GapInfo[]
  stOf: (s: Sugestao) => Status | null
  setSt: (s: Sugestao, st: Status | null) => void
  onClose: () => void
  estrategia: Estrategia; setEstrategia: (e: Estrategia) => void
  onAceitar: (bundle: { sessoes: AceiteSessao[] }) => void
  onInviavel: (sessoes: AceiteSessao[], motivo: string) => void
  onAcaoDireta: (sessoes: AceiteSessao[], status: "pendente" | "recusado" | "inviavel", motivo?: string) => void
}

function TodasSugestoesModal({
  pac, conv, cRows, sugestoes, pacGaps, pacAllEsp, stOf, setSt, onClose,
  estrategia, setEstrategia, onAceitar, onInviavel, onAcaoDireta,
}: TodasSugestoesModalProps) {
  const [selIdx, setSelIdx]         = useState<Record<string, Record<string, number>>>({})
  const [profSelIdx, setProfSelIdx] = useState<Record<string, number>>({})
  const [espSelIdx, setEspSelIdx]   = useState<Record<string, number>>({})
  // Seleção em lote — todas pré-selecionadas ao abrir o modal
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(sugestoes.filter(s => stOf(s) !== "inviavel").map(s => s.id))
  )
  // Ação direta por sessão (✗ / ⛔)
  const [pendingAcao, setPendingAcao] = useState<PendingAcaoInfo | null>(null)
  const [acaoMotivo, setAcaoMotivo]   = useState("")
  // Recusar todas as sessões de um dia (confirmação)
  const [pendingRecusarDia, setPendingRecusarDia] = useState<{ dia: string; sessoes: AceiteSessao[]; dayIds: string[] } | null>(null)
  const [motivoRecusarDia, setMotivoRecusarDia]   = useState("")
  // Confirmação de aceitar em lote
  const [confirmingAceitar, setConfirmingAceitar] = useState(false)
  // vComps excluídos individualmente: { sugestaoId: Set<hora> }
  const [vcExcluded, setVcExcluded] = useState<Record<string, Set<string>>>({})

  function isVCompExcluded(sid: string, hora: string) {
    return vcExcluded[sid]?.has(hora) ?? false
  }
  function toggleVComp(sid: string, hora: string) {
    setVcExcluded(prev => {
      const s = new Set(prev[sid] || [])
      if (s.has(hora)) s.delete(hora); else s.add(hora)
      return { ...prev, [sid]: s }
    })
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function getActiveEspData(s: Sugestao): EspAlt {
    const idx = espSelIdx[s.id] ?? 0
    if (idx > 0 && s.espAlts[idx - 1]) return s.espAlts[idx - 1]
    return { esp: s.esp, tP: s.tP, prof: s.prof, unidade: s.unidade, profAlts: s.profAlts, vComp: s.vComp, vCompAlts: s.vCompAlts }
  }

  function getActiveEntry(s: Sugestao): { tP: string; prof: string; unidade: string } {
    const ed  = getActiveEspData(s)
    const idx = profSelIdx[s.id] ?? 0
    if (idx === 0 || !ed.profAlts[idx - 1]) return { tP: ed.tP, prof: ed.prof, unidade: ed.unidade }
    return ed.profAlts[idx - 1]
  }

  function getActiveVComps(s: Sugestao): VComp[] {
    const ed = getActiveEspData(s)
    return ed.vComp.map(v => {
      const alts = ed.vCompAlts[v.hora] || [v]
      return alts[selIdx[s.id]?.[v.hora] ?? 0] ?? v
    })
  }

  function buildSelectedSessoes(): AceiteSessao[] {
    const toAccept = sugestoes.filter(s => selectedIds.has(s.id) && stOf(s) !== "inviavel")
    const sessoes: AceiteSessao[] = []
    for (const s of toAccept) {
      const ae = getActiveEntry(s)
      if (!isVCompExcluded(s.id, s.hora)) {
        sessoes.push({ dia: s.dia, hora: s.hora, tP: ae.tP, prof: ae.prof, unidade: ae.unidade })
      }
      for (const vc of getActiveVComps(s)) {
        if (isVCompExcluded(s.id, vc.hora)) continue
        sessoes.push({ dia: s.dia, hora: vc.hora, tP: vc.tP, prof: vc.prof, unidade: ae.unidade })
      }
    }
    return sessoes
  }

  function handleAceitar() {
    const sessoes = buildSelectedSessoes()
    if (!sessoes.length) return
    onAceitar({ sessoes })
    setSelectedIds(new Set())
    setConfirmingAceitar(false)
  }

  const sessPac = useMemo(() => {
    const seen = new Set<string>()
    const ADMIN_WARN = new Set(["Triagem", "Avaliação Neuropsicológica", "Visita Guiada"])
    const res: { dia: string; hora: string; tP: string; tE?: string; prof: string; unidade: string; tipo: "exist" | "adminSuperv" | "adminWarn" }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== pac || ABA_EXT_NAMES.has(r.Terapia)) continue
      const hm = pm(hiStr(r)) ?? Number(r.HI || 0)
      const hora = fm(hm) || hiStr(r)
      const k = `${r["Dia da Semana"]}|||${hm}|||${r.Terapia}|||${r.Profissional}`
      if (seen.has(k)) continue; seen.add(k)
      let tipo: "exist" | "adminSuperv" | "adminWarn" = "exist"
      if (r.Terapia === "Supervisão ABA")       tipo = "adminSuperv"
      else if (ADMIN_WARN.has(r.Terapia))       tipo = "adminWarn"
      res.push({
        dia: r["Dia da Semana"], hora,
        tP: r.Terapia, tE: tExib(r.Terapia),
        prof: r.Profissional, unidade: rowUnid(r),
        tipo,
      })
    }
    return res
  }, [pac, cRows])

  type CellInfo = {
    tP: string; tE?: string; prof: string
    tipo: "proposta" | "aceito" | "exist" | "adminSuperv" | "adminWarn" | "supervDesloc"
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

  // Passo 1: registrar todos os slots principais não excluídos — garantia de prioridade
  const mainSlots = new Set<string>()
  for (const s of sugestoes) {
    if (stOf(s) === "inviavel") continue
    if (!selectedIds.has(s.id)) continue
    if (isVCompExcluded(s.id, s.hora)) continue
    mainSlots.add(`${s.dia}|||${s.hora}`)
  }

  // Passo 2: adicionar entradas principais ao cMap (respeita exclusão individual)
  for (const s of sugestoes) {
    const st = stOf(s)
    if (st === "inviavel") continue
    if (!selectedIds.has(s.id)) continue
    if (isVCompExcluded(s.id, s.hora)) continue
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
    if (!selectedIds.has(s.id)) continue
    const tipo: CellInfo["tipo"] = st === "acompanhamento" ? "aceito" : "proposta"
    // Usa a unidade do espAlt ativo, não a do defaultEntry (s.unidade), para evitar
    // falso alerta de "unidades diferentes" quando o usuário troca de terapia.
    const activeUnid = getActiveEspData(s).unidade
    const activeVComps = getActiveVComps(s)
    for (const vc of activeVComps) {
      if (isVCompExcluded(s.id, vc.hora)) continue
      const kC = `${s.dia}|||${vc.hora}`
      if (seenSlot.has(kC)) continue
      seenSlot.add(kC)
      if (!cMap[kC]) cMap[kC] = []
      if (!cMap[kC].some(x => x.tP === vc.tP && x.prof === vc.prof)) {
        cMap[kC].push({ tP: vc.tP, tE: tExib(vc.tP), prof: vc.prof, tipo, unidade: activeUnid })
      }
    }
  }

  // Pedido 1: detectar Supervisão ABA deslocável e pintar de preto
  for (const [k, cells] of Object.entries(cMap)) {
    const hasProposal = cells.some(c => c.tipo === "proposta" || c.tipo === "aceito")
    if (!hasProposal) continue
    const supervIdx = cells.findIndex(c => c.tipo === "adminSuperv" && c.tP === "Supervisão ABA")
    if (supervIdx === -1) continue
    const sv = cells[supervIdx]
    const kParts = k.split("|||")
    const target = findSupervTarget(kParts[0], kParts[1], sv.prof, cRows)
    cells[supervIdx] = { ...sv, tipo: "supervDesloc", target: target ?? undefined }
  }

  const dias   = [...DIAS_UTIL].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const horas  = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))
  const unitMeta = buildCronoUnitMeta(dias, cMap)

  const discrepantCellKeys = new Set<string>()
  if (!unitMeta.globalUnit) {
    for (const d of dias) {
      for (const isM of [true, false]) {
        const horasT = horas.filter(h => isM ? (pm(h) ?? 999) < 720 : (pm(h) ?? 0) >= 720)
        const items: Array<{ unit: string; k: string }> = []
        for (const h of horasT) {
          for (const c of cMap[`${d}|||${h}`] || []) {
            if (!c.unidade || c.tipo === "adminSuperv" || c.tipo === "adminWarn" || c.tipo === "supervDesloc") continue
            items.push({ unit: c.unidade, k: `${d}|||${h}|||${c.tP}|||${c.prof}` })
          }
        }
        if (items.length < 2) continue
        const cnt: Record<string, number> = {}
        for (const x of items) cnt[x.unit] = (cnt[x.unit] || 0) + 1
        const dom = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]
        for (const x of items) if (x.unit !== dom) discrepantCellKeys.add(x.k)
      }
    }
  }

  const cSt = (tipo: string) => {
    if (tipo === "supervDesloc") return { bg: "#111827", bd: "#374151",  label: "↔ mover" }
    if (tipo === "adminSuperv")  return { bg: "#111827", bd: "#374151",  label: null       }
    if (tipo === "adminWarn")    return { bg: "#fef9c3", bd: "#fde047",  label: null       }
    if (tipo === "aceito")       return { bg: B.blueLt,  bd: B.blue,    label: "Aceito"   }
    if (tipo === "proposta")     return { bg: B.limeLt,  bd: B.lime,    label: "Proposta" }
    return                              { bg: "#f8fafc", bd: "#e2e8f0", label: null       }
  }

  const TIPO_META = {
    adjacente:  { label: "Adjacente", bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
    "dia-novo": { label: "Dia novo",  bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  }

  const selectedCount = buildSelectedSessoes().length

  const selectedByEsp: Record<string, number> = {}
  for (const id of selectedIds) {
    const s = sugestoes.find(x => x.id === id)
    if (!s || stOf(s) === "inviavel") continue
    if (!isVCompExcluded(s.id, s.hora)) {
      const activeEsp = getActiveEspData(s).esp
      selectedByEsp[activeEsp] = (selectedByEsp[activeEsp] || 0) + 1
    }
    for (const vc of getActiveVComps(s)) {
      if (isVCompExcluded(s.id, vc.hora)) continue
      const esp = TERAPIA_TO_ESP[vc.tP]
      if (esp) selectedByEsp[esp] = (selectedByEsp[esp] || 0) + 1
    }
  }
  const hasExcesso = pacAllEsp.some(g => (g.of + (selectedByEsp[g.esp] || 0)) > g.aut)

  return createPortal(
    <>
    <div
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", padding: "12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "white", borderRadius: "18px", boxShadow: "0 24px 80px rgba(0,0,0,.22)", width: "96vw", maxWidth: "1400px", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa", borderRadius: "18px 18px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "15px", color: B.navy }}>{pac}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                {(() => {
                  const n = sugestoes.reduce((acc, s) => acc + 1 + s.vComp.length, 0)
                  return `Sessões propostas disponíveis: ${n}`
                })()}
              </span>
              {conv && (
                <span style={{ fontSize: "10px", fontWeight: 700, background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: "5px", padding: "1px 7px" }}>
                  {conv}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
            <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: "16px", color: "#6b7280" }}>×</button>
          </div>
        </div>

        {/* Seletor de estratégia */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #f0f0f0", background: "#f8fafc", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginRight: "4px" }}>Estratégia:</span>
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
                  border: `1px solid ${isActive ? m.border : "#e5e7eb"}`,
                  background: isActive ? m.bg : "#f3f4f6",
                  color: isActive ? m.c : "#9ca3af",
                  opacity: m.disponivel ? 1 : 0.5,
                  display: "flex", alignItems: "center", gap: "5px",
                }}>
                <span style={{ padding: "1px 5px", borderRadius: "4px", fontSize: "10px", fontWeight: 800, background: isActive ? m.c : "#d1d5db", color: isActive ? "white" : "#6b7280" }}>{m.short}</span>
                {m.label}
                {!m.disponivel && <span style={{ fontSize: "9px", background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "3px", padding: "0 4px" }}>Em breve</span>}
              </button>
            )
          })}
        </div>

        {/* Corpo: lado a lado */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* ── Esquerda: propostas ──────────────────────────────────────── */}
          <div style={{ width: "480px", flexShrink: 0, borderRight: "2px solid #f1f5f9", display: "flex", flexDirection: "column", minHeight: 0 }}>

            {/* Legenda */}
            <div style={{ padding: "6px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: "10px", fontSize: "10px", color: "#9ca3af", flexWrap: "wrap", flexShrink: 0 }}>
              {[
                { bg: "#f8fafc", bd: "#e2e8f0", label: "Existente" },
                { bg: "#fef9c3", bd: "#fde047",  label: "Triagem / Avaliação" },
                { bg: B.limeLt,  bd: B.lime,    label: "Proposta" },
                { bg: "#111827", bd: "#374151",  label: "Supervisão Desloc." },
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
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "20px", fontSize: "12px" }}>Nenhuma proposta gerada para esta estratégia.</div>
              ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {(() => {
                        const orderedDays = [...new Map(sugestoes.map(s => [s.dia, true])).keys()]
                        return orderedDays.flatMap((dia, di) => {
                          const daySugs = sugestoes.filter(s => s.dia === dia)
                          const dayIds  = daySugs.filter(s => stOf(s) !== "inviavel").map(s => s.id)
                          const allSel  = dayIds.length > 0 && dayIds.every(id => selectedIds.has(id))
                          const toggleDay = () => {
                            setSelectedIds(prev => {
                              const n = new Set(prev)
                              if (allSel) dayIds.forEach(id => n.delete(id))
                              else dayIds.forEach(id => n.add(id))
                              return n
                            })
                            setVcExcluded(prev => {
                              const next = { ...prev }
                              for (const s of daySugs) {
                                if (stOf(s) === "inviavel") continue
                                if (allSel) {
                                  // Desmarcar: exclui sessão principal + todos os vComps
                                  const ex = new Set(prev[s.id] || [])
                                  ex.add(s.hora)
                                  for (const vc of getActiveVComps(s)) ex.add(vc.hora)
                                  next[s.id] = ex
                                } else {
                                  // Selecionar: limpa todas as exclusões do dia
                                  next[s.id] = new Set()
                                }
                              }
                              return next
                            })
                          }
                          const recusarDia = () => {
                            const sessoes: AceiteSessao[] = []
                            for (const s of daySugs) {
                              if (stOf(s) === "inviavel") continue
                              const ae = getActiveEntry(s)
                              sessoes.push({ dia: s.dia, hora: s.hora, tP: ae.tP, prof: ae.prof, unidade: ae.unidade })
                              for (const vc of getActiveVComps(s)) {
                                if (isVCompExcluded(s.id, vc.hora)) continue
                                sessoes.push({ dia: s.dia, hora: vc.hora, tP: vc.tP, prof: vc.prof, unidade: ae.unidade })
                              }
                            }
                            if (sessoes.length) {
                              setPendingRecusarDia({ dia, sessoes, dayIds: [...dayIds] })
                            }
                          }
                          const dayHeader = (
                            <div key={`hdr_${dia}`} style={{ marginTop: di > 0 ? "14px" : "0", marginBottom: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: B.navy, flexShrink: 0 }} />
                                <span style={{ fontSize: "12px", fontWeight: 900, color: B.navy, flex: 1 }}>{dia.replace("-feira", "")}</span>
                                {dayIds.length > 0 && (
                                  <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 600 }}>{dayIds.length} proposta{dayIds.length !== 1 ? "s" : ""}</span>
                                )}
                                <button onClick={toggleDay} style={{ fontSize: "9px", padding: "2px 9px", borderRadius: "5px", border: `1px solid ${allSel ? "#bfdbfe" : "#e2e8f0"}`, background: allSel ? "#eff6ff" : "white", color: allSel ? "#1d4ed8" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                                  {allSel ? "Desmarcar" : "Selecionar"}
                                </button>
                                <button onClick={recusarDia} style={{ fontSize: "9px", padding: "2px 9px", borderRadius: "5px", border: "1px solid #fecaca", background: "white", color: "#dc2626", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                                  Recusar
                                </button>
                              </div>
                            </div>
                          )
                          const cards = daySugs.map(s => {
                        const st       = stOf(s)
                        const stM      = st ? STATUS_META[st] : null
                        const tm       = TIPO_META[s.tipo]
                        const ed       = getActiveEspData(s)
                        const ae       = getActiveEntry(s)
                        const allEsps  = [{ esp: s.esp, tP: s.tP }, ...s.espAlts.map(a => ({ esp: a.esp, tP: a.tP }))]
                        const allProfs = [{ tP: ed.tP, prof: ed.prof, unidade: ed.unidade }, ...ed.profAlts]
                        const isInv    = st === "inviavel"
                        const isChk    = selectedIds.has(s.id) && !isInv
                        const chipBase: CSSProperties = {
                          fontSize: "11px", fontFamily: "inherit", fontWeight: 700,
                          border: "1px solid #e2e8f0", borderRadius: "4px",
                          padding: "1px 6px", background: "#f8fafc",
                          display: "block", width: "100%", boxSizing: "border-box",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }
                        const mkChip = (
                          label: string, color: string,
                          opts: { v: string; l: string }[], curV: string,
                          onChange: (v: string) => void, disabled?: boolean,
                        ): React.ReactNode => {
                          if (opts.length <= 1) return <span style={{ ...chipBase, color }}>{label}</span>
                          return (
                            <div style={{ position: "relative", width: "100%" }}>
                              <select value={curV} onChange={e => onChange(e.target.value)} disabled={disabled}
                                style={{ ...chipBase, color, cursor: "pointer", appearance: "none" as CSSProperties["appearance"], paddingRight: "20px" }}>
                                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                              </select>
                              <span style={{
                                position: "absolute", right: "3px", top: "50%", transform: "translateY(-50%)",
                                fontSize: "8px", fontWeight: 900, color: "#16a34a", pointerEvents: "none",
                                background: "#dcfce7", border: "1px solid #86efac", borderRadius: "50%",
                                width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center",
                                lineHeight: 1, letterSpacing: "-0.5px",
                              }}>+{opts.length - 1}</span>
                            </div>
                          )
                        }
                        // Linha de sessão — design idêntico para todas as sessões do card
                        const sessaoRow = (
                          hora: string,
                          isMain: boolean,
                          sessInfo: { tP: string; prof: string; unidade: string },
                          checked: boolean,
                          onCheck: () => void,
                          dimmed: boolean,
                          terapiaEl: React.ReactNode,
                          profEl: React.ReactNode,
                        ) => {
                          const dispararAcao = (acao: AcaoDiretaType) => {
                            setPendingAcao({ sugestao: s, hora, ...sessInfo, acao })
                            setAcaoMotivo("")
                          }
                          return (
                            <div key={hora} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: isMain ? "0" : "5px" }}>
                              {isInv
                                ? (isMain ? <button onClick={() => setSt(s, null)} style={{ ...btnStyle("#f3f4f6", "#6b7280", "#e5e7eb"), fontSize: "9px", padding: "2px 6px", flexShrink: 0 }}>Desfazer</button> : <span style={{ width: "14px", flexShrink: 0 }} />)
                                : <input type="checkbox" checked={checked} onChange={onCheck} style={{ cursor: "pointer", accentColor: B.navy, flexShrink: 0, margin: 0 }} />
                              }
                              <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 800, color: B.navy, whiteSpace: "nowrap", width: "36px", flexShrink: 0, opacity: dimmed ? 0.35 : 1 }}>{hora}</span>
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "4px", minWidth: 0, opacity: dimmed ? 0.35 : 1 }}>
                                <div style={{ width: "120px", flexShrink: 0 }}>{terapiaEl}</div>
                                {profEl != null && <span style={{ color: "#e2e8f0", fontSize: "10px", flexShrink: 0 }}>|</span>}
                                <div style={{ flex: 1, minWidth: 0 }}>{profEl}</div>
                              </div>
                              {!isInv && (
                                <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                                  <button onClick={() => dispararAcao("recusar")} title="Recusar" style={{ width: "22px", height: "22px", borderRadius: "5px", border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontSize: "13px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", fontWeight: 900, lineHeight: 1 }}>✕</button>
                                  <button onClick={() => dispararAcao("inviavel")} title="Inviável" style={{ width: "22px", height: "22px", borderRadius: "5px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#94a3b8", cursor: "pointer", fontSize: "11px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>⊘</button>
                                </div>
                              )}
                            </div>
                          )
                        }

                        return (
                          <div key={s.id} style={{
                            borderRadius: "7px",
                            border: "1px solid #e2e8f0",
                            borderLeft: `3px solid ${isInv ? "#cbd5e1" : tm.c}`,
                            background: isInv ? "#f8fafc" : "white",
                            opacity: isInv ? 0.5 : 1,
                            overflow: "hidden",
                          }}>
                            {stM && (
                              <div style={{ padding: "3px 10px 0 11px" }}>
                                <span style={{ fontSize: "9px", fontWeight: 700, background: stM.bg, color: stM.c, padding: "1px 6px", borderRadius: "4px" }}>{stM.label}</span>
                              </div>
                            )}
                            <div style={{ padding: "7px 8px 7px 11px" }}>
                            {/* Sessão principal */}
                            {sessaoRow(
                              s.hora, true,
                              { tP: ae.tP, prof: ae.prof, unidade: ae.unidade },
                              isChk && !isVCompExcluded(s.id, s.hora),
                              () => {
                                if (!selectedIds.has(s.id)) {
                                  toggleSelected(s.id)
                                  setVcExcluded(prev => { const ex = new Set(prev[s.id]||[]); ex.delete(s.hora); return { ...prev, [s.id]: ex } })
                                } else {
                                  toggleVComp(s.id, s.hora)
                                }
                              },
                              false,
                              mkChip(ed.tP, "#1f2937",
                                allEsps.map((e, i) => ({ v: String(i), l: e.tP })),
                                String(espSelIdx[s.id] ?? 0),
                                v => { const i = Number(v); setEspSelIdx(prev => ({ ...prev, [s.id]: i })); setProfSelIdx(prev => ({ ...prev, [s.id]: 0 })); setSelIdx(prev => ({ ...prev, [s.id]: {} })) },
                              ),
                              mkChip(fmtName(ae.prof), "#6b7280",
                                allProfs.map((p, i) => ({ v: String(i), l: fmtName(p.prof) })),
                                String(profSelIdx[s.id] ?? 0),
                                v => setProfSelIdx(prev => ({ ...prev, [s.id]: Number(v) })),
                              ),
                            )}
                            {/* Sessões vComp — design idêntico, selects separados */}
                            {s.tipo === "dia-novo" && ed.vComp.map(v => {
                              const alts   = ed.vCompAlts[v.hora] || [v]
                              const idx    = selIdx[s.id]?.[v.hora] ?? 0
                              const excl   = isVCompExcluded(s.id, v.hora)
                              const cur    = alts[idx] ?? alts[0]
                              const uniqTp = [...new Set(alts.map(a => a.tP))]
                              const tpPrfs = alts.filter(a => a.tP === cur.tP).map(a => a.prof)
                              const setVcTp  = (tp: string) => { const ni = alts.findIndex(a => a.tP === tp); if (ni >= 0) setSelIdx(prev => ({ ...prev, [s.id]: { ...(prev[s.id]||{}), [v.hora]: ni } })) }
                              const setVcPrf = (pr: string) => { const ni = alts.findIndex(a => a.tP === cur.tP && a.prof === pr); if (ni >= 0) setSelIdx(prev => ({ ...prev, [s.id]: { ...(prev[s.id]||{}), [v.hora]: ni } })) }
                              return sessaoRow(
                                v.hora, false,
                                { tP: cur.tP, prof: cur.prof, unidade: ae.unidade },
                                !excl,
                                () => toggleVComp(s.id, v.hora),
                                excl,
                                mkChip(cur.tP, "#1f2937",
                                  uniqTp.map(tp => ({ v: tp, l: tp })),
                                  cur.tP, setVcTp, excl,
                                ),
                                mkChip(fmtName(cur.prof), "#6b7280",
                                  tpPrfs.map(p => ({ v: p, l: fmtName(p) })),
                                  cur.prof, setVcPrf, excl,
                                ),
                              )
                            })}
                            </div>
                          </div>
                        )
                          })
                          return [dayHeader, ...cards]
                        })
                      })()}
                    </div>
              )}
            </div>

            {/* Footer: Fechar + Aceitar selecionados */}
            <div style={{ padding: "8px 14px", borderTop: "1px solid #f0f0f0", background: "#fafafa", borderRadius: "0 0 0 18px", flexShrink: 0, display: "flex", gap: "6px", alignItems: "center", justifyContent: "space-between" }}>
              <button onClick={onClose} style={btnStyle("#f3f4f6", "#374151", "#e5e7eb")}>Fechar</button>
              <button
                disabled={selectedCount === 0 || hasExcesso}
                onClick={() => selectedCount > 0 && !hasExcesso && setConfirmingAceitar(true)}
                style={{
                  ...btnStyle(selectedCount > 0 && !hasExcesso ? B.navy : "#f3f4f6", selectedCount > 0 && !hasExcesso ? "white" : "#9ca3af", selectedCount > 0 && !hasExcesso ? B.navy : "#d1d5db"),
                  opacity: selectedCount === 0 || hasExcesso ? 0.5 : 1,
                }}>
                Aceitar ({selectedCount}) → Acomp.
              </button>
            </div>
          </div>

          {/* ── Direita: grade do cronograma ─────────────────────────────── */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "10px 16px 16px" }}>
            {!horas.length ? (
              <div style={{ textAlign: "center", color: "#9ca3af", padding: "20px" }}>Nenhuma sessão encontrada.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: `${52 + dias.length * 110}px`, width: "100%" }}>
                <colgroup>
                  <col style={{ width: "48px" }} />
                  {dias.map(d => <col key={d} style={{ width: "110px" }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ paddingBottom: "8px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "#9ca3af", fontWeight: 400 }}>Hora</th>
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
                    <tr key={hora} style={{ borderTop: hora === "13:00" ? "2px solid #d1d5db" : "1px solid #f1f5f9" }}>
                      <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "12px", fontWeight: 800, color: B.navy }}>
                        {hora}
                      </td>
                      {dias.map(d => {
                        const cells = cMap[`${d}|||${hora}`] || []
                        return (
                          <td key={d} style={{ padding: "2px", verticalAlign: "top", height: "1px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", height: "100%" }}>
                            {cells.map((c, ci) => {
                              const cs      = cSt(c.tipo)
                              const isDark  = c.tipo === "supervDesloc" || c.tipo === "adminSuperv"
                              const cellKey = `${d}|||${hora}|||${c.tP}|||${c.prof}`
                              const isDisc  = discrepantCellKeys.has(cellKey)
                              return (
                                <div key={ci} style={{ background: cs.bg, border: `1px solid ${isDisc ? "#f97316" : cs.bd}`, borderRadius: "7px", padding: "5px 7px", flex: "1", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px", outline: isDisc ? "2px solid #fed7aa" : "none" }}>
                                  <div style={{ fontSize: "10px", fontWeight: 700, color: isDark ? "white" : "#1f2937", lineHeight: "1.3" }}>{c.tP}</div>
                                  {c.tE && <div style={{ fontSize: "8px", color: "#9ca3af", fontStyle: "italic" }}>({c.tE})</div>}
                                  <div style={{ fontSize: "9px", color: isDark ? "#d1d5db" : "#6b7280" }}>{fmtName(c.prof)}</div>
                                  {isDisc && (
                                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#ea580c", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                                      ⚠ {c.unidade}
                                    </div>
                                  )}
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
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Terceiro painel: autorizado × ofertado ──────────────────── */}
          <div style={{ width: "190px", flexShrink: 0, borderLeft: "2px solid #f1f5f9", display: "flex", flexDirection: "column", padding: "12px 14px", overflowY: "auto", gap: "0" }}>

            {/* Quantidade de Sessões — antes e depois */}
            {(() => {
              const beforeCount = sessPac.length
              const addedCount  = buildSelectedSessoes().length
              const afterCount  = beforeCount + addedCount
              const pct = beforeCount > 0 ? Math.min(100, (afterCount / (beforeCount + 1)) * 100) : 0
              return (
                <div style={{ marginBottom: "14px", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "12px", color: B.navy, marginBottom: "8px" }}>Quantidade de Sessões</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#9ca3af", marginBottom: "2px" }}>Antes</div>
                      <div style={{ fontSize: "18px", fontWeight: 900, color: "#6b7280", lineHeight: 1 }}>{beforeCount}</div>
                    </div>
                    <div style={{ fontSize: "14px", color: "#d1d5db", fontWeight: 700, flexShrink: 0 }}>→</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#9ca3af", marginBottom: "2px" }}>Depois</div>
                      <div style={{ fontSize: "18px", fontWeight: 900, color: addedCount > 0 ? "#16a34a" : "#6b7280", lineHeight: 1 }}>{afterCount}</div>
                    </div>
                    {addedCount > 0 && (
                      <div style={{ marginLeft: "auto" }}>
                        <span style={{ fontSize: "10px", fontWeight: 800, background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", borderRadius: "5px", padding: "1px 5px" }}>
                          +{addedCount}
                        </span>
                      </div>
                    )}
                  </div>
                  {addedCount > 0 && (
                    <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "2px", marginTop: "7px", overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, (beforeCount / afterCount) * 100)}%`, background: "#d1d5db", borderRadius: "2px" }} />
                      <div style={{ position: "absolute", inset: 0, width: "100%", background: "#16a34a", borderRadius: "2px", opacity: 0.35 }} />
                    </div>
                  )}
                  <div style={{ height: "1px", background: "#f1f5f9", margin: "12px 0 0" }} />
                </div>
              )
            })()}

            <div style={{ fontWeight: 800, fontSize: "12px", color: B.navy, marginBottom: "12px", flexShrink: 0 }}>Autorizado × Ofertado</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {pacAllEsp.length === 0 && (
                <div style={{ fontSize: "11px", color: "#9ca3af" }}>Sem autorização registrada.</div>
              )}
              {pacAllEsp.map(g => {
                const sel = selectedByEsp[g.esp] || 0
                const total = g.of + sel
                const excesso = total > g.aut
                const completo = total === g.aut
                const cor = excesso ? "#dc2626" : completo ? "#16a34a" : B.navy
                return (
                  <div key={g.esp}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#374151", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.esp}>{g.esp}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 900, color: cor }}>{total}/{g.aut}</span>
                      {excesso && <span style={{ fontSize: "9px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>acima</span>}
                      {completo && <span style={{ fontSize: "9px", background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: "2px", width: `${Math.min(100, (total / g.aut) * 100)}%`, background: cor, transition: "width .2s" }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {hasExcesso && (
              <div style={{ marginTop: "12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "8px 10px", fontSize: "10px", color: "#dc2626", fontWeight: 700, flexShrink: 0 }}>
                ⚠ Limite ultrapassado. Desmarque sessões em excesso antes de aceitar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ── Modal: ação direta por sessão (✓ aceitar · ✗ recusar · ⛔ inviável) ── */}
    {pendingAcao && (() => {
      const ACAO_META: Record<AcaoDiretaType, { titulo: string; desc: string; cor: string; label: string; placeholder: string }> = {
        aceitar:  { titulo: "✓ Confirmar Aceite",   desc: "Sessão enviada para Acompanhamento → Aguardando Resposta.", cor: "#15803d", label: "Confirmar",     placeholder: "Ex: família confirmou disponibilidade..." },
        recusar:  { titulo: "✗ Confirmar Recusa",   desc: "Sessão registrada como recusada em Aceites e Recusas.",      cor: "#dc2626", label: "Confirmar",     placeholder: "Ex: família recusou por conflito de agenda..." },
        inviavel: { titulo: "⛔ Confirmar Inviável", desc: "Sessão registrada como inviável em Aceites e Recusas.",      cor: B.navy,    label: "Confirmar",     placeholder: "Ex: família não tem disponibilidade neste horário..." },
      }
      const meta = ACAO_META[pendingAcao.acao]
      const isInvAcao = pendingAcao.acao === "inviavel"
      const motivoFaltando = isInvAcao && !acaoMotivo.trim()
      const handleConfirmar = () => {
        if (motivoFaltando) return
        const sessao: AceiteSessao = { dia: pendingAcao.sugestao.dia, hora: pendingAcao.hora, tP: pendingAcao.tP, prof: pendingAcao.prof, unidade: pendingAcao.unidade }
        const statusFinal = pendingAcao.acao === "aceitar" ? "pendente" : pendingAcao.acao === "recusar" ? "recusado" : "inviavel"
        onAcaoDireta([sessao], statusFinal, acaoMotivo || undefined)
        if (pendingAcao.acao === "inviavel") {
          setSt(pendingAcao.sugestao, "inviavel")
          setSelectedIds(prev => { const n = new Set(prev); n.delete(pendingAcao.sugestao.id); return n })
        }
        setPendingAcao(null); setAcaoMotivo("")
      }
      return (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) { setPendingAcao(null); setAcaoMotivo("") } }}
        >
          <div style={{ background: "white", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxWidth: "380px", width: "100%", padding: "22px" }}>
            <div style={{ fontWeight: 900, fontSize: "16px", color: meta.cor, marginBottom: "4px" }}>{meta.titulo}</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>{meta.desc}</div>
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "11px 14px", marginBottom: "12px" }}>
              <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "13px", color: B.navy }}>{pendingAcao.sugestao.dia.replace("-feira", "")} {pendingAcao.hora}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#1f2937", marginTop: "3px" }}>{pendingAcao.tP}</div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginTop: "1px" }}>{fmtName(pendingAcao.prof)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: isInvAcao ? "#dc2626" : "#6b7280" }}>
                Justificativa{isInvAcao ? " *" : " (opcional)"}
              </span>
              {motivoFaltando && (
                <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 600 }}>— obrigatória para Inviável</span>
              )}
            </div>
            <textarea
              value={acaoMotivo}
              onChange={e => setAcaoMotivo(e.target.value)}
              placeholder={meta.placeholder}
              rows={3}
              style={{ width: "100%", border: `1px solid ${motivoFaltando ? "#fca5a5" : "#d1d5db"}`, borderRadius: "10px", padding: "8px 12px", fontSize: "12px", fontFamily: "inherit", resize: "none", marginBottom: motivoFaltando ? "6px" : "16px", boxSizing: "border-box", outline: motivoFaltando ? "none" : undefined }}
            />
            {motivoFaltando && (
              <div style={{ fontSize: "11px", color: "#dc2626", marginBottom: "10px" }}>Descreva o motivo para registrar como inviável.</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleConfirmar}
                disabled={motivoFaltando}
                style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: motivoFaltando ? "#f3f4f6" : meta.cor, color: motivoFaltando ? "#9ca3af" : "white", border: "none", cursor: motivoFaltando ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                {meta.label}
              </button>
              <button onClick={() => { setPendingAcao(null); setAcaoMotivo("") }} style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )
    })()}

    {/* ── Modal: confirmar recusar dia inteiro ── */}
    {pendingRecusarDia && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "16px" }}
        onClick={e => { if (e.target === e.currentTarget) { setMotivoRecusarDia(""); setPendingRecusarDia(null) } }}
      >
        <div style={{ background: "white", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxWidth: "380px", width: "100%", padding: "22px" }}>
          <div style={{ fontWeight: 900, fontSize: "16px", color: "#dc2626", marginBottom: "4px" }}>✗ Recusar todas de {pendingRecusarDia.dia.replace("-feira", "")}</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
            {pendingRecusarDia.sessoes.length} sessão(ões) serão registradas individualmente como recusadas em Aceites e Recusas.
          </div>
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "10px 13px", marginBottom: "14px", maxHeight: "160px", overflowY: "auto" }}>
            {pendingRecusarDia.sessoes.map((s, i) => (
              <div key={i} style={{ fontSize: "11px", fontWeight: 700, color: "#374151", padding: "2px 0" }}>
                <span style={{ fontFamily: "monospace", color: "#dc2626", marginRight: "6px" }}>{s.hora}</span>{s.tP} · {fmtName(s.prof)}
              </div>
            ))}
          </div>
          <textarea
            value={motivoRecusarDia}
            onChange={e => setMotivoRecusarDia(e.target.value)}
            placeholder="Justificativa (opcional) — será repetida em cada sessão recusada"
            rows={3}
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", fontSize: "12px", fontFamily: "inherit", resize: "none", marginBottom: "16px", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => {
                const motivo = motivoRecusarDia.trim() || undefined
                for (const sessao of pendingRecusarDia.sessoes) {
                  onAcaoDireta([sessao], "recusado", motivo)
                }
                setSelectedIds(prev => { const n = new Set(prev); pendingRecusarDia.dayIds.forEach(id => n.delete(id)); return n })
                setMotivoRecusarDia("")
                setPendingRecusarDia(null)
              }}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
              Confirmar recusa
            </button>
            <button
              onClick={() => { setMotivoRecusarDia(""); setPendingRecusarDia(null) }}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: confirmação aceitar ── */}
    {confirmingAceitar && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "16px" }}
        onClick={e => { if (e.target === e.currentTarget) setConfirmingAceitar(false) }}
      >
        <div style={{ background: "white", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxWidth: "440px", width: "100%", padding: "22px" }}>
          <div style={{ fontWeight: 900, fontSize: "16px", color: B.navy, marginBottom: "4px" }}>Confirmar Aceite</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
            As sessões abaixo serão enviadas para Acompanhamento → Aguardando Resposta.
          </div>
          <div style={{ background: B.limeLt, border: `1px solid ${B.lime}`, borderRadius: "12px", padding: "12px", marginBottom: "16px", maxHeight: "220px", overflowY: "auto" }}>
            {buildSelectedSessoes().map((s, i) => (
              <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "12px", color: B.navy, minWidth: "80px" }}>{s.dia.replace("-feira", "")} {s.hora}</span>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#1f2937", flex: 1 }}>{s.tP}</span>
                <span style={{ fontSize: "11px", color: "#6b7280" }}>{fmtName(s.prof)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleAceitar}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
              Confirmar e Enviar
            </button>
            <button
              onClick={() => setConfirmingAceitar(false)}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}
  </>,
  document.body
  )
}

// ─── AceitesPanel ─────────────────────────────────────────────────────────────

const BUNDLE_STATUS_META = {
  pendente:   { label: "Pendente",  bg: "#fef3c7", c: "#92400e", bd: "#fbbf24" },
  confirmado: { label: "Confirmou", bg: "#dcfce7", c: "#14532d", bd: "#86efac" },
  recusado:   { label: "Recusou",   bg: "#fee2e2", c: "#7f1d1d", bd: "#fca5a5" },
  inviavel:   { label: "⛔ Inviável", bg: "#f3f4f6", c: "#6b7280", bd: "#d1d5db" },
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
    <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px", marginTop: "16px" }}>
      <div style={{ fontWeight: 800, color: B.navy, fontSize: "13px", marginBottom: "12px" }}>
        Aceites e Recusas — ocp. paciente
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {pacAceites.map(bundle => {
          const sm = BUNDLE_STATUS_META[bundle.status]
          const d  = new Date(bundle.ts)
          const dateStr = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
          return (
            <div key={bundle.id} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px", background: "#fafafa" }}>
              {/* Bundle header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280" }}>{dateStr}</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#9ca3af", background: "#f3f4f6", padding: "0 6px", borderRadius: "4px" }}>ocp. paciente</span>
                  <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "9px", fontWeight: 800, background: sm.bg, color: sm.c, border: `1px solid ${sm.bd}` }}>{sm.label}</span>
                </div>
                <span style={{ fontSize: "11px", color: "#9ca3af", flexShrink: 0 }}>{bundle.sessoes.length} sessão(ões)</span>
              </div>

              {/* Motivo (bundles recusados ou inviáveis) */}
              {(bundle.status === "inviavel" || bundle.status === "recusado") && bundle.motivo && (
                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "7px 10px", marginBottom: "10px", fontSize: "11px", color: "#6b7280" }}>
                  <span style={{ fontWeight: 700 }}>Justificativa: </span>{bundle.motivo}
                </div>
              )}

              {/* Sessões */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "6px", marginBottom: "10px" }}>
                {bundle.sessoes.map((s, i) => {
                  const slotKey  = `${s.dia}|||${s.hora}`
                  const isInv    = bundle.inviavelSlots.includes(slotKey)
                  const isInvBundle = bundle.status === "inviavel"
                  return (
                    <div key={i} style={{ border: `1px solid ${isInv || isInvBundle ? "#fca5a5" : "#e5e7eb"}`, borderRadius: "8px", padding: "7px 9px", background: isInv || isInvBundle ? "#fff1f2" : "white", opacity: isInv ? 0.7 : 1 }}>
                      <div style={{ fontFamily: "monospace", fontSize: "10px", fontWeight: 800, color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#1f2937", marginTop: "2px" }}>{s.tP}</div>
                      <div style={{ fontSize: "9px", color: "#6b7280" }}>{fmtName(s.prof)}</div>
                      {!isInvBundle && (
                        <button
                          onClick={() => toggleInviavel(bundle.id, slotKey)}
                          style={{ ...btnStyle(isInv ? "#f3f4f6" : "#fef2f2", isInv ? "#6b7280" : "#dc2626", isInv ? "#e5e7eb" : "#fca5a5"), fontSize: "8px", marginTop: "5px", width: "100%", textAlign: "center" }}>
                          {isInv ? "↩ Desfazer" : "⛔ Inviável"}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Ações do bundle */}
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", borderTop: "1px solid #f0f0f0", paddingTop: "8px", alignItems: "center" }}>
                {bundle.status !== "inviavel" && (
                  <>
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
                      <button onClick={() => updateBundle(bundle.id, { status: "pendente" })} style={{ ...btnStyle("#f3f4f6", "#6b7280", "#e5e7eb"), fontSize: "10px" }}>Desfazer</button>
                    )}
                  </>
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
    <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
        <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>Agenda atual do paciente</div>
        <button onClick={onVerAll} style={btnStyle("#f3f4f6", "#374151", "#e5e7eb")}>🗓 Ver aperfeiçoamentos</button>
      </div>
      <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "10px" }}>
        Sessões agendadas{sugestoes.length > 0 ? " + propostas destacadas" : ""}
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        {[
          { bg: "#22c55e", label: "Agendado" },
          ...(sugestoes.length ? [{ bg: "#fef3c7", bd: "#fbbf24", label: "Proposta" }] : []),
        ].map(({ bg, label, bd }: { bg: string; label: string; bd?: string }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: bg, border: bd ? `1px solid ${bd}` : undefined }} />
            <span style={{ fontSize: "11px", color: "#6b7280" }}>{label}</span>
          </div>
        ))}
      </div>

      {!allHoras.length && (
        <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "11px", padding: "16px 0" }}>Nenhuma sessão agendada.</div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", fontSize: "11px", width: `${48 + activeDias.length * 100}px` }}>
          <colgroup>
            <col style={{ width: "48px" }} />
            {activeDias.map(d => <col key={d} style={{ width: "100px" }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: "4px 6px", borderBottom: "2px solid #e5e7eb" }} />
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
                <tr key={hora} style={{ borderTop: isSep ? "2px solid #d1d5db" : "1px solid #f3f4f6" }}>
                  <td style={{ padding: "2px 6px", color: "#9ca3af", fontSize: "10px", fontWeight: 500, height: "40px", verticalAlign: "middle", whiteSpace: "nowrap" }}>{hora}</td>
                  {activeDias.map(d => {
                    const k      = `${d}|||${hora}`
                    const sesses = sessionMap[k]
                    const sugs   = sugMap[k]
                    // Pedido 1: slot tem Supervisão ABA + proposta → célula preta
                    const hasSupervConflict = sesses?.includes("Supervisão ABA") && !!sugs?.length

                    if (hasSupervConflict) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "#111827", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 6px", gap: "2px" }}>
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

interface Props {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  cfg: CfgState
  rec?: RecItem[]
  inv?: InvItem[]
  sRec?: (rec: RecItem[]) => void
  sInv?: (inv: InvItem[]) => void
}

export function OcupPacMode({ cRows, lRows, cfg, rec: recGlobal = [], inv: invGlobal = [], sRec, sInv }: Props) {
  const [pac, setPac]           = useState("")
  const [inputVal, setInputVal] = useState("")
  const [dropOpen, setDropOpen] = useState(false)
  const [estrategia, setEstrategia] = useState<Estrategia>("S1")
  const [maxAdic, setMaxAdic]   = useState<number | "">("")
  const [statusMap, setStatusMap] = useState<Record<string, Status>>(() => {
    try { return JSON.parse(localStorage.getItem(SK) || "{}") } catch { return {} }
  })
  const [showModal, setShowModal]   = useState(false)
  const [resumoOpen, setResumoOpen] = useState(true)
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

  function handleInviavel(sessoes: AceiteSessao[], motivo: string) {
    if (!sessoes.length) return
    const bundle: AceitePacBundle = {
      id: `inv_${Date.now()}_${pac.slice(0, 8)}`,
      pac, ts: Date.now(),
      origem: "ocp-paciente",
      sessoes,
      status: "inviavel",
      inviavelSlots: [],
      motivo,
    }
    persistAceites([...aceites, bundle])
  }

  function handleAcaoDireta(sessoes: AceiteSessao[], status: "pendente" | "recusado" | "inviavel", motivo?: string) {
    if (!sessoes.length) return
    const bundle: AceitePacBundle = {
      id: `${status}_${Date.now()}_${pac.slice(0, 8)}`,
      pac, ts: Date.now(),
      origem: "ocp-paciente",
      sessoes, status,
      inviavelSlots: [],
      motivo,
    }
    persistAceites([...aceites, bundle])

    // Espelha em "Aceites e Recusas" (contexto global)
    if (status === "recusado" && sRec) {
      const registradoEm = new Date().toLocaleDateString("pt-BR")
      const newItems: RecItem[] = sessoes.map(s => ({
        paciente: pac,
        profissional: s.prof,
        especialidade: s.tP,
        unidade: s.unidade,
        dia: s.dia,
        hora: s.hora,
        registradoEm,
      }))
      sRec([...recGlobal, ...newItems])
    }

    if (status === "inviavel" && sInv && !invGlobal.some(x => x.paciente === pac)) {
      sInv([...invGlobal, {
        paciente: pac,
        motivo: motivo || "",
        registradoEm: new Date().toLocaleDateString("pt-BR"),
      }])
    }
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

  // Lista de nomes canônicos do agend ordenados por comprimento decrescente.
  // Usada por agendMergeMap para encontrar o nome canônico mais curto.
  const agendNamesByLen = useMemo(() => {
    const s = new Set<string>()
    for (const r of agend) {
      const p = r["Nome Favorecido"]
      if (p && !PACS_ADMIN.has(p)) s.add(p)
    }
    return [...s].sort((a, b) => b.length - a.length)
  }, [agend])

  // Mapeia variantes de nome do agend para o nome canônico mais curto.
  // Ex: "Pietro Ferreira D'Ávila" → "Pietro Ferreira" quando ambos existem no agend.
  const agendMergeMap = useMemo(() => {
    const byLen = [...agendNamesByLen].reverse() // shortest first
    const m = new Map<string, string>()
    for (const name of byLen) {
      const nn = normalizeName(name)
      let canonical = name
      // Find the shortest existing agend name that is a prefix of this one
      for (const shorter of byLen) {
        if (shorter.length >= name.length) continue
        const ns = normalizeName(shorter)
        if (ns.split(" ").length >= 2 && nn.startsWith(ns + " ")) {
          canonical = shorter
          break
        }
      }
      m.set(name, canonical)
    }
    return m
  }, [agendNamesByLen])

  // Mapa: "ID Favorecido" do lRows → nome canônico do agend.
  // Substitui a junção por nome normalizado — mais confiável e independente de encoding.
  const agendIdMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of agend) {
      const id  = String(r["Id Favorecido"] ?? r["ID Favorecido"] ?? "").trim()
      const rawP = r["Nome Favorecido"]
      if (id && rawP && !PACS_ADMIN.has(rawP)) {
        const p = agendMergeMap.get(rawP) ?? rawP
        if (!m.has(id)) m.set(id, p)
      }
    }
    return m
  }, [agend, agendMergeMap])

  const gapMap = useMemo(() => {
    if (!cRows.length || !lRows.length) return {} as Record<string, { dif: number; aut: number; of: number }>
    const qtdOf: Record<string, number> = {}
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP || PACS_ADMIN.has(rawP) || EXCLUIR_GAPS.has(r.Terapia)) continue
      const p = agendMergeMap.get(rawP) ?? rawP
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp) continue
      qtdOf[`${p}|||${esp}`] = (qtdOf[`${p}|||${esp}`] || 0) + 1
    }
    const qtdAut: Record<string, number> = {}
    const altaSet = new Set<string>()
    for (const l of lRows) {
      const idFav = String(l["ID Favorecido"] ?? l["Id Favorecido"] ?? "").trim()
      const p     = (idFav ? agendIdMap.get(idFav) : undefined) ?? String(l["Paciente"] || "").trim()
      const esp   = String(l["Especialidade"] || "").trim()
      if (!p || PACS_ADMIN.has(p) || !esp) continue
      if (isLaudoComAlta(l)) { altaSet.add(`${p}|||${esp}`); continue }
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
      result[k] = { dif, aut, of: of_ }
    }
    return result
  }, [cRows, lRows, agend, agendIdMap, agendMergeMap])

  const todosPacs = useMemo(() => {
    const pacs = new Set<string>()
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP || PACS_ADMIN.has(rawP)) continue
      pacs.add(agendMergeMap.get(rawP) ?? rawP)
    }
    return [...pacs].sort()
  }, [agend, agendMergeMap])

  const pacStatusMap = useMemo((): Record<string, "deficit" | "em-dia" | "deficit-sobre" | "sobreofertado" | "sem-laudo"> => {
    // Detecta quem tem QUALQUER laudo com Qtd > 0 (independe de Situação).
    const temLaudo = new Set<string>()
    for (const l of lRows) {
      const idFav = String(l["ID Favorecido"] ?? l["Id Favorecido"] ?? "").trim()
      const p     = (idFav ? agendIdMap.get(idFav) : undefined) ?? String(l["Paciente"] || "").trim()
      if (!p || PACS_ADMIN.has(p)) continue
      const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
      if (aut > 0) temLaudo.add(p)
    }
    // Agrupa os difs por paciente a partir do gapMap (já calculado, inclui dif ≤ 0).
    const pacDifs: Record<string, number[]> = {}
    for (const [k, v] of Object.entries(gapMap)) {
      const [p] = k.split("|||")
      if (!pacDifs[p]) pacDifs[p] = []
      pacDifs[p].push(v.dif)
    }
    const result: Record<string, "deficit" | "em-dia" | "deficit-sobre" | "sobreofertado" | "sem-laudo"> = {}
    for (const p of todosPacs) result[p] = temLaudo.has(p) ? "em-dia" : "sem-laudo"
    for (const [p, difs] of Object.entries(pacDifs)) {
      const hasDeficit = difs.some(d => d > 0)
      const hasSobre   = difs.some(d => d < 0)
      if      (hasDeficit && hasSobre) result[p] = "deficit-sobre"
      else if (hasDeficit)             result[p] = "deficit"
      else if (hasSobre)               result[p] = "sobreofertado"
      else                             result[p] = "em-dia"
    }
    return result
  }, [gapMap, todosPacs, lRows, agendIdMap])

  const pacIdMap = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "")
    const TARGET = normalize("id favorecido")
    const findId = (r: Record<string, unknown>): string => {
      const exact = r["Id Favorecido"] ?? r["ID Favorecido"] ?? r["id favorecido"]
      if (exact != null) return String(exact).trim()
      // fallback: case/space-insensitive scan
      for (const key of Object.keys(r)) {
        if (normalize(key) === TARGET) return String(r[key] ?? "").trim()
      }
      return ""
    }
    const m: Record<string, string> = {}
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP) continue
      const p = agendMergeMap.get(rawP) ?? rawP
      const id = findId(r as Record<string, unknown>)
      if (id && !m[p]) m[p] = id
    }
    return m
  }, [agend, agendMergeMap])

  const pacConvMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of lRows) {
      const p = String(l["Paciente"] || "").trim()
      const plano = String(l["Plano"] || "").trim()
      if (p && plano) m[p] = plano
    }
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP) continue
      const p = agendMergeMap.get(rawP) ?? rawP
      if (m[p]) continue
      const conv = r["Convênio"]
      if (conv) m[p] = conv
    }
    return m
  }, [lRows, agend, agendMergeMap])

  const [convFilter, setConvFilter]       = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter]   = useState<Set<string>>(new Set())
  const [situacaoOpen, setSituacaoOpen]   = useState(true)
  const [convOpen, setConvOpen]           = useState(false)

  const convenios = useMemo(() => {
    const s = new Set<string>()
    for (const p of todosPacs) { const c = pacConvMap[p]; if (c) s.add(c) }
    return [...s].sort()
  }, [todosPacs, pacConvMap])

  const countBySituacao = useMemo(() => {
    const q = inputVal.toLowerCase()
    const base = todosPacs.filter(p =>
      (convFilter.size === 0 || convFilter.has(pacConvMap[p] || "")) &&
      (!q || p.toLowerCase().includes(q))
    )
    const counts: Record<string, number> = { todos: base.length }
    for (const p of base) {
      const st = pacStatusMap[p] || "sem-laudo"
      counts[st] = (counts[st] || 0) + 1
    }
    return counts
  }, [todosPacs, convFilter, pacConvMap, pacStatusMap, inputVal])

  const countByConv = useMemo(() => {
    const q = inputVal.toLowerCase()
    const base = todosPacs.filter(p =>
      (statusFilter.size === 0 || statusFilter.has(pacStatusMap[p] || "sem-laudo")) &&
      (!q || p.toLowerCase().includes(q))
    )
    const counts: Record<string, number> = { "": base.length }
    for (const p of base) {
      const c = pacConvMap[p]
      if (c) counts[c] = (counts[c] || 0) + 1
    }
    return counts
  }, [todosPacs, statusFilter, pacStatusMap, pacConvMap, inputVal])

  const filteredPacs = useMemo(() => {
    return todosPacs
      .filter(p => convFilter.size === 0 || convFilter.has(pacConvMap[p] || ""))
      .filter(p => statusFilter.size === 0 || statusFilter.has(pacStatusMap[p] || "sem-laudo"))
      .filter(p => !inputVal.trim() || p.toLowerCase().includes(inputVal.toLowerCase()))
  }, [todosPacs, inputVal, convFilter, pacConvMap, statusFilter, pacStatusMap])

  const pacAllRows   = useMemo(() => agend.filter(r => (agendMergeMap.get(r["Nome Favorecido"] ?? "") ?? r["Nome Favorecido"]) === pac), [pac, agend, agendMergeMap])
  const currentSlots = useMemo(() => countSlots(pacAllRows), [pacAllRows])

  const pacGaps = useMemo((): GapInfo[] =>
    Object.entries(gapMap)
      .filter(([k]) => k.startsWith(`${pac}|||`))
      .map(([k, v]) => ({ esp: k.split("|||")[1], ...v }))
      .filter(v => v.dif > 0)
      .sort((a, b) => b.dif - a.dif),
    [pac, gapMap])

  // Todas as especialidades do paciente (com déficit, zeradas ou sobreofertadas)
  const pacAllEsp = useMemo((): GapInfo[] => {
    if (!pac) return []
    const qtdOf: Record<string, number> = {}
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP || EXCLUIR_GAPS.has(r.Terapia)) continue
      if ((agendMergeMap.get(rawP) ?? rawP) !== pac) continue
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (esp) qtdOf[esp] = (qtdOf[esp] || 0) + 1
    }
    const qtdAut: Record<string, number> = {}
    const altaSet = new Set<string>()
    for (const l of lRows) {
      const idFav = String(l["ID Favorecido"] ?? l["Id Favorecido"] ?? "").trim()
      const p     = (idFav ? agendIdMap.get(idFav) : undefined) ?? String(l["Paciente"] || "").trim()
      if (p !== pac) continue
      const esp = String(l["Especialidade"] || "").trim()
      if (!esp) continue
      if (isLaudoComAlta(l)) { altaSet.add(esp); continue }
      const aut = parseFloat(String(l["Qtd autorizada"] || "0").replace(",", ".")) || 0
      if (aut <= 0) continue
      if (!qtdAut[esp] || aut > qtdAut[esp]) qtdAut[esp] = aut
    }
    for (const esp of altaSet) delete qtdAut[esp]
    return Object.entries(qtdAut)
      .map(([esp, aut]) => ({ esp, aut, of: qtdOf[esp] || 0, dif: Math.round((aut - (qtdOf[esp] || 0)) * 10) / 10 }))
      .sort((a, b) => b.dif - a.dif)
  }, [pac, agend, lRows, agendIdMap, agendMergeMap])

  const sugestoes = useMemo(() => {
    if (!pac || estrategia !== "S1") return [] as Sugestao[]
    return buildSugestoes(pac, agend, agendClin, cRows, gapMap, aceites)
  }, [pac, estrategia, agend, agendClin, cRows, gapMap, aceites])

  useEffect(() => {
    if (!pac) return
    const valid = new Set(sugestoes.map(s => `${pac}|||${s.id}`))
    setStatusMap(prev => {
      const stale = Object.keys(prev).filter(k => k.startsWith(`${pac}|||`) && !valid.has(k))
      if (!stale.length) return prev
      const pruned = { ...prev }
      for (const k of stale) delete pruned[k]
      try { localStorage.setItem(SK, JSON.stringify(pruned)) } catch {}
      return pruned
    })
  }, [pac, sugestoes])

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
    return Object.entries(counts).map(([t, v]) => ({ name: TIPO_LABELS[t] || t, value: v, fill: TIPO_COLORS[t] || "#9ca3af" }))
  }, [sugestoesLimitadas])

  function selectPac(p: string) { setPac(p); setInputVal(p); setDropOpen(false); setShowModal(true) }

  return (
    <>
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

        {/* ── Coluna esquerda ─────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, width: "340px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Seletor de paciente */}
          <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "15px", marginBottom: "4px" }}>
              Aumentar Ocupação — Paciente
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
              Selecione um paciente e explore as estratégias disponíveis.
            </div>

            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "6px" }}>Paciente</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setPac(""); setDropOpen(true) }}
                onFocus={() => { setInputVal(""); setDropOpen(true) }}
                onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                placeholder="Buscar paciente..."
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: "9px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "var(--color-card, white)", color: "inherit" }}
              />
              {dropOpen && filteredPacs.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "white", border: "1px solid #d1d5db", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", maxHeight: "200px", overflowY: "auto" }}>
                  {filteredPacs.map(p => {
                    const st  = pacStatusMap[p]
                    const dot = st === "deficit" ? "#dc2626" : st === "deficit-sobre" ? "#ea580c" : st === "em-dia" ? "#16a34a" : st === "sobreofertado" ? "#d97706" : "#d1d5db"
                    return (
                      <button key={p} onMouseDown={() => selectPac(p)}
                        style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left", padding: "8px 12px", background: p === pac ? "#f3f4f6" : "none", border: "none", fontSize: "12px", cursor: "pointer", color: p === pac ? B.navy : "#374151", fontWeight: p === pac ? 700 : 400, fontFamily: "inherit" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
                        {p}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "6px" }}>Limite de sessões adicionais</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {["sem limite", 1, 2, 3, 4, 5].map(v => {
                  const val = v === "sem limite" ? "" : v as number
                  const active = maxAdic === val
                  return (
                    <button key={String(v)} onClick={() => setMaxAdic(val)}
                      style={{ padding: "4px 10px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid", background: active ? B.navy : "#f3f4f6", color: active ? "white" : "#374151", borderColor: active ? B.navy : "#d1d5db" }}>
                      {v === "sem limite" ? "∞" : `+${v}`}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "5px" }}>
                {maxAdic === "" ? "Sem restrição de quantidade." : `Máximo de ${maxAdic} sessão(ões) adicionais ao total atual.`}
              </div>
            </div>
          </div>

          {/* Filtro por situação */}
          <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <button onClick={() => setSituacaoOpen(v => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280" }}>Filtrar por Situação</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {statusFilter.size > 0 && <span style={{ fontSize: "10px", fontWeight: 700, color: B.navy }}>{statusFilter.size} ativo{statusFilter.size !== 1 ? "s" : ""}</span>}
                <span style={{ fontSize: "9px", color: "#9ca3af" }}>{situacaoOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {situacaoOpen && (
              <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {([
                  { key: "em-dia",        label: "Autorização = Oferta",               color: "#16a34a" },
                  { key: "deficit",       label: "Acrescentar",                        color: "#dc2626" },
                  { key: "deficit-sobre", label: "Acrescentar & Contém Sobreoferta",   color: "#ea580c" },
                  { key: "sobreofertado", label: "Sobreofertado & Nada P/ Acrescentar",color: "#d97706" },
                  { key: "sem-laudo",     label: "Sem autorização registrada",         color: "#6b7280" },
                ] as const).map(({ key, label, color }) => {
                  const isActive = statusFilter.has(key)
                  const count = countBySituacao[key] ?? 0
                  const toggle = () => setStatusFilter(prev => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key); else next.add(key)
                    return next
                  })
                  return (
                    <button key={key} onClick={toggle} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", border: `1px solid ${isActive ? color : "#e5e7eb"}`,
                      background: isActive ? color : "#f9fafb", color: isActive ? "white" : "#374151", textAlign: "left",
                    }}>
                      <span>{label}</span>
                      <span style={{ fontSize: "10px", fontWeight: 800, background: isActive ? "rgba(255,255,255,0.25)" : "#e5e7eb", color: isActive ? "white" : "#6b7280", borderRadius: "10px", padding: "1px 7px", minWidth: "20px", textAlign: "center" }}>
                        {count}
                      </span>
                    </button>
                  )
                })}
                {statusFilter.size > 0 && (
                  <button onClick={() => setStatusFilter(new Set())} style={{
                    marginTop: "2px", padding: "4px 10px", borderRadius: "7px", fontSize: "10px", fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", border: "1px solid #e5e7eb",
                    background: "#f9fafb", color: "#6b7280", textAlign: "center",
                  }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filtro por convênio */}
          <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <button onClick={() => setConvOpen(v => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280" }}>Filtrar por Convênio</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {convFilter.size > 0 && <span style={{ fontSize: "10px", fontWeight: 700, color: B.navy }}>{convFilter.size} ativo{convFilter.size !== 1 ? "s" : ""}</span>}
                <span style={{ fontSize: "9px", color: "#9ca3af" }}>{convOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {convOpen && (
              <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {convenios.map(c => {
                  const isActive = convFilter.has(c)
                  const count = countByConv[c] ?? 0
                  const toggle = () => setConvFilter(prev => {
                    const next = new Set(prev)
                    if (next.has(c)) next.delete(c); else next.add(c)
                    return next
                  })
                  return (
                    <button key={c} onClick={toggle} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", border: `1px solid ${isActive ? B.navy : "#e5e7eb"}`,
                      background: isActive ? B.navy : "#f9fafb", color: isActive ? "white" : "#374151", textAlign: "left",
                    }}>
                      <span>{c}</span>
                      <span style={{ fontSize: "10px", fontWeight: 800, background: isActive ? "rgba(255,255,255,0.25)" : "#e5e7eb", color: isActive ? "white" : "#6b7280", borderRadius: "10px", padding: "1px 7px", minWidth: "20px", textAlign: "center" }}>
                        {count}
                      </span>
                    </button>
                  )
                })}
                {convFilter.size > 0 && (
                  <button onClick={() => setConvFilter(new Set())} style={{
                    marginTop: "2px", padding: "4px 10px", borderRadius: "7px", fontSize: "10px", fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", border: "1px solid #e5e7eb",
                    background: "#f9fafb", color: "#6b7280", textAlign: "center",
                  }}>
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Exportar relatório */}
          {(() => {
            const SITUACAO_LABEL: Record<string, string> = {
              deficit: "Acrescentar",
              "deficit-sobre": "Acrescentar & Contém Sobreoferta",
              "em-dia": "Autorização = Oferta",
              sobreofertado: "Sobreofertado & Nada P/ Acrescentar",
              "sem-laudo": "Sem autorização registrada",
            }
            const handleExport = () => {
              // "Autorizado em" mais recente por paciente (DD/MM/YYYY)
              const toSortable = (d: string) => {
                const [dd, mm, yyyy] = d.split("/")
                return yyyy && mm && dd ? `${yyyy}${mm}${dd}` : ""
              }
              const pacAutEmMap: Record<string, string> = {}
              for (const l of lRows) {
                const idFav = String(l["ID Favorecido"] ?? l["Id Favorecido"] ?? "").trim()
                const p     = (idFav ? agendIdMap.get(idFav) : undefined) ?? String(l["Paciente"] || "").trim()
                if (!p || PACS_ADMIN.has(p)) continue
                const raw = String(l["Autorizado em"] || "").trim()
                if (!raw) continue
                if (!pacAutEmMap[p] || toSortable(raw) > toSortable(pacAutEmMap[p])) {
                  pacAutEmMap[p] = raw
                }
              }

              const rows = todosPacs.map(p => {
                const st = pacStatusMap[p]
                let sobreoferta = ""
                if (st === "deficit-sobre" || st === "sobreofertado") {
                  sobreoferta = Object.entries(gapMap)
                    .filter(([k, v]) => k.startsWith(`${p}|||`) && v.dif < 0)
                    .map(([k, v]) => `${k.split("|||")[1]}: ${v.of}/${v.aut}`)
                    .join("; ")
                }
                return {
                  "ID Favorecido": pacIdMap[p] || "—",
                  "Nome": p,
                  "Convênio": pacConvMap[p] || "—",
                  "Situação": SITUACAO_LABEL[st] || "—",
                  "Sobreoferta": sobreoferta || "—",
                  "Autorizado em": pacAutEmMap[p] || "—",
                }
              })
              const ws = XLSX.utils.json_to_sheet(rows)
              ws["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 28 }, { wch: 30 }, { wch: 40 }, { wch: 16 }]
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, "Pacientes")
              XLSX.writeFile(wb, "relatorio_pacientes.xlsx")
            }
            return (
              <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151" }}>Relatório de Pacientes</div>
                  <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px" }}>{todosPacs.length} pacientes · ID, Nome, Convênio, Situação, Autorizado em</div>
                </div>
                <button
                  onClick={handleExport}
                  style={{ flexShrink: 0, padding: "6px 12px", borderRadius: "8px", border: "1px solid #d1fae5", background: "#ecfdf5", color: "#065f46", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}>
                  ↓ XLSX
                </button>
              </div>
            )
          })()}

          {/* Resumo e gaps */}
          {pac && (
            <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <button onClick={() => setResumoOpen(v => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: "12px 16px", fontFamily: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280" }}>Resumo</span>
                  <span style={{ fontSize: "9px", fontWeight: 700, background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "4px", padding: "0 5px" }}>Em breve</span>
                </div>
                <span style={{ fontSize: "9px", color: "#9ca3af" }}>{resumoOpen ? "▲" : "▼"}</span>
              </button>
              {resumoOpen && (
              <div style={{ padding: "0 16px 16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
                {[
                  { label: "Sessões atuais",        value: currentSlots,                color: B.navy },
                  { label: "Terapias com déficit",   value: pacGaps.length,              color: pacGaps.length > 0 ? "#dc2626" : "#9ca3af" },
                  { label: "Sugestões disponíveis",  value: sugestoesLimitadas.length,   color: sugestoesLimitadas.length > 0 ? "#16a34a" : "#9ca3af" },
                  { label: "Em Acompanhamento",      value: totalAceitos,                color: totalAceitos > 0 ? B.blue : "#9ca3af" },
                  ...(maxAdic !== "" ? [{ label: "Restam aceitar", value: Math.max(0, (maxAdic as number) - totalAceitos), color: totalAceitos >= (maxAdic as number) ? "#dc2626" : B.navy }] : []),
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#6b7280" }}>{label}</span>
                    <span style={{ fontSize: "14px", fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {pacAllEsp.length > 0 && (
                <>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>POR ESPECIALIDADE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "14px" }}>
                    {pacAllEsp.map(g => {
                      const excesso = g.of > g.aut
                      const ok      = g.of === g.aut
                      const difColor = excesso ? "#dc2626" : ok ? "#16a34a" : "#dc2626"
                      const difLabel = excesso ? `+${Math.abs(g.dif)}` : ok ? "✓" : `−${g.dif}`
                      return (
                        <div key={g.esp} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <div style={{ flex: 1, fontSize: "11px", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.esp}</div>
                          <span style={{ fontSize: "10px", color: "#9ca3af", flexShrink: 0 }}>{g.of}/{g.aut}</span>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: difColor, flexShrink: 0 }}>{difLabel}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {gapChartData.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>DÉFICIT (gráfico)</div>
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
                          <span style={{ fontSize: "10px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{d.name}</span>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#374151", flexShrink: 0 }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tipoChartData.length > 0 && (
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "6px" }}>SUGESTÕES POR TIPO</div>
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
                          <span style={{ fontSize: "10px", color: "#6b7280" }}>{d.name}</span>
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#374151", marginLeft: "auto" }}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              </div>
              )}
            </div>
          )}
          {pac && (
            <button
              onClick={() => setShowModal(true)}
              style={{ width: "100%", marginTop: "8px", padding: "12px", borderRadius: "12px", border: `1px solid ${B.navy}`, background: B.navy, color: "white", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              🗓 Ver aperfeiçoamentos
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <TodasSugestoesModal
          key={pac}
          pac={pac}
          conv={pacConvMap[pac] || ""}
          cRows={cRows}
          sugestoes={sugestoesLimitadas}
          pacGaps={pacGaps}
          pacAllEsp={pacAllEsp}
          stOf={stOf}
          setSt={setSt}
          onClose={() => setShowModal(false)}
          estrategia={estrategia}
          setEstrategia={setEstrategia}
          onAceitar={handleAceitar}
          onInviavel={handleInviavel}
          onAcaoDireta={handleAcaoDireta}
        />
      )}
    </>
  )
}

// ─── SugestaoCard ─────────────────────────────────────────────────────────────

function SugestaoCard({
  sugestao, stOf, setSt, limitReached, onInviavel,
}: {
  sugestao: Sugestao
  stOf: (s: Sugestao) => Status | null
  setSt: (s: Sugestao, st: Status | null) => void
  limitReached: boolean
  onInviavel?: (sessoes: AceiteSessao[], motivo: string) => void
}) {
  const [pendingInv, setPendingInv] = useState(false)
  const [invMotivo, setInvMotivo]   = useState("")

  const st  = stOf(sugestao)
  const stM = st ? STATUS_META[st] : null

  const TIPO_META = {
    adjacente:  { label: "Adjacente", bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
    "dia-novo": { label: "Dia novo",  bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  }
  const tm = TIPO_META[sugestao.tipo]

  return (
    <>
    <div style={{
      border: `1px solid ${st === "acompanhamento" ? B.blue + "44" : "#e5e7eb"}`,
      borderRadius: "10px", padding: "10px 12px",
      background: st === "acompanhamento" ? "#f8fafc" : "white",
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
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#1f2937", marginTop: "1px" }}>{sugestao.tP}</div>
        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>
          {fmtName(sugestao.prof)}
          <span style={{ color: "#9ca3af", marginLeft: "5px" }}>· {sugestao.unidade}</span>
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
          <button onClick={() => { setPendingInv(true); setInvMotivo("") }} style={btnStyle("#fef2f2", "#dc2626", "#fca5a5")}>
            ⛔ Inviável
          </button>
        )}
        {st === "inviavel" && (
          <button onClick={() => setSt(sugestao, null)} style={btnStyle("#f3f4f6", "#6b7280", "#e5e7eb")}>
            Desfazer
          </button>
        )}
      </div>
    </div>

    {/* Modal de confirmação inviável */}
    {pendingInv && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
        onClick={e => { if (e.target === e.currentTarget) { setPendingInv(false); setInvMotivo("") } }}
      >
        <div style={{ background: "white", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "22px" }}>
          <div style={{ fontWeight: 900, fontSize: "16px", color: B.navy, marginBottom: "4px" }}>⛔ Confirmar Inviável</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
            A proposta será removida de todas as sugestões e registrada em Aceites e Recusas.
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "11px 14px", fontSize: "13px", fontWeight: 700, color: B.navy, marginBottom: "12px" }}>
            {sugestao.dia.replace("-feira", "")} {sugestao.hora} · {sugestao.tP}
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "5px" }}>Justificativa (opcional)</div>
          <textarea
            value={invMotivo}
            onChange={e => setInvMotivo(e.target.value)}
            placeholder="Ex: família não tem disponibilidade neste horário..."
            rows={3}
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", fontSize: "12px", fontFamily: "inherit", resize: "none", marginBottom: "16px", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => {
                setSt(sugestao, "inviavel")
                onInviavel?.([{ dia: sugestao.dia, hora: sugestao.hora, tP: sugestao.tP, prof: sugestao.prof, unidade: sugestao.unidade }], invMotivo)
                setPendingInv(false); setInvMotivo("")
              }}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
              Confirmar
            </button>
            <button
              onClick={() => { setPendingInv(false); setInvMotivo("") }}
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function btnStyle(bg: string, color: string, border: string): CSSProperties {
  return { padding: "5px 10px", borderRadius: "8px", background: bg, color, border: `1px solid ${border}`, fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }
}
