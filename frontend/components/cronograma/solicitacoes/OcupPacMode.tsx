"use client"

import * as XLSX from "xlsx"
import toast from "react-hot-toast"
import { type CSSProperties, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import {
  ABA_EXIB_PSICO_NAMES, B, DIAS_LIST, DIAS_ORD, EXCLUIR_OCUP, EXIB_NOME,
  HORAS_GRID, PACS_ADMIN, TERAPIA_TO_ESP, isProfBloqueadoTemp,
} from "@/lib/cronograma/constants"
import {
  buildCronoUnitMeta, fm, fmtName, isLaudoComAlta, pm,
  shouldShowSessionUnit, unidadeBadgeText,
} from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import { ConfirmarImplantacaoModal } from "./ConfirmarImplantacaoModal"
import type { CsvRow, LaudoRow, CfgState, RecItem, InvItem } from "@/types/cronograma"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"

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

interface GapInfo { esp: string; aut: number; of: number; dif: number; reservado?: number }

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
  inviavel:       { label: "Inviável",           bg: "var(--muted)", c: "var(--muted-foreground)" },
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ABA_EXT_NAMES = new Set(["Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa"])
const EXCLUIR_GAPS  = new Set([
  "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Escola/Casa",
])
// Terapias vedadas para ASSIM Saúde, salvo exceção judicial LIMINAR com gap > 0
const ASSIM_RESTR_TERAPIAS = new Set(["Fisioterapia Aquática", "Equoterapia"])
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
  conv = "",
  isLiminar = false,
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
  // CRON-008: slots já reservados (implantação imediata) por OUTROS pacientes — vagas
  // ainda "Livre" no CSV mas comprometidas, não podem ser sugeridas para ninguém mais.
  const slotsReservadosOutros = new Set<string>()
  for (const bundle of aceites) {
    if (bundle.pac === pac || bundle.status !== "confirmado") continue
    for (const s of bundle.sessoes) slotsReservadosOutros.add(`${s.prof}|||${s.dia}|||${s.hora}`)
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

  const isAssimSaude = /assim/i.test(conv)
  const seenFree = new Set<string>()
  const allFreeRows: Array<CsvRow & { _hMin: number; _hora: string }> = []
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Livre") continue
    if (isProfBloqueadoTemp(r.Profissional)) continue
    if (EXCLUIR_OCUP.has(r.Terapia)) continue
    const esp = TERAPIA_TO_ESP[r.Terapia]
    if (!esp || !espDif[esp]) continue
    // ASSIM Saúde: Fisioterapia Aquática e Equoterapia só se o paciente for LIMINAR (gap > 0 já garantido pelo check acima)
    if (isAssimSaude && ASSIM_RESTR_TERAPIAS.has(r.Terapia) && !isLiminar) continue
    if (pacUnidades.size > 0 && !pacUnidades.has(rowUnid(r))) continue
    const h = hMin(r)
    if (!isTurnoOk(h)) continue
    const canonical = fm(h)
    if (!canonical) continue
    if (slotsReservadosOutros.has(`${r.Profissional}|||${r["Dia da Semana"]}|||${canonical}`)) continue
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

    // Invariante: todo tP em espAlts e profAlts vem de buildEntry(), que usa CsvRow real
    // (Profissional + Terapia + Status=Livre). allEsps e allProfs no render são a única
    // fonte de verdade para terapias e profissionais disponíveis — não há terapia elegível
    // sem profissional correspondente.
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

  // Nenhum corte por quantidade: todas as sugestões válidas (adjacente e dia-novo)
  // são retornadas — o único descarte por slot já ocorreu acima via `slotFinal`,
  // que evita duas sugestões diferentes disputando o mesmo dia+hora.
  return slotFiltered
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
  estrategia: Estrategia; setEstrategia: (e: Estrategia) => void
  onAceitar: (bundle: { sessoes: AceiteSessao[]; beforeCount: number }) => void
  onInviavel: (sessoes: AceiteSessao[], motivo: string) => void
  onAcaoDireta: (sessoes: AceiteSessao[], status: "pendente" | "recusado" | "inviavel", motivo?: string) => void
  recusadasSet: Set<string>
  onUndoRecusa: (dia: string, hora: string, tP: string, prof: string) => void
  /** CRON-008: sessões já reservadas (implantação imediata) deste paciente — exibidas
   * diretamente na grade como "Reservado", fora do fluxo normal de sugestões. */
  reservasConfirmadas: AceiteSessao[]
}

export interface TodasSugestoesModalHandle {
  selectAll: () => void
  clearAll: () => void
}

const TodasSugestoesModal = forwardRef<TodasSugestoesModalHandle, TodasSugestoesModalProps>(function TodasSugestoesModal({
  pac, conv, cRows, sugestoes, pacGaps, pacAllEsp, stOf, setSt,
  estrategia, setEstrategia, onAceitar, onInviavel, onAcaoDireta,
  recusadasSet, onUndoRecusa, reservasConfirmadas,
}: TodasSugestoesModalProps, ref: React.Ref<TodasSugestoesModalHandle>) {
  const [selIdx, setSelIdx]         = useState<Record<string, Record<string, number>>>({})
  const [profSelIdx, setProfSelIdx] = useState<Record<string, number>>({})
  const [espSelIdx, setEspSelIdx]   = useState<Record<string, number>>({})
  // Confirma que o profissional foi explicitamente escolhido no wizard multi-terapia
  const [profConfirmed, setProfConfirmed] = useState<Set<string>>(() => new Set())
  // Proposals começam no estado "Proposta" (não analisadas).
  // O usuário aceita clicando no card da grade ou no checkbox do Col 1.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // Ação direta por sessão (✗ / ⛔)
  const [pendingAcao, setPendingAcao] = useState<PendingAcaoInfo | null>(null)
  const [acaoMotivo, setAcaoMotivo]   = useState("")
  // vComps excluídos individualmente: { sugestaoId: Set<hora> }
  const [vcExcluded, setVcExcluded] = useState<Record<string, Set<string>>>({})

  // Seletor inline de profissional: id do card expandido na grade
  const [expandedProfCardId, setExpandedProfCardId] = useState<string | null>(null)
  useEffect(() => {
    if (!expandedProfCardId) return
    const close = (e: MouseEvent) => {
      if ((e.target as Element)?.closest("[data-prof-dropdown]")) return
      setExpandedProfCardId(null)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [expandedProfCardId])

  // Seletor inline de terapia: id do card expandido na grade
  const [expandedEspCardId, setExpandedEspCardId] = useState<string | null>(null)
  useEffect(() => {
    if (!expandedEspCardId) return
    const close = (e: MouseEvent) => {
      if ((e.target as Element)?.closest("[data-esp-dropdown]")) return
      setExpandedEspCardId(null)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [expandedEspCardId])

  useImperativeHandle(ref, () => ({
    selectAll() {
      const next = new Set<string>()
      for (const s of sugestoes) {
        if (stOf(s) === "inviavel") continue
        const mainKey = `${s.dia}|||${s.hora}|||${s.tP}|||${s.prof}`
        if (recusadasSet.has(mainKey)) continue
        next.add(s.id)
        for (const vc of getActiveVComps(s)) {
          const vcKey = `${s.dia}|||${vc.hora}|||${vc.tP}|||${vc.prof}`
          if (recusadasSet.has(vcKey)) continue
          next.add(`${s.id}|||vc|||${vc.hora}`)
        }
      }
      setSelectedIds(next)
    },
    clearAll() {
      setSelectedIds(new Set())
    },
  }))

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
    const sessoes: AceiteSessao[] = []
    for (const id of selectedIds) {
      if (id.includes("|||vc|||")) {
        // vComp independente: "${parentId}|||vc|||${hora}"
        const sep    = id.indexOf("|||vc|||")
        const parentId = id.slice(0, sep)
        const hora   = id.slice(sep + 8)
        const s = sugestoes.find(x => x.id === parentId)
        if (!s || stOf(s) === "inviavel") continue
        const vc = getActiveVComps(s).find(v => v.hora === hora)
        if (!vc) continue
        const ae = getActiveEntry(s)
        sessoes.push({ dia: s.dia, hora, tP: vc.tP, prof: vc.prof, unidade: ae.unidade })
      } else {
        const s = sugestoes.find(x => x.id === id)
        if (!s || stOf(s) === "inviavel") continue
        const ae = getActiveEntry(s)
        if (!isVCompExcluded(s.id, s.hora)) {
          sessoes.push({ dia: s.dia, hora: s.hora, tP: ae.tP, prof: ae.prof, unidade: ae.unidade })
        }
      }
    }
    return sessoes
  }

  function handleAceitar() {
    const sessoes = buildSelectedSessoes()
    if (!sessoes.length) return
    // CRON-008: não aplica nem limpa a seleção aqui — o pai abre o modal premium de
    // confirmação; a seleção só é limpa (via ref.clearAll) após a implantação ser
    // efetivamente confirmada, permitindo cancelar sem perder o que foi selecionado.
    onAceitar({ sessoes, beforeCount: sessPac.length })
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

  // CRON-008: reservas confirmadas que ainda não apareceram sincronizadas em cRows —
  // usado pelo painel lateral para o aviso "aguardando sincronização".
  const reservaPendenteCount = useMemo(() => {
    const implantadas = new Set(sessPac.map(s => `${s.dia}|||${s.hora}|||${s.tP}|||${s.prof}`))
    return reservasConfirmadas.filter(s => !implantadas.has(`${s.dia}|||${s.hora}|||${s.tP}|||${s.prof}`)).length
  }, [reservasConfirmadas, sessPac])

  type CellInfo = {
    tP: string; tE?: string; prof: string
    tipo: "proposta" | "aceito" | "exist" | "adminSuperv" | "adminWarn" | "supervDesloc" | "recusada" | "reservado"
    unidade: string; target?: string
    sugestaoId?: string
    isVComp?: boolean
  }

  const cMap: Record<string, CellInfo[]> = {}
  for (const s of sessPac) {
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    if (!cMap[k].some(x => x.tP === s.tP && x.prof === s.prof)) {
      cMap[k].push({ tP: s.tP, tE: s.tE, prof: s.prof, tipo: s.tipo, unidade: s.unidade })
    }
  }

  // CRON-008: reservas já implantadas (aguardando sincronização) — não são mais
  // sugestões (buildSugestoes já as bloqueia via dayHours), entram direto na grade
  // como "Reservado": não clicáveis, sem opção de trocar terapia ou remover.
  for (const s of reservasConfirmadas) {
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    if (!cMap[k].some(x => x.tP === s.tP && x.prof === s.prof)) {
      cMap[k].push({ tP: s.tP, prof: s.prof, tipo: "reservado", unidade: s.unidade })
    }
  }

  // Todos os cards de proposta sempre visíveis na grade — o estado visual muda, não a presença.
  // mainSlots registra todos os slots principais para impedir que vComps os sobrescrevam.
  const mainSlots = new Set<string>()
  for (const s of sugestoes) {
    mainSlots.add(`${s.dia}|||${s.hora}`)
  }
  for (const s of reservasConfirmadas) {
    mainSlots.add(`${s.dia}|||${s.hora}`)
  }
  for (const s of sugestoes) {
    const st  = stOf(s)
    const ae  = getActiveEntry(s)
    const kP  = `${s.dia}|||${s.hora}`
    // tipo visual: "recusada" se inviavel ou já recusado pelo usuário; "proposta" caso contrário
    // A distinção aceita/não-aceita é feita no render via selectedIds.has(c.sugestaoId)
    const recKey = `${s.dia}|||${s.hora}|||${ae.tP}|||${ae.prof}`
    const tipo: CellInfo["tipo"] = st === "inviavel" ? "recusada" : recusadasSet.has(recKey) ? "recusada" : "proposta"
    if (!cMap[kP]) cMap[kP] = []
    if (!cMap[kP].some(x => x.sugestaoId === s.id)) {
      cMap[kP].push({ tP: ae.tP, tE: tExib(ae.tP), prof: ae.prof, tipo, unidade: ae.unidade, sugestaoId: s.id })
    }
  }

  // vComps: sempre visíveis na grade, em slots não ocupados por slot principal.
  // Cada vComp recebe sugestaoId único ("${parentId}|||vc|||${hora}") para ser
  // selecionável de forma independente — sem dependência do estado do card pai.
  const seenSlot = new Set<string>(mainSlots)
  for (const s of sugestoes) {
    const st = stOf(s)
    if (st === "inviavel") continue
    const activeUnid = getActiveEspData(s).unidade
    const activeVComps = getActiveVComps(s)
    for (const vc of activeVComps) {
      const kC     = `${s.dia}|||${vc.hora}`
      const vcSugId = `${s.id}|||vc|||${vc.hora}`
      if (seenSlot.has(kC)) continue
      seenSlot.add(kC)
      if (!cMap[kC]) cMap[kC] = []
      if (!cMap[kC].some(x => x.sugestaoId === vcSugId)) {
        const recKeyVc = `${s.dia}|||${vc.hora}|||${vc.tP}|||${vc.prof}`
        const tipoVc: CellInfo["tipo"] = recusadasSet.has(recKeyVc) ? "recusada" : "proposta"
        cMap[kC].push({ tP: vc.tP, tE: tExib(vc.tP), prof: vc.prof, tipo: tipoVc, unidade: activeUnid, sugestaoId: vcSugId, isVComp: true })
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
  // Eixo de tempo contínuo: dentro da faixa ocupada (por turno), inclui TODOS os tempos da
  // grade — inclusive os sem sessão — para que apareçam como linhas em branco, sem vãos.
  const horasComConteudo = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))
  const horas  = (() => {
    if (horasComConteudo.length === 0) return [] as string[]
    const manha = horasComConteudo.filter(h => (pm(h) ?? 0) < 720)
    const tarde = horasComConteudo.filter(h => (pm(h) ?? 0) >= 720)
    const ranges: Array<[number, number]> = []
    if (manha.length) ranges.push([pm(manha[0])!, pm(manha[manha.length - 1])!])
    if (tarde.length) ranges.push([pm(tarde[0])!, pm(tarde[tarde.length - 1])!])
    return HORAS_GRID.filter(h => { const m = pm(h) ?? -1; return ranges.some(([lo, hi]) => m >= lo && m <= hi) })
  })()
  const unitMeta = buildCronoUnitMeta(dias, cMap)

  // Time-axis: generate every 20-min tick within the range that has sessions.
  // Session rows (in `horas`) get rowSpan=2 to occupy 80px (= 40 min).
  const sessionStartSet = new Set(horas)
  const allSlots = (() => {
    if (horas.length === 0) return [] as string[]
    const toMin = (h: string) => { const [hr, mn] = h.split(":").map(Number); return hr * 60 + mn }
    const toHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    const slots: string[] = []
    const morningH  = horas.filter(h => toMin(h) < 720)
    const afternoonH = horas.filter(h => toMin(h) >= 720)
    if (morningH.length > 0) {
      for (let m = toMin(morningH[0]); m < toMin(morningH[morningH.length - 1]) + 40; m += 20) slots.push(toHora(m))
    }
    if (afternoonH.length > 0) {
      for (let m = toMin(afternoonH[0]); m < toMin(afternoonH[afternoonH.length - 1]) + 40; m += 20) slots.push(toHora(m))
    }
    return slots
  })()
  const firstAfternoonSlot = allSlots.find(s => parseInt(s.replace(":", "")) >= 1300)

  const discrepantCellKeys = new Set<string>()
  if (!unitMeta.globalUnit) {
    for (const d of dias) {
      for (const isM of [true, false]) {
        const horasT = horas.filter(h => isM ? (pm(h) ?? 999) < 720 : (pm(h) ?? 0) >= 720)
        const items: Array<{ unit: string; k: string }> = []
        for (const h of horasT) {
          for (const c of cMap[`${d}|||${h}`] || []) {
            if (!c.unidade || c.tipo === "adminSuperv" || c.tipo === "adminWarn" || c.tipo === "supervDesloc" || c.tipo === "recusada" || c.isVComp) continue
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
    if (tipo === "proposta")     return { bg: B.blueLt,  bd: B.blue,    label: null       }
    if (tipo === "recusada")     return { bg: "#fff5f5", bd: "#fca5a5", label: null       }
    if (tipo === "reservado")    return { bg: "#f0fdf4", bd: "#16a34a", label: "🔒 Reservado" }
    return                              { bg: "#f8fafc", bd: "#e2e8f0", label: null       }
  }

  const selectedCount = buildSelectedSessoes().length

  // Verdadeiro quando algum card selecionado tem múltiplas terapias sem wizard completo
  const hasPendingEsp = Array.from(selectedIds).some(id => {
    if (id.includes("|||vc|||")) return false
    const s = sugestoes.find(x => x.id === id)
    if (!s || s.espAlts.length === 0) return false
    return espSelIdx[s.id] === undefined || !profConfirmed.has(s.id)
  })

  const selectedByEsp: Record<string, number> = {}
  for (const id of selectedIds) {
    if (id.includes("|||vc|||")) {
      const sep = id.indexOf("|||vc|||")
      const parentId = id.slice(0, sep)
      const hora = id.slice(sep + 8)
      const s = sugestoes.find(x => x.id === parentId)
      if (!s || stOf(s) === "inviavel") continue
      const vc = getActiveVComps(s).find(v => v.hora === hora)
      if (vc) {
        const esp = TERAPIA_TO_ESP[vc.tP]
        if (esp) selectedByEsp[esp] = (selectedByEsp[esp] || 0) + 1
      }
    } else {
      const s = sugestoes.find(x => x.id === id)
      if (!s || stOf(s) === "inviavel") continue
      if (!isVCompExcluded(s.id, s.hora)) {
        const activeEsp = getActiveEspData(s).esp
        selectedByEsp[activeEsp] = (selectedByEsp[activeEsp] || 0) + 1
      }
    }
  }
  const isDeficitSobre = pacAllEsp.some(g => g.of > g.aut)
  const hasExcesso = pacAllEsp.some(g => {
    const sel = selectedByEsp[g.esp] || 0
    if (isDeficitSobre) return sel > 0 && (g.of + sel) > g.aut
    return (g.of + sel) > g.aut
  })
  // Mesma fonte de verdade do painel "Quantidade de Sessões" — nenhuma lógica duplicada
  const excessoEsps = new Set<string>(
    pacAllEsp.filter(g => (g.of + (selectedByEsp[g.esp] || 0)) > g.aut).map(g => g.esp)
  )

  return (
    <>
    {/* Barra de estratégias */}
    <div style={{ padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "12px", display: "none", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
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
                {!m.disponivel && <span style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24", borderRadius: "3px", padding: "0 4px" }}>Em breve</span>}
              </button>
            )
          })}
    </div>

    {/* Workspace — grade (fonte única de verdade) + resumo de ocupação */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", border: "1px solid var(--border)", borderRadius: "14px", background: "var(--card)", overflow: "hidden", height: "calc(100vh - 280px)", minHeight: "480px", marginBottom: "16px" }}>

      {/* ── Grade: Agenda ────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--border)" }}>
        <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "6px 16px 16px" }}>
            {!horas.length ? (
              <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "20px" }}>Nenhuma sessão encontrada.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: `${46 + dias.length * 110}px`, width: "100%" }}>
                <colgroup>
                  <col style={{ width: "44px" }} />
                  {dias.map(d => <col key={d} style={{ width: "110px" }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ paddingBottom: "8px", textAlign: "right", paddingRight: "4px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                    {dias.map(d => (
                      <th key={d} style={{ paddingBottom: "8px", textAlign: "center", fontSize: "12px", color: B.navy, fontWeight: 800 }}>
                        <div>{d.replace("-feira", "")}</div>
                        <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSlots.map((slot) => {
                    const isSession = sessionStartSet.has(slot)
                    const isFirstAfternoon = slot === firstAfternoonSlot
                    return (
                      <tr key={slot} style={{ height: "36px", borderTop: isFirstAfternoon ? "2px solid var(--border)" : isSession ? "1px solid var(--border)" : "none" }}>
                        <td style={{ textAlign: "right", paddingRight: "4px", verticalAlign: "top", paddingTop: "5px", fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontSize: "12px", fontWeight: 800, color: B.navy, whiteSpace: "nowrap" }}>
                          {isSession ? slot : null}
                        </td>
                        {isSession && dias.map(d => {
                          const cells = cMap[`${d}|||${slot}`] || []
                          const cellHasExpanded = cells.some(c => c.sugestaoId && (expandedProfCardId === c.sugestaoId || expandedEspCardId === c.sugestaoId))
                          return (
                            <td key={d} rowSpan={2} style={{ position: "relative", zIndex: cellHasExpanded ? 1 : "auto" }}>
                              <div style={{ position: "absolute", inset: "2px", display: "flex", flexDirection: "column", gap: "2px", overflow: "visible" }}>
                              {cells.map((c, ci) => {
                                const cs       = cSt(c.tipo)
                                const isDark   = c.tipo === "supervDesloc" || c.tipo === "adminSuperv"
                                const cellKey  = `${d}|||${slot}|||${c.tP}|||${c.prof}`
                                const isDisc   = discrepantCellKeys.has(cellKey)
                                const isRecusadaCard = c.tipo === "recusada"
                                const isVCompCard    = !!c.isVComp
                                const isClickable    = (c.tipo === "proposta") && !!c.sugestaoId
                                // isSel funciona para main cards E vComps: cada um tem sugestaoId único
                                const isSel    = isClickable && selectedIds.has(c.sugestaoId!)
                                // Profissionais alternativos — só para main proposals (não vComp)
                                const mainSug  = (isClickable && !isVCompCard) ? (sugestoes.find(x => x.id === c.sugestaoId) ?? null) : null
                                const mainEd   = mainSug ? getActiveEspData(mainSug) : null
                                const allProfs = mainEd ? [{ prof: mainEd.prof, tP: mainEd.tP, unidade: mainEd.unidade } as ProfAlt, ...mainEd.profAlts] : []
                                const altCount = Math.max(0, allProfs.length - 1)
                                const isExpanded = expandedProfCardId === c.sugestaoId
                                // Terapias elegíveis para este slot (espAlts calculadas por buildSugestoes)
                                const allEsps     = mainSug ? [{ esp: mainSug.esp, tP: mainSug.tP }, ...mainSug.espAlts.map(a => ({ esp: a.esp, tP: a.tP }))] : []
                                const espAltCount = Math.max(0, allEsps.length - 1)
                                const isEspExpanded = expandedEspCardId === c.sugestaoId
                                const curEspIdx   = mainSug ? (espSelIdx[mainSug.id] ?? 0) : 0
                                // Wizard multi-terapia: estados derivados
                                const espIsExplicitlySet = mainSug ? espSelIdx[mainSug.id] !== undefined : true
                                const wizardComplete = mainSug
                                  ? (allEsps.length > 1 && espIsExplicitlySet && profConfirmed.has(mainSug.id))
                                  : false
                                const espIsPending = mainSug ? (allEsps.length > 1 && !wizardComplete) : false
                                const cardEsp = isVCompCard
                                  ? (TERAPIA_TO_ESP[c.tP] ?? null)
                                  : (mainEd?.esp ?? TERAPIA_TO_ESP[c.tP] ?? null)
                                const isExcesso = isSel && cardEsp !== null && excessoEsps.has(cardEsp)
                                // Cor do card: amarelo se pendente, vermelho se excesso, verde se selecionado, default caso contrário
                                const bg  = espIsPending ? "#fefce8" : isExcesso ? "#fff1f2" : (isSel ? "#dcfce7" : cs.bg)
                                const bd  = espIsPending ? "#fbbf24" : isExcesso ? "#fca5a5" : (isSel ? "#16a34a" : cs.bd)
                                const isMultiEsp = !!(mainSug && allEsps.length > 1)
                                const cardClickable = isClickable && (!isMultiEsp || wizardComplete)
                                return (
                                  <div
                                    key={ci}
                                    onClick={cardClickable ? () => toggleSelected(c.sugestaoId!) : undefined}
                                    style={{
                                      background: bg,
                                      border: `1px ${c.tipo === "reservado" ? "dashed" : "solid"} ${isDisc ? "#f97316" : bd}`,
                                      borderRadius: "8px", padding: "5px 7px",
                                      flex: (isExpanded || isEspExpanded) ? "none" : "1",
                                      boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px",
                                      outline: isDisc ? "2px solid #fed7aa" : "none",
                                      cursor: cardClickable ? "pointer" : "default",
                                      position: "relative",
                                      opacity: isRecusadaCard ? 0.65 : 1,
                                      zIndex: (isExpanded || isEspExpanded) ? 20 : "auto",
                                      boxShadow: (isExpanded || isEspExpanded) ? "0 6px 24px rgba(0,0,0,.13)" : "none",
                                      transition: "box-shadow 180ms ease",
                                    }}>

                                    {/* ── CARD TERAPIA ÚNICA (comportamento original inalterado) ── */}
                                    {!isMultiEsp && (
                                      <>
                                        {isSel && !isExpanded && (
                                          <span style={{ position: "absolute", top: "3px", right: "4px", fontSize: "10px", fontWeight: 900, color: isExcesso ? "#dc2626" : "#16a34a", lineHeight: 1, pointerEvents: "none" }}>{isExcesso ? "⚠" : "✓"}</span>
                                        )}
                                        {isRecusadaCard && (
                                          <span style={{ position: "absolute", top: "2px", right: "4px", fontSize: "9px", lineHeight: 1, pointerEvents: "none", opacity: 0.7 }}>🚫</span>
                                        )}
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2px" }}>
                                          <span style={{ fontSize: "10px", fontWeight: 600, color: isDark ? "white" : "#111827", lineHeight: "1.3", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.tP}</span>
                                          <span style={{ fontSize: "8px", color: isDark ? "#d1d5db" : "#9ca3af", flexShrink: 0, whiteSpace: "nowrap", paddingRight: !isExpanded && (isSel || isRecusadaCard) ? "12px" : 0 }}>📍 {c.unidade}</span>
                                        </div>
                                        {!isExpanded && (
                                          <div style={{ fontSize: "11px", color: isDark ? "#d1d5db" : "#6b7280", lineHeight: "1.3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtName(c.prof)}</div>
                                        )}
                                        {altCount > 0 && isClickable && !isVCompCard && (
                                          <div data-prof-dropdown="true" style={{ overflow: "hidden", maxHeight: isExpanded ? `${(altCount + 1) * 26 + 8}px` : "0px", opacity: isExpanded ? 1 : 0, transition: "max-height 200ms ease-out, opacity 150ms ease-out", display: "flex", flexDirection: "column", gap: "1px", marginTop: isExpanded ? "3px" : "0" }} onClick={e => e.stopPropagation()}>
                                            {allProfs.map((p, i) => {
                                              const isCurr = (profSelIdx[mainSug!.id] ?? 0) === i
                                              return (
                                                <button key={i} onClick={e => { e.stopPropagation(); setProfSelIdx(prev => ({ ...prev, [mainSug!.id]: i })); setExpandedProfCardId(null) }}
                                                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 5px", borderRadius: "5px", border: "none", background: isCurr ? "rgba(22,163,74,0.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: isCurr ? 600 : 400, color: isCurr ? "#166534" : "#374151", textAlign: "left", width: "100%", transition: "background 100ms ease" }}>
                                                  <span style={{ fontSize: "8px", color: isCurr ? "#16a34a" : "#9ca3af", flexShrink: 0, lineHeight: 1 }}>{isCurr ? "●" : "○"}</span>
                                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtName(p.prof)}</span>
                                                </button>
                                              )
                                            })}
                                          </div>
                                        )}
                                        {isDisc && <div style={{ fontSize: "11px", fontWeight: 700, color: "#ea580c", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>⚠ {c.unidade}</div>}
                                        {isDark && <div style={{ fontSize: "11px", fontWeight: 700, color: "#fbbf24", marginTop: "auto" }}>{c.target ? `→ ${c.target}` : "→ verificar"}</div>}
                                        {!isDark && (cs.label || isClickable || isRecusadaCard) && (
                                          <div style={{ fontSize: "10px", fontWeight: 700, marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "3px" }}>
                                            {altCount > 0 && isClickable && !isVCompCard ? (
                                              <div style={{ display: "flex", alignItems: "center", gap: "3px", minWidth: 0 }}>
                                                <button data-prof-dropdown="true" onClick={e => { e.stopPropagation(); setExpandedProfCardId(isExpanded ? null : c.sugestaoId!); setExpandedEspCardId(null) }}
                                                  style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0, fontSize: "10px", fontWeight: 700, color: "#0369a1", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", lineHeight: "1.4" }}>
                                                  <span style={{ fontSize: "7px", display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 180ms ease" }}>▼</span>
                                                  <span>{altCount === 1 ? "1 prof." : `${altCount} profs.`}</span>
                                                </button>
                                                {cs.label && <><span style={{ color: "#d1d5db", flexShrink: 0 }}>•</span><span style={{ color: c.tipo === "aceito" ? B.blue : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cs.label}</span></>}
                                              </div>
                                            ) : isExcesso ? (
                                              <span style={{ fontSize: "9px", fontWeight: 800, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "4px", padding: "0 5px", lineHeight: "1.6" }}>Acima do limite</span>
                                            ) : cs.label ? (
                                              <span style={{ color: c.tipo === "aceito" ? B.blue : "#374151" }}>{cs.label}</span>
                                            ) : null}
                                            {isClickable && c.sugestaoId && (
                                              <button onClick={e => { e.stopPropagation(); const sid = isVCompCard ? c.sugestaoId!.slice(0, c.sugestaoId!.indexOf("|||vc|||")) : c.sugestaoId!; const sug = sugestoes.find(x => x.id === sid); if (!sug) return; const ae = getActiveEntry(sug); setPendingAcao({ sugestao: sug, hora: slot, tP: c.tP, prof: c.prof, unidade: ae.unidade, acao: "recusar" }); setAcaoMotivo("") }}
                                                style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "3px", border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, lineHeight: "1.4", flexShrink: 0, marginLeft: "auto" }}>Recusar</button>
                                            )}
                                            {isRecusadaCard && c.sugestaoId && (
                                              <button onClick={e => { e.stopPropagation(); const sid = c.sugestaoId!.includes("|||vc|||") ? c.sugestaoId!.slice(0, c.sugestaoId!.indexOf("|||vc|||")) : c.sugestaoId!; const sug = sugestoes.find(x => x.id === sid); if (sug) setSt(sug, null); onUndoRecusa(d, slot, c.tP, c.prof) }}
                                                style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, lineHeight: "1.4", flexShrink: 0 }}>↺</button>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {/* ── WIZARD MULTI-TERAPIA ── */}
                                    {isMultiEsp && (
                                      <>
                                        {/* Estágio 1: Pendente — wizard fechado */}
                                        {!isEspExpanded && !wizardComplete && (
                                          <>
                                            <span style={{ position: "absolute", top: "2px", right: "4px", fontSize: "9px", fontWeight: 900, color: "#92400e", lineHeight: 1, pointerEvents: "none" }}>⚠</span>
                                            <div style={{ fontSize: "8px", color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {c.unidade}</div>
                                            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "3px" }}>
                                              <button
                                                data-esp-dropdown="true"
                                                onClick={e => { e.stopPropagation(); setExpandedEspCardId(c.sugestaoId!); setExpandedProfCardId(null) }}
                                                style={{ fontSize: "9px", fontWeight: 700, color: "#92400e", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "4px", padding: "2px 4px", cursor: "pointer", fontFamily: "inherit", lineHeight: "1.4", textAlign: "center" }}>
                                                ⚠ Escolher terapia
                                              </button>
                                              <button
                                                onClick={e => { e.stopPropagation(); const sug = sugestoes.find(x => x.id === c.sugestaoId!); if (!sug) return; const ae = getActiveEntry(sug); setPendingAcao({ sugestao: sug, hora: slot, tP: c.tP, prof: c.prof, unidade: ae.unidade, acao: "recusar" }); setAcaoMotivo("") }}
                                                style={{ fontSize: "9px", padding: "2px 4px", borderRadius: "3px", border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, lineHeight: "1.4", textAlign: "center" }}>
                                                Recusar
                                              </button>
                                            </div>
                                          </>
                                        )}

                                        {/* Estágio 2+3: Wizard aberto — escolha de terapia e profissional */}
                                        {isEspExpanded && (
                                          <div data-esp-dropdown="true" onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                            <div style={{ fontSize: "9px", fontWeight: 800, color: "#374151", marginBottom: "1px" }}>Escolha uma terapia</div>
                                            {allEsps.map((e, i) => {
                                              const isCurr = espIsExplicitlySet && curEspIdx === i
                                              return (
                                                <button key={i}
                                                  onClick={evt => { evt.stopPropagation(); setEspSelIdx(prev => ({ ...prev, [mainSug!.id]: i })); setProfSelIdx(prev => ({ ...prev, [mainSug!.id]: 0 })); setSelIdx(prev => ({ ...prev, [mainSug!.id]: {} })); setProfConfirmed(prev => { const s = new Set(prev); s.delete(mainSug!.id); return s }) }}
                                                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 5px", borderRadius: "5px", border: "none", background: isCurr ? "rgba(126,34,206,0.08)" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: isCurr ? 600 : 400, color: isCurr ? "#6b21a8" : "#374151", textAlign: "left", width: "100%", transition: "background 100ms ease" }}>
                                                  <span style={{ fontSize: "8px", color: isCurr ? "#7e22ce" : "#9ca3af", flexShrink: 0, lineHeight: 1 }}>{isCurr ? "●" : "○"}</span>
                                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.tP}</span>
                                                </button>
                                              )
                                            })}
                                            {/* Estágio 3: lista de profissionais aparece após terapia escolhida */}
                                            {espIsExplicitlySet && (
                                              <>
                                                <div style={{ borderTop: "1px solid #e5e7eb", margin: "2px 0" }} />
                                                <div style={{ fontSize: "9px", fontWeight: 800, color: "#374151", marginBottom: "1px" }}>Escolha um profissional</div>
                                                {allProfs.map((p, i) => {
                                                  const isCurr = profConfirmed.has(mainSug!.id) && (profSelIdx[mainSug!.id] ?? 0) === i
                                                  return (
                                                    <button key={i}
                                                      onClick={evt => { evt.stopPropagation(); setProfSelIdx(prev => ({ ...prev, [mainSug!.id]: i })); setProfConfirmed(prev => { const s = new Set(prev); s.add(mainSug!.id); return s }); setExpandedEspCardId(null) }}
                                                      style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 5px", borderRadius: "5px", border: "none", background: isCurr ? "rgba(22,163,74,0.1)" : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: isCurr ? 600 : 400, color: isCurr ? "#166534" : "#374151", textAlign: "left", width: "100%", transition: "background 100ms ease" }}>
                                                      <span style={{ fontSize: "8px", color: isCurr ? "#16a34a" : "#9ca3af", flexShrink: 0, lineHeight: 1 }}>{isCurr ? "●" : "○"}</span>
                                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtName(p.prof)}</span>
                                                    </button>
                                                  )
                                                })}
                                              </>
                                            )}
                                          </div>
                                        )}

                                        {/* Estágio 4: Wizard concluído — layout normal + "Alterar terapia" */}
                                        {!isEspExpanded && wizardComplete && (
                                          <>
                                            {isSel && (
                                              <span style={{ position: "absolute", top: "3px", right: "4px", fontSize: "10px", fontWeight: 900, color: isExcesso ? "#dc2626" : "#16a34a", lineHeight: 1, pointerEvents: "none" }}>{isExcesso ? "⚠" : "✓"}</span>
                                            )}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2px" }}>
                                              <span style={{ fontSize: "10px", fontWeight: 600, color: "#111827", lineHeight: "1.3", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.tP}</span>
                                              <span style={{ fontSize: "8px", color: "#9ca3af", flexShrink: 0, whiteSpace: "nowrap", paddingRight: isSel ? "12px" : 0 }}>📍 {c.unidade}</span>
                                            </div>
                                            <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: "1.3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtName(c.prof)}</div>
                                            {isDisc && <div style={{ fontSize: "11px", fontWeight: 700, color: "#ea580c", marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>⚠ {c.unidade}</div>}
                                            <div style={{ fontSize: "10px", fontWeight: 700, marginTop: "auto", display: "flex", alignItems: "center", gap: "3px" }}>
                                              {isExcesso && <span style={{ fontSize: "9px", fontWeight: 800, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "4px", padding: "0 5px", lineHeight: "1.6" }}>Acima do limite</span>}
                                              <button
                                                data-esp-dropdown="true"
                                                onClick={e => { e.stopPropagation(); setProfConfirmed(prev => { const s = new Set(prev); s.delete(mainSug!.id); return s }); setExpandedEspCardId(c.sugestaoId!); setExpandedProfCardId(null) }}
                                                style={{ fontSize: "9px", fontWeight: 700, color: "#7e22ce", background: "rgba(126,34,206,0.05)", border: "1px solid rgba(126,34,206,0.2)", borderRadius: "4px", padding: "1px 5px", cursor: "pointer", fontFamily: "inherit", lineHeight: "1.4" }}>
                                                Alterar terapia
                                              </button>
                                              <button
                                                onClick={e => { e.stopPropagation(); const sug = sugestoes.find(x => x.id === c.sugestaoId!); if (!sug) return; const ae = getActiveEntry(sug); setPendingAcao({ sugestao: sug, hora: slot, tP: c.tP, prof: c.prof, unidade: ae.unidade, acao: "recusar" }); setAcaoMotivo("") }}
                                                style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "3px", border: "1px solid #fca5a5", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, lineHeight: "1.4", flexShrink: 0, marginLeft: "auto" }}>
                                                Recusar
                                              </button>
                                            </div>
                                          </>
                                        )}
                                      </>
                                    )}

                                  </div>
                                )
                              })}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Action Bar contextual ── aparece só com seleção; selecionar → revisar → confirmar */}
          {selectedCount > 0 && (() => {
            const selSessoes = buildSelectedSessoes()
            const n = selSessoes.length
            return (
              <div
                className="animate-in slide-in-from-bottom-4 fade-in duration-300"
                style={{
                  flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--card)",
                  boxShadow: "0 -10px 28px rgba(15,23,42,0.07)",
                  display: "flex", alignItems: "stretch", gap: "14px", padding: "11px 16px",
                }}>
                {/* Esquerda — identidade da ação */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", width: "220px", flexShrink: 0 }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "#dcfce7", border: "1px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#16a34a", fontSize: "17px", fontWeight: 900, lineHeight: 1 }}>✓</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: B.navy, lineHeight: 1.25 }}>
                      {n} {n === 1 ? "alteração pronta" : "alterações prontas"} para implantação
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px", lineHeight: 1.35 }}>
                      Revise as propostas selecionadas na grade.
                    </div>
                  </div>
                </div>

                {/* Centro — resumo das alterações (gerado automaticamente) */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "8px", overflowX: "auto", alignItems: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", padding: "0 14px" }}>
                  {selSessoes.map((s, i) => (
                    <div key={i} style={{ flexShrink: 0, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "5px 9px", minWidth: "120px", maxWidth: "150px" }}>
                      <div style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontSize: "11px", fontWeight: 800, color: B.navy }}>{(DIA_ABR[s.dia] ?? s.dia.replace("-feira", ""))} • {s.hora}</div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--card-foreground)", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.tP}</div>
                      <div style={{ fontSize: "10px", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtName(s.prof)}</div>
                    </div>
                  ))}
                </div>

                {/* Direita — ações */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: "6px", flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      style={{ padding: "8px 14px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--card-foreground)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "12px" }}>
                      Cancelar seleção
                    </button>
                    <button
                      disabled={hasExcesso || hasPendingEsp}
                      onClick={() => !hasExcesso && !hasPendingEsp && handleAceitar()}
                      style={{ padding: "8px 16px", borderRadius: "9px", border: "none", background: (hasExcesso || hasPendingEsp) ? "#e5e7eb" : "#16a34a", color: (hasExcesso || hasPendingEsp) ? "#9ca3af" : "white", cursor: (hasExcesso || hasPendingEsp) ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: "12px", boxShadow: (hasExcesso || hasPendingEsp) ? "none" : "0 2px 8px rgba(22,163,74,0.30)" }}>
                      Aceitar alterações ({n})
                    </button>
                  </div>
                  <div style={{ fontSize: "10px", color: hasExcesso ? "#dc2626" : hasPendingEsp ? "#d97706" : "var(--muted-foreground)", fontWeight: (hasExcesso || hasPendingEsp) ? 700 : 400 }}>
                    {hasExcesso ? "⚠ Limite ultrapassado — desmarque sessões em excesso." : hasPendingEsp ? "⚠ Selecione a terapia de todas as sugestões antes de continuar." : "As alterações só serão aplicadas após a confirmação."}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

      {/* ── Coluna 3: Resumo Ocupação ─────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", flexShrink: 0, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--card-foreground)", letterSpacing: "0.03em" }}>Quantidade de Sessões</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 14px", overflowY: "auto", gap: "0" }}>

            {/* Quantidade de Sessões — antes e depois */}
            {(() => {
              const beforeCount = sessPac.length
              const addedCount  = buildSelectedSessoes().length
              const afterCount  = beforeCount + addedCount
              const pctGain     = beforeCount > 0 ? Math.round((addedCount / beforeCount) * 100) : null
              return (
                <div style={{ marginBottom: "14px", flexShrink: 0 }}>

                  {/* Labels */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.03em" }}>Antes</div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.03em" }}>Depois</div>
                  </div>

                  {/* Numbers */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: "22px", fontWeight: 900, color: "var(--muted-foreground)", lineHeight: 1 }}>{beforeCount}</div>

                    <div style={{ fontSize: "20px", fontWeight: 900, color: addedCount > 0 ? "#16a34a" : "var(--border)", transition: "color 200ms ease", flexShrink: 0 }}>→</div>

                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <div key={afterCount} className="ocup-num-tick" style={{ fontSize: "28px", fontWeight: 900, color: addedCount > 0 ? "#16a34a" : "var(--muted-foreground)", lineHeight: 1, transition: "color 200ms ease" }}>
                        {afterCount}
                      </div>
                      {addedCount > 0 && (
                        <div key={addedCount} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span className="ocup-badge-pop" style={{ fontSize: "10px", fontWeight: 800, background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", borderRadius: "5px", padding: "1px 6px", whiteSpace: "nowrap" }}>+{addedCount}</span>
                          {pctGain !== null && <span style={{ fontSize: "9px", fontWeight: 700, color: "#16a34a", textAlign: "center", whiteSpace: "nowrap" }}>(+{pctGain}%)</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {reservaPendenteCount > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "11px", fontWeight: 700, color: "#15803d", display: "flex", alignItems: "center", gap: "4px" }}>
                      ⏳ +{reservaPendenteCount} aguardando sincronização
                    </div>
                  )}

                  <div style={{ height: "1px", background: "var(--border)", margin: "12px 0 0" }} />
                </div>
              )
            })()}

<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {pacAllEsp.length === 0 && (
                <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Sem autorização registrada.</div>
              )}
              {pacAllEsp.map((g, i) => {
                const sel = selectedByEsp[g.esp] || 0
                const reservado = g.reservado || 0
                const sincronizado = g.of - reservado
                const total = g.of + sel
                const excesso = total > g.aut
                const completo = total === g.aut
                const parcial = !excesso && !completo && sel > 0
                const cor = excesso ? "#dc2626" : completo ? "#16a34a" : parcial ? "#d97706" : B.navy
                return (
                  <div key={`${pac}|||${g.esp}`} className="ocup-esp-row" style={{ "--i": i } as CSSProperties}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--card-foreground)", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.esp}>{g.esp}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span key={`${pac}|||${g.esp}|||${total}`} className="ocup-num-tick" style={{ fontSize: "15px", fontWeight: 900, color: cor, transition: "color 180ms ease", display: "inline-flex", alignItems: "baseline", gap: "3px" }}>
                        <span>{sincronizado}</span>
                        {reservado > 0 && <span title="Reservado — aguardando sincronização com o cronograma" style={{ color: "#d97706" }}>+{reservado}</span>}
                        <span>/{g.aut}</span>
                      </span>
                      {excesso && <span className="ocup-badge-pop" style={{ fontSize: "11px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>acima</span>}
                      {completo && sel > 0 && <span key={`completo-${sel}`} className="ocup-badge-pop" style={{ fontSize: "11px", background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>+{sel}</span>}
                      {completo && sel === 0 && <span className="ocup-badge-pop" style={{ fontSize: "11px", background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>✓</span>}
                      {parcial && <span key={`parcial-${sel}`} className="ocup-badge-pop" style={{ fontSize: "11px", background: "#fef3c7", color: "#d97706", border: "1px solid #fcd34d", borderRadius: "4px", padding: "0 4px", fontWeight: 700 }}>+{sel}</span>}
                    </div>
                    <div style={{ height: "4px", background: "var(--muted)", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                      <div className="ocup-progress-bar" style={{ height: "100%", borderRadius: "2px", width: "100%", background: cor, transform: `scaleX(${Math.min(1, total / g.aut)})`, transformOrigin: "left" }} />
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
          <div style={{ background: "var(--card)", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxWidth: "380px", width: "100%", padding: "22px" }}>
            <div style={{ fontWeight: 900, fontSize: "16px", color: meta.cor, marginBottom: "4px", textWrap: "balance" as const }}>{meta.titulo}</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "14px" }}>{meta.desc}</div>
            <div style={{ background: "var(--muted)", borderRadius: "10px", padding: "11px 14px", marginBottom: "12px" }}>
              <div style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: "13px", color: B.navy }}>{pendingAcao.sugestao.dia.replace("-feira", "")} {pendingAcao.hora}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--card-foreground)", marginTop: "3px" }}>{pendingAcao.tP}</div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginTop: "1px" }}>{fmtName(pendingAcao.prof)}</div>
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
              style={{ width: "100%", border: `1px solid ${motivoFaltando ? "#fca5a5" : "#d1d5db"}`, borderRadius: "10px", padding: "8px 12px", fontSize: "16px", fontFamily: "inherit", resize: "none", marginBottom: motivoFaltando ? "6px" : "16px", boxSizing: "border-box", outline: motivoFaltando ? "none" : undefined }}
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



  </>
  )
})

// ─── AceitesPanel ─────────────────────────────────────────────────────────────

const BUNDLE_STATUS_META = {
  pendente:   { label: "Pendente",  bg: "#fef3c7", c: "#92400e", bd: "#fbbf24" },
  confirmado: { label: "Confirmou", bg: "#dcfce7", c: "#14532d", bd: "#86efac" },
  recusado:   { label: "Recusou",   bg: "#fee2e2", c: "#7f1d1d", bd: "#fca5a5" },
  inviavel:   { label: "⛔ Inviável", bg: "#f3f4f6", c: "#6b7280", bd: "#d1d5db" },
}

function AceitesPanel({
  pac, aceites, onUpdate, onVerAll,
}: {
  pac: string
  aceites: AceitePacBundle[]
  onUpdate: (updated: AceitePacBundle[]) => void
  onVerAll: () => void
}) {
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
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
                  <span style={{ padding: "1px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: 800, background: sm.bg, color: sm.c, border: `1px solid ${sm.bd}` }}>{sm.label}</span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)", flexShrink: 0 }}>{bundle.sessoes.length} sessão(ões)</span>
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
                      <div style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontSize: "10px", fontWeight: 800, color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#1f2937", marginTop: "2px" }}>{s.tP}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>{fmtName(s.prof)}</div>
                      {!isInvBundle && (
                        <button
                          onClick={() => toggleInviavel(bundle.id, slotKey)}
                          style={{ ...btnStyle(isInv ? "#f3f4f6" : "#fef2f2", isInv ? "#6b7280" : "#dc2626", isInv ? "#e5e7eb" : "#fca5a5"), fontSize: "10px", marginTop: "5px", width: "100%", textAlign: "center" }}>
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
                {confirmandoId === bundle.id ? (
                  <div style={{ display: "flex", gap: "4px", marginLeft: "auto", alignItems: "center" }}>
                    <span style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }}>Excluir bundle?</span>
                    <button onClick={() => { deleteBundle(bundle.id); setConfirmandoId(null) }} style={{ ...btnStyle("#fef2f2", "#dc2626", "#fca5a5"), fontSize: "10px" }}>Sim</button>
                    <button onClick={() => setConfirmandoId(null)} style={{ ...btnStyle("#f3f4f6", "#6b7280", "#e5e7eb"), fontSize: "10px" }}>Não</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmandoId(bundle.id)} style={{ ...btnStyle("#fef2f2", "#dc2626", "#fca5a5"), fontSize: "10px", marginLeft: "auto" }}>Cancelar</button>
                )}
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
                            <div style={{ fontSize: "11px", color: "#fbbf24", fontWeight: 700 }}>↔ deslocar</div>
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
                            {sesses.length > 2 && <div style={{ fontSize: "11px", opacity: 0.7 }}>+{sesses.length - 2}</div>}
                          </div>
                        </td>
                      )
                    }
                    if (sugs?.length) {
                      return (
                        <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                          <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 4px", gap: "1px" }}>
                            {sugs.slice(0, 2).map((t, i) => (
                              <div key={i} style={{ fontWeight: 600, fontSize: "11px", color: "#92400e", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                                {t.length > 14 ? t.slice(0, 13) + "…" : t}
                              </div>
                            ))}
                            <div style={{ fontSize: "11px", color: "#d97706", fontWeight: 700 }}>proposta ↓</div>
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
  const modalRef = useRef<TodasSugestoesModalHandle>(null)
  const [pac, setPac]           = useState("")
  const [inputVal, setInputVal] = useState("")
  const [dropOpen, setDropOpen] = useState(false)
  const [estrategia, setEstrategia] = useState<Estrategia>("S1")
  const [statusMap, setStatusMap] = useState<Record<string, Status>>(() => {
    try { return JSON.parse(localStorage.getItem(SK) || "{}") } catch { return {} }
  })
  const { pacBundles, persistPacBundles } = useCronogramaData()
  const aceites = pacBundles
  const persistAceites = persistPacBundles
  const [invPending, setInvPending] = useState<Sugestao | null>(null)
  const [invMotivo, setInvMotivo]   = useState("")
  const [inputFocused, setInputFocused] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const listboxRef = useRef<HTMLDivElement>(null)
  // CRON-008: sessões aguardando confirmação no modal premium de implantação
  const [pendingConfirm, setPendingConfirm] = useState<{ sessoes: AceiteSessao[]; beforeCount: number } | null>(null)

  // CRON-008: sessões já reservadas (implantação imediata) deste paciente — exibidas
  // diretamente na grade do TodasSugestoesModal como "Reservado".
  const reservasConfirmadas = useMemo(
    () => aceites.filter(b => b.pac === pac && b.status === "confirmado").flatMap(b => b.sessoes),
    [aceites, pac],
  )

  const recusadasSet = useMemo(() => {
    const s = new Set<string>()
    for (const r of recGlobal) {
      if (r.paciente !== pac) continue
      s.add(`${r.dia}|||${r.hora}|||${r.especialidade}|||${r.profissional}`)
    }
    return s
  }, [recGlobal, pac])

  function openInvModal(s: Sugestao) { setInvPending(s); setInvMotivo("") }
  function confirmInv() {
    if (!invPending) return
    setSt(invPending, "inviavel")
    sInv?.([...invGlobal, { paciente: pac, motivo: invMotivo, registradoEm: new Date().toLocaleDateString("pt-BR") }])
    setInvPending(null)
    setInvMotivo("")
  }

  function persistStatus(m: Record<string, Status>) {
    setStatusMap(m)
    try { localStorage.setItem(SK, JSON.stringify(m)) } catch {}
  }

  // CRON-008: "Aceitar alterações" não aplica mais direto — abre o modal premium de
  // confirmação. A implantação de fato só ocorre em confirmarImplantacao().
  function handleAceitar({ sessoes, beforeCount }: { sessoes: AceiteSessao[]; beforeCount: number }) {
    if (!sessoes.length) return
    setPendingConfirm({ sessoes, beforeCount })
  }

  function cancelarImplantacao() {
    setPendingConfirm(null)
  }

  // CRON-008: pacBundles é a ÚNICA fonte de verdade da Reserva Pendente — nada é
  // espelhado em `conf`. Isso evita o estado duplicado (bundle + conf) que ficava
  // dessincronizado sempre que a reserva era desfeita por um caminho que só
  // conhecia um dos dois lados. Grade ("Reservado"), bloqueio cross-paciente
  // (slotsReservadosOutros/aqui e confirmedItems em OcupacaoShell) e a aba
  // Confirmados (via pacConfDerived em AcompanhamentoTab) leem todos direto daqui.
  function confirmarImplantacao() {
    if (!pendingConfirm) return
    const { sessoes } = pendingConfirm

    const bundle: AceitePacBundle = {
      id: `${Date.now()}_${pac.slice(0, 8)}`,
      pac, ts: Date.now(),
      origem: "ocp-paciente",
      sessoes,
      status: "confirmado",
      inviavelSlots: [],
    }
    persistAceites([...aceites, bundle])

    // 2. Contexto já atualizado pelo persist acima. 3. Limpar seleção.
    modalRef.current?.clearAll()
    // 4. Fechar modal.
    setPendingConfirm(null)
    // 5. Permanece no paciente selecionado: a grade e o painel lateral já reagem
    //    sozinhos (reservasConfirmadas/sugestoes derivam de `aceites`), então o
    //    "Reservado" aparece imediatamente sem precisar sair da tela do paciente.
    toast(`✅ ${sessoes.length} ${sessoes.length === 1 ? "sessão reservada" : "sessões reservadas"} para ${pac}. Aguardando sincronização da grade.`)
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
        obs: motivo || undefined,
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

  function onUndoRecusa(dia: string, hora: string, tP: string, prof: string) {
    sRec?.(recGlobal.filter(r =>
      !(r.paciente === pac && r.dia === dia && r.hora === hora
        && r.especialidade === tP && r.profissional === prof)
    ))
    persistAceites(
      aceites
        .map(b => {
          if (b.pac !== pac || b.status !== "recusado") return b
          const novas = b.sessoes.filter(s => !(s.dia === dia && s.hora === hora && s.tP === tP && s.prof === prof))
          return { ...b, sessoes: novas }
        })
        .filter(b => b.sessoes.length > 0)
    )
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
    const seenOf = new Set<string>()
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP || PACS_ADMIN.has(rawP) || EXCLUIR_GAPS.has(r.Terapia)) continue
      const p = agendMergeMap.get(rawP) ?? rawP
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp) continue
      const hm = pm(hiStr(r)) ?? hiMin(r)
      const dk = `${p}|||${r["Dia da Semana"]}|||${hm}|||${r.Terapia}|||${r.Profissional}`
      if (seenOf.has(dk)) continue
      seenOf.add(dk)
      qtdOf[`${p}|||${esp}`] = (qtdOf[`${p}|||${esp}`] || 0) + 1
    }
    // Reservas aguardando resposta/confirmação também ocupam a vaga — sem isso o
    // motor de sugestões (buildSugestoes) continuaria ofertando sessões além do que
    // resta de autorização. `seenOf` evita dupla contagem após a sincronização.
    for (const b of aceites) {
      if (b.status !== "pendente" && b.status !== "confirmado") continue
      if (PACS_ADMIN.has(b.pac)) continue
      for (const s of b.sessoes) {
        if (EXCLUIR_GAPS.has(s.tP)) continue
        const esp = TERAPIA_TO_ESP[s.tP]
        if (!esp) continue
        const hm = pm(s.hora)
        if (hm === null) continue
        const dk = `${b.pac}|||${s.dia}|||${hm}|||${s.tP}|||${s.prof}`
        if (seenOf.has(dk)) continue
        seenOf.add(dk)
        qtdOf[`${b.pac}|||${esp}`] = (qtdOf[`${b.pac}|||${esp}`] || 0) + 1
      }
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
  }, [cRows, lRows, agend, agendIdMap, agendMergeMap, aceites])

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
  const [situacaoOpen, setSituacaoOpen]   = useState(false)
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
    const qtdReserva: Record<string, number> = {}
    const seenOf = new Set<string>()
    for (const r of agend) {
      const rawP = r["Nome Favorecido"]
      if (!rawP || EXCLUIR_GAPS.has(r.Terapia)) continue
      if ((agendMergeMap.get(rawP) ?? rawP) !== pac) continue
      const esp = TERAPIA_TO_ESP[r.Terapia]
      if (!esp) continue
      const hm = pm(hiStr(r)) ?? hiMin(r)
      const dk = `${r["Dia da Semana"]}|||${hm}|||${r.Terapia}|||${r.Profissional}`
      if (seenOf.has(dk)) continue
      seenOf.add(dk)
      qtdOf[esp] = (qtdOf[esp] || 0) + 1
    }
    // Reservas ainda não sincronizadas com a grade (aguardando resposta/confirmação)
    // já ocupam a vaga — sem isso o painel mostra menos sessões do que a grade real.
    // `seenOf` evita dupla contagem quando a sessão já sincronizou e apareceu em `agend`.
    // `qtdReserva` isola a parte "reservada" para exibir separado do que já sincronizou
    // (ex.: "6 +2 / 30") — some automaticamente após a sincronização, quando a mesma
    // sessão passa a bater com `agend` e cai no `seenOf.has(dk)` acima.
    for (const b of aceites) {
      if (b.pac !== pac || (b.status !== "pendente" && b.status !== "confirmado")) continue
      for (const s of b.sessoes) {
        if (EXCLUIR_GAPS.has(s.tP)) continue
        const esp = TERAPIA_TO_ESP[s.tP]
        if (!esp) continue
        const hm = pm(s.hora)
        if (hm === null) continue
        const dk = `${s.dia}|||${hm}|||${s.tP}|||${s.prof}`
        if (seenOf.has(dk)) continue
        seenOf.add(dk)
        qtdOf[esp] = (qtdOf[esp] || 0) + 1
        qtdReserva[esp] = (qtdReserva[esp] || 0) + 1
      }
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
      .map(([esp, aut]) => ({ esp, aut, of: qtdOf[esp] || 0, reservado: qtdReserva[esp] || 0, dif: Math.round((aut - (qtdOf[esp] || 0)) * 10) / 10 }))
      .sort((a, b) => b.dif - a.dif)
  }, [pac, agend, lRows, agendIdMap, agendMergeMap, aceites])

  const sugestoes = useMemo(() => {
    if (!pac || estrategia !== "S1") return [] as Sugestao[]
    const conv      = pacConvMap[pac] || ""
    const isLiminar = /LIMINAR/i.test(cfg.judicialMap?.[pac] || "")
    // CRON-008: bundles "confirmado" (Reserva Pendente) são passados para que a vaga
    // implantada saia da lista de sugestões — tanto para o próprio paciente (não pode
    // ser reofertada) quanto para os demais (slot já reservado, ver slotsReservadosOutros).
    // Bundles "pendente" continuam fora do cálculo — preserva o comportamento anterior
    // de manter os cards visíveis enquanto aguardam confirmação do responsável.
    const aceitesConfirmados = aceites.filter(a => a.status === "confirmado")
    return buildSugestoes(pac, agend, agendClin, cRows, gapMap, aceitesConfirmados, conv, isLiminar)
  }, [pac, estrategia, agend, agendClin, cRows, gapMap, pacConvMap, cfg.judicialMap, aceites])

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

  const totalAceitos = aceites.filter(a => a.pac === pac).reduce((acc, b) => acc + b.sessoes.length, 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSituacaoOpen(false); setConvOpen(false); setDropOpen(false) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  function selectPac(p: string) { setPac(p); setInputVal(p); setDropOpen(false); setHighlightedIdx(-1) }

  return (
    <>
      <style>{`
        .ocup-workbench-bar {
          display: grid;
          grid-template-columns: 35fr 12fr 38fr 15fr;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px 0 0 16px;
          margin-bottom: 16px;
          margin-right: -1.5rem;
          position: relative;
        }
        @media (max-width: 900px) {
          .ocup-workbench-bar { grid-template-columns: 1fr 1fr; }
          .ocup-workbench-bar > div:nth-child(2) { border-right: none !important; }
        }
        @media (max-width: 560px) {
          .ocup-workbench-bar { grid-template-columns: 1fr; }
          .ocup-workbench-bar > div { border-right: none !important; border-bottom: 1px solid var(--border); }
          .ocup-workbench-bar > div:last-child { border-bottom: none !important; }
        }
        @media (pointer: coarse) {
          .ocup-btn-situacao { min-height: 44px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ocup-workbench-bar * { transition: none !important; }
        }
      `}</style>
      {/* ── WORKBENCH BAR ─────────────────────────────────────────────────────── */}
      <div className="ocup-workbench-bar">

        {/* Área 1 — Paciente */}
        <div style={{ padding: "14px 18px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "6px" }}>
          <label htmlFor="pac-search" style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.02em" }}>Paciente</label>
          <div style={{ position: "relative" }}>
            <input
              id="pac-search"
              type="text"
              aria-label="Buscar paciente"
              aria-autocomplete="list"
              aria-controls={dropOpen ? "pac-listbox" : undefined}
              aria-expanded={dropOpen}
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); setPac(""); setDropOpen(true); setHighlightedIdx(-1) }}
              onFocus={() => { setDropOpen(true); setInputFocused(true) }}
              onBlur={() => { setTimeout(() => { setDropOpen(false); setHighlightedIdx(-1) }, 150); setInputFocused(false); if (pac) setInputVal(pac) }}
              onKeyDown={e => {
                if (!dropOpen || filteredPacs.length === 0) return
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  const next = Math.min(highlightedIdx + 1, filteredPacs.length - 1)
                  setHighlightedIdx(next)
                  listboxRef.current?.children[next]?.scrollIntoView({ block: "nearest" })
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  const prev = Math.max(highlightedIdx - 1, 0)
                  setHighlightedIdx(prev)
                  listboxRef.current?.children[prev]?.scrollIntoView({ block: "nearest" })
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  const idx = highlightedIdx >= 0 ? highlightedIdx : (filteredPacs.length === 1 ? 0 : -1)
                  if (idx >= 0) selectPac(filteredPacs[idx])
                } else if (e.key === "Escape") {
                  setDropOpen(false); setHighlightedIdx(-1)
                  if (pac) setInputVal(pac)
                }
              }}
              placeholder="Buscar paciente..."
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: "9px", padding: "7px 12px", fontSize: "16px", fontFamily: "inherit", outline: "none", background: "var(--card)", color: "inherit", boxShadow: inputFocused ? `0 0 0 2px ${B.navy}` : "none" }}
            />
            {dropOpen && filteredPacs.length > 0 && (
              <div ref={listboxRef} id="pac-listbox" role="listbox" aria-label="Pacientes" style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 100, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", maxHeight: "200px", overflowY: "auto" }}>
                {filteredPacs.map((p, i) => {
                  const st  = pacStatusMap[p]
                  const dot = st === "deficit" ? "#dc2626" : st === "deficit-sobre" ? "#ea580c" : st === "em-dia" ? "#16a34a" : st === "sobreofertado" ? "#d97706" : "#d1d5db"
                  const stLabel = st === "deficit" ? "deficit" : st === "deficit-sobre" ? "deficit com sobreoferta" : st === "em-dia" ? "em dia" : st === "sobreofertado" ? "sobreofertado" : "sem laudo"
                  const isSelected  = p === pac
                  const isHighlight = i === highlightedIdx
                  return (
                    <button key={p} type="button" role="option" aria-selected={isSelected} aria-label={`${p} — ${stLabel}`} onMouseDown={() => selectPac(p)}
                      style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left", padding: "8px 12px", background: isHighlight ? B.navy : isSelected ? "var(--muted)" : "transparent", border: "none", fontSize: "12px", cursor: "pointer", color: isHighlight ? "#fff" : isSelected ? B.navy : "var(--card-foreground)", fontWeight: isSelected || isHighlight ? 700 : 400, fontFamily: "inherit" }}>
                      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", background: isHighlight ? "#fff" : dot, flexShrink: 0 }} />
                      {p}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {pac && pacConvMap[pac] && (
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px", paddingLeft: "2px" }}>
              {pacConvMap[pac]}
            </div>
          )}
        </div>

        {/* Área 3 — Seleção */}
        <div style={{ padding: "14px 18px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.02em" }}>Seleção</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
            <button
              type="button"
              onClick={() => modalRef.current?.selectAll()}
              style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", whiteSpace: "nowrap" }}
            >
              Selecionar tudo
            </button>
            <button
              type="button"
              onClick={() => modalRef.current?.clearAll()}
              style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", whiteSpace: "nowrap" }}
            >
              Limpar Seleção
            </button>
          </div>
        </div>

        {/* Área 4 — Filtros */}
        <div style={{ padding: "14px 18px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.02em" }}>Filtros</div>
          <div style={{ display: "flex", gap: "8px" }}>

            {/* Situação — dropdown */}
            <div style={{ position: "relative", flex: 1 }}>
              <button
                type="button"
                aria-expanded={situacaoOpen}
                aria-haspopup="listbox"
                onClick={() => { setSituacaoOpen(v => !v); setConvOpen(false) }}
                className="ocup-btn-situacao"
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${statusFilter.size > 0 ? B.navy : "var(--border)"}`, background: statusFilter.size > 0 ? `${B.navy}15` : "var(--muted)", color: statusFilter.size > 0 ? B.navy : "var(--card-foreground)" }}>
                <span>Situação{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}</span>
                <span aria-hidden="true" style={{ fontSize: "10px", marginLeft: "4px" }}>{situacaoOpen ? "▲" : "▼"}</span>
              </button>
              {situacaoOpen && (
                <div role="listbox" aria-multiselectable="true" aria-label="Filtrar por situação" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,.1)", padding: "8px", minWidth: "230px", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {([
                    { key: "em-dia",        label: "Autorização = Oferta",               color: "#16a34a" },
                    { key: "deficit",       label: "Acrescentar",                        color: "#dc2626" },
                    { key: "deficit-sobre", label: "Acrescentar & Contém Sobreoferta",   color: "#ea580c" },
                    { key: "sobreofertado", label: "Sobreofertado & Nada P/ Acrescentar",color: "#d97706" },
                    { key: "sem-laudo",     label: "Sem autorização registrada",         color: "var(--muted-foreground)" },
                  ] as const).map(({ key, label, color }) => {
                    const isActive = statusFilter.has(key)
                    const count = countBySituacao[key] ?? 0
                    const toggle = () => setStatusFilter(prev => {
                      const next = new Set(prev)
                      if (next.has(key)) next.delete(key); else next.add(key)
                      return next
                    })
                    return (
                      <button key={key} type="button" role="option" aria-selected={isActive} onClick={toggle} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit", border: `1px solid ${isActive ? color : "var(--border)"}`,
                        background: isActive ? color : "var(--muted)", color: isActive ? "white" : "var(--card-foreground)", textAlign: "left",
                      }}>
                        <span>{label}</span>
                        <span aria-hidden="true" style={{ fontSize: "10px", fontWeight: 800, background: isActive ? "rgba(255,255,255,0.25)" : "var(--border)", color: isActive ? "white" : "var(--muted-foreground)", borderRadius: "10px", padding: "1px 7px", minWidth: "20px", textAlign: "center" }}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                  {statusFilter.size > 0 && (
                    <button type="button" onClick={() => setStatusFilter(new Set())} style={{ marginTop: "2px", padding: "4px 10px", borderRadius: "7px", fontSize: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--muted)", color: "var(--muted-foreground)", textAlign: "center" }}>
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Área 5 — Exportação */}
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
            const excelSerialToDateStr = (serial: number): string => {
              const d = new Date((serial - 25569) * 86400 * 1000)
              const dd = d.getUTCDate().toString().padStart(2, "0")
              const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0")
              return `${dd}/${mm}/${d.getUTCFullYear()}`
            }
            // Converte qualquer formato de data para DD/MM/YYYY normalizado.
            // Suporta: serial Excel, DD/MM/YY, DD/MM/YYYY, YYYY-MM-DD, DD-MM-YY, DD-MM-YYYY.
            const normalizeDate = (raw: string): string => {
              const n = Number(raw)
              if (!isNaN(n) && n > 1000) return excelSerialToDateStr(n)
              // Separador "/"
              const sp = raw.split("/")
              if (sp.length === 3) {
                let [a, b, c] = sp.map(s => s.trim())
                if (c.length === 2) c = `20${c}`
                // YYYY/MM/DD → reordena
                if (a.length === 4) return `${b.padStart(2,"0")}/${c.padStart(2,"0")}/${a}`
                return `${a.padStart(2,"0")}/${b.padStart(2,"0")}/${c}`
              }
              // Separador "-"
              const sd = raw.split("-")
              if (sd.length === 3) {
                let [a, b, c] = sd.map(s => s.trim())
                if (c.length === 2) c = `20${c}`
                // YYYY-MM-DD (ISO) → reordena para DD/MM/YYYY
                if (a.length === 4) return `${b.padStart(2,"0")}/${c.padStart(2,"0")}/${a}`
                return `${a.padStart(2,"0")}/${b.padStart(2,"0")}/${c}`
              }
              return raw
            }
            // Retorna string "YYYYMMDD" para comparação lexicográfica; "" se inválido.
            const toSortable = (d: string) => {
              const parts = d.split("/")
              if (parts.length !== 3) return ""
              let [dd, mm, yyyy] = parts.map(s => s.trim())
              if (yyyy.length === 2) yyyy = `20${yyyy}`
              if (yyyy.length !== 4) return ""
              return `${yyyy}${mm.padStart(2,"0")}${dd.padStart(2,"0")}`
            }
            // Sortable de hoje — descarta datas futuras (podem surgir de conversão errada)
            const _now = new Date()
            const todaySortable = `${_now.getFullYear()}${String(_now.getMonth()+1).padStart(2,"0")}${String(_now.getDate()).padStart(2,"0")}`
            // Mapa nome normalizado → nome canônico (para resolver variações de grafia em lRows)
            const normNameMap: Record<string, string> = {}
            for (const p of todosPacs) normNameMap[normalizeName(p)] = p
            const pacAutEmMap: Record<string, string> = {}
            for (const l of lRows) {
              const idFav = String(l["ID Favorecido"] ?? l["Id Favorecido"] ?? "").trim().replace(/\.0$/, "")
              const rawPac = String(l["Paciente"] || "").trim()
              const p = (idFav ? agendIdMap.get(idFav) : undefined)
                ?? normNameMap[normalizeName(rawPac)]
                ?? agendMergeMap.get(rawPac)
                ?? rawPac
              if (!p || PACS_ADMIN.has(p)) continue
              // Tenta o campo em variações de capitalização
              const autRaw = l["Autorizado em"] ?? l["Autorizado Em"] ?? l["autorizado em"]
              const raw = normalizeDate(String(autRaw || "").trim())
              if (!raw) continue
              const s = toSortable(raw)
              if (!s || s > todaySortable) continue   // descarta datas futuras ou inválidas
              if (!pacAutEmMap[p] || s > toSortable(pacAutEmMap[p])) {
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
              }
            })
            const ws = XLSX.utils.json_to_sheet(rows)
            ws["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 28 }, { wch: 30 }, { wch: 40 }]
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Pacientes")
            XLSX.writeFile(wb, "relatorio_pacientes.xlsx")
          }
          return (
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", gap: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Relatório de Pacientes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <div style={{ fontSize: "28px", fontWeight: 800, color: B.navy, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{todosPacs.length}</div>
                <div style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 500 }}>Pacientes analisados</div>
              </div>
              <button
                onClick={handleExport}
                style={{ padding: "4px 10px", borderRadius: "7px", border: "1px solid #d1fae5", background: "#ecfdf5", color: "#065f46", fontSize: "10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "4px" }}>
                ↓ Exportar XLSX
              </button>
            </div>
          )
        })()}

      </div>

      {/* ── WORKSPACE ──────────────────────────────────────────────────────────── */}
      {!pac && (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>🧒</div>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--card-foreground)", marginBottom: "4px" }}>Selecione um paciente</div>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Apenas pacientes com déficit de sessões autorizadas aparecem na lista.</div>
        </div>
      )}

      {pac && (
        <>
          <TodasSugestoesModal
            ref={modalRef}
            key={pac}
            pac={pac}
            conv={pacConvMap[pac] || ""}
            cRows={cRows}
            sugestoes={sugestoes}
            pacGaps={pacGaps}
            pacAllEsp={pacAllEsp}
            stOf={stOf}
            setSt={setSt}
            estrategia={estrategia}
            setEstrategia={setEstrategia}
            onAceitar={handleAceitar}
            onInviavel={handleInviavel}
            onAcaoDireta={handleAcaoDireta}
            recusadasSet={recusadasSet}
            onUndoRecusa={onUndoRecusa}
            reservasConfirmadas={reservasConfirmadas}
          />
          <AceitesPanel pac={pac} aceites={aceites} onUpdate={persistAceites} onVerAll={() => {}} />
        </>
      )}

      {pendingConfirm && (
        <ConfirmarImplantacaoModal
          pac={pac}
          sessoesAtuais={pendingConfirm.beforeCount}
          sessoes={pendingConfirm.sessoes}
          onConfirm={confirmarImplantacao}
          onCancel={cancelarImplantacao}
        />
      )}

      {invPending && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) { setInvPending(null); setInvMotivo("") } }}
        >
          <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px", textWrap: "balance" as const }}>⛔ Marcar como Inviável</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px" }}>Removido de TODAS as sugestões até tirado da lista.</div>
            <div style={{ background: "var(--muted)", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>{pac}</div>
            <textarea
              value={invMotivo}
              onChange={e => setInvMotivo(e.target.value)}
              placeholder="Motivo (ex: família faltando muito...)"
              rows={2}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", resize: "none", marginBottom: "14px", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={confirmInv} style={{ padding: "8px 16px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                Confirmar
              </button>
              <button onClick={() => { setInvPending(null); setInvMotivo("") }} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
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

        <div style={{ fontWeight: 800, fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontSize: "14px", color: B.navy }}>
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
          <button onClick={() => { setPendingInv(true); setInvMotivo("") }} style={btnStyle("#fef2f2", "#dc2626", "#fca5a5")}>
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

    {/* Modal de confirmação inviável */}
    {pendingInv && (
      <div
        style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
        onClick={e => { if (e.target === e.currentTarget) { setPendingInv(false); setInvMotivo("") } }}
      >
        <div style={{ background: "var(--card)", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "22px" }}>
          <div style={{ fontWeight: 900, fontSize: "16px", color: B.navy, marginBottom: "4px", textWrap: "balance" as const }}>⛔ Confirmar Inviável</div>
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
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", fontSize: "16px", fontFamily: "inherit", resize: "none", marginBottom: "16px", boxSizing: "border-box" }}
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
