"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { B, DIAS_UTIL, EXCLUIR_OCUP, isProfBloqueadoTemp, TERAPIA_TO_ESP } from "@/lib/cronograma/constants"
import { fmtName, getTurno, gPrio, pm } from "@/lib/cronograma/helpers"
import { slotValidoParaPaciente } from "@/lib/cronograma/candidatos"
import { buildSaidaAnalise } from "@/lib/cronograma/saida"
import { SaidaCronModal } from "./SaidaCronModal"
import type {
  AfetadaItem, CsvRow, LaudoRow, OpcaoEstrategia, ResultItem, StatusEntry, StatusMap, StatusSaida, MovimentoSessao, CfgState,
} from "@/types/cronograma"

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const ALL_SLOTS = [
  "08:00","08:40","09:20","10:00","10:40","11:20",
  "13:00","13:40","14:20","15:00","15:40","16:20","17:00",
]
const MANHA_SLOTS = new Set(["08:00","08:40","09:20","10:00","10:40","11:20"])
const TARDE_SLOTS = new Set(["13:00","13:40","14:20","15:00","15:40","16:20","17:00"])

const DIA_ABR: Record<string, string> = {
  "Segunda-feira": "Seg",
  "Terça-feira":   "Ter",
  "Quarta-feira":  "Qua",
  "Quinta-feira":  "Qui",
  "Sexta-feira":   "Sex",
}

// Pacientes fictícios — sessões destes nomes não precisam ser remanejadas
const PACIENTES_FICTICIOS = new Set([
  "Notificação Prévia",
  "Horário Bloqueado",
  "Horário Administrativo",
  "Alinhamento Sandra",
  "Alinhamento Gracielle",
  "Alinhamento Amanda",
  "Supervisor Severino Junior",
  "Supervisora Michelle Brasil",
  "Supervisora Susane Vitória",
  "Supervisora Beatriz Paiva",
  "Supervisora Fernanda Lima",
  "Ainda não selecionado",
])

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface CandidatoSlot { pac: string; esp: string; gap: number; conv: string; prio: 1 | 2 | 3 | 4 | 5 }
type CandidatoWA = "aguardando" | "recusado" | "inviavel"
interface ScheduleModalState { slotKey: string; candidato: CandidatoSlot }

interface Props {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  cfg: CfgState
  statusMap: StatusMap
  persistStatus: (map: StatusMap) => void
}

interface StatusPayload {
  estrategiaSel: string | null
  opcaoSel: number
  opcao: OpcaoEstrategia | null
  movimentos?: MovimentoSessao[] | null
  obs: string
  slotReservado: string | null
}

// ─── ESTILOS DE STATUS ────────────────────────────────────────────────────────

const ST_S: Record<string, { bg: string; c: string; l: string }> = {
  pendente:    { bg: "#f3f4f6", c: "#6b7280",  l: "Pendente" },
  aguardando:  { bg: B.blueLt,  c: B.blue,     l: "Em Acompanhamento" },
  resolvido:   { bg: B.limeLt,  c: "#4a6e20",  l: "Resolvido" },
  recusado:    { bg: "#fef2f2", c: "#dc2626",  l: "Recusado" },
  sem_solucao: { bg: "#f3f4f6", c: "#6b7280",  l: "Sem solução" },
}

const BD: Record<string, string> = {
  pendente:    "#e5e7eb",
  aguardando:  `${B.blue}66`,
  resolvido:   `${B.lime}88`,
  recusado:    "#fca5a5",
  sem_solucao: "#e5e7eb",
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtCh(min: number): string {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
}

function normHora(t: string | null | undefined): string {
  const min = pm(t)
  if (min === null) return String(t || "")
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
}

function pctBadge(pct: number): { bg: string; color: string } {
  if (pct >= 85) return { bg: "#dcfce7", color: "#166534" }
  if (pct >= 60) return { bg: B.blueLt, color: B.blue }
  return { bg: "#f3f4f6", color: "#6b7280" }
}

function fmtPacAgenda(full: string): string {
  const particles = new Set(["da","de","do","das","dos","e","di"])
  const words = full.trim().split(/\s+/).filter(w => !particles.has(w.toLowerCase()))
  if (words.length <= 1) return words[0] ?? full
  return `${words[0]} ${words[1]}`
}

// ─── MAPEAMENTOS DE ESTRATÉGIA ────────────────────────────────────────────────

const ESTRATEGIA_FILTER_MAP: Record<string, (r: ResultItem) => boolean> = {
  e1:  r => !!r.analise.e1,
  e2:  r => !!r.analise.e2,
  e3:  r => !!r.analise.e3,
  e4:  r => r.analise.e4.length > 0,
  e5:  r => !!r.analise.e5,
  e6:  r => !!r.analise.e6,
  e7:  r => !!r.analise.e7,
  sem: r => !!r.analise.semSolucao,
}

const DONUT_NAME_TO_KEY: Record<string, string> = {
  "#1": "e1", "#2": "e2", "#3": "e3", "#4": "e4",
  "#5": "e5", "#6": "e6", "#7": "e7", "—": "sem",
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export function SaidaProfMode({ cRows, lRows, cfg, statusMap, persistStatus }: Props) {
  const [prof, setProf] = useState("")
  const [inputVal, setInputVal] = useState("")
  const [dropOpen, setDropOpen] = useState(false)
  const [selDT, setSelDT] = useState(new Set<string>())
  const [results, setResults] = useState<ResultItem[] | null>(null)
  const [modalGroup, setModalGroup] = useState<ResultItem[] | null>(null)
  const [modalTabIdx, setModalTabIdx] = useState(0)
  const [slotModal, setSlotModal] = useState<string | null>(null)
  const [scheduleModal, setScheduleModal] = useState<ScheduleModalState | null>(null)
  const [candidatoWA, setCandidatoWA] = useState<Record<string, CandidatoWA>>({})
  const [estrategiaFiltro, setEstrategiaFiltro] = useState<Set<string>>(new Set())
  const comboRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  const todosProfissionais = useMemo(() =>
    cRows.length
      ? [...new Set(cRows.map(r => String(r.Profissional || "")).filter(Boolean).filter(p => !isProfBloqueadoTemp(p)))].sort()
      : []
  , [cRows])

  const filteredProfs = useMemo(() => {
    if (!inputVal) return todosProfissionais
    const q = inputVal.toLowerCase()
    return todosProfissionais.filter(p => p.toLowerCase().includes(q))
  }, [todosProfissionais, inputVal])

  const agendRows = useMemo(() => cRows.filter(r => r["Status do Agendamento"] === "Agendado"), [cRows])

  const profDT = useMemo<Record<string, Set<string>>>(() => {
    if (!prof || !cRows.length) return {}
    const dt: Record<string, Set<string>> = {}
    let countTotal = 0, countAgend = 0, countFict = 0, countExcl = 0, countDia = 0, countOk = 0
    for (const r of cRows) {
      if (r.Profissional !== prof) continue
      countTotal++
      if (r["Status do Agendamento"] !== "Agendado") continue
      countAgend++
      const nome = String(r["Nome Favorecido"] || "")
      if (!nome || PACIENTES_FICTICIOS.has(nome)) { countFict++; continue }
      if (EXCLUIR_OCUP.has(String(r.Terapia || ""))) { countExcl++; continue }
      const dia = String(r["Dia da Semana"] || "")
      if (!(DIAS_UTIL as readonly string[]).includes(dia)) { countDia++; continue }
      countOk++
      if (!dt[dia]) dt[dia] = new Set()
      dt[dia].add(getTurno(String(r.HI_str || "")))
    }
    const empty = Object.keys(dt).length === 0
    if (empty && prof) {
      console.warn(`[profDT] "${prof}" — VAZIO. total=${countTotal} | agendado=${countAgend} | ficticio=${countFict} | excluirOcup=${countExcl} | diaInvalido=${countDia} | ok=${countOk}`)
    } else if (prof) {
      console.log(`[profDT] "${prof}" — dias:`, Object.keys(dt), `| total=${countTotal} | agendado=${countAgend} | ok=${countOk}`)
    }
    return dt
  }, [prof, cRows])

  const todosCount = Object.values(profDT).reduce((s, ts) => s + ts.size, 0)

  const reservados = useMemo(() => {
    const s = new Set<string>()
    for (const v of Object.values(statusMap)) {
      if ((v.status === "aguardando" || v.status === "resolvido") && v.slotReservado) s.add(v.slotReservado)
    }
    return s
  }, [statusMap])

  // Distribuição #1–#7/sem para o donut superior
  const donutData = useMemo(() => {
    if (!results || results.length === 0) return null
    let n1 = 0, n2 = 0, n3 = 0, n4 = 0, n5 = 0, n6 = 0, n7 = 0, sem = 0
    for (const item of results) {
      const a = item.analise
      if (a.e1)               n1++
      else if (a.e2)          n2++
      else if (a.e3)          n3++
      else if (a.e4.length)   n4++
      else if (a.e5)          n5++
      else if (a.e6)          n6++
      else if (a.e7)          n7++
      else                    sem++
    }
    const total = n1 + n2 + n3 + n4 + n5 + n6 + n7 + sem
    return {
      total,
      slices: [
        { name: "#1", label: "Mesma terapia, mesmo horário",       value: n1,  color: B.lime },
        { name: "#2", label: "Posições alteradas, prof. mantidos", value: n2,  color: "#0ea5e9" },
        { name: "#3", label: "Mesma terapia, horário adjacente",   value: n3,  color: B.blue },
        { name: "#4", label: "Outra terapia, mesmo horário",       value: n4,  color: B.purple },
        { name: "#5", label: "Posições alteradas, prof. trocados", value: n5,  color: "#f97316" },
        { name: "#6", label: "Alterar dia, mesmos profissionais",  value: n6,  color: "#8b5cf6" },
        { name: "#7", label: "Alterar dia, prof. diferentes",      value: n7,  color: "#6b7280" },
        { name: "—",  label: "Sem solução",                    value: sem, color: "#d1d5db" },
      ].filter(d => d.value > 0),
    }
  }, [results])

  // Garantidos ou Dependentes — agrupa estratégias por nível de confirmação necessária
  const garantidoData = useMemo(() => {
    if (!results || results.length === 0) return null
    let verde = 0, amarelo = 0, azul = 0, vermelho = 0, sem = 0
    for (const item of results) {
      const a = item.analise
      if      (a.e1 || a.e2)     verde++
      else if (a.e3 || a.e6)     amarelo++
      else if (a.e4.length)      azul++
      else if (a.e5 || a.e7)     vermelho++
      else                       sem++
    }
    const total = verde + amarelo + azul + vermelho + sem
    return {
      total,
      slices: [
        { name: "100% garantido",                          est: "#1, #2", value: verde,    color: "#16a34a" },
        { name: "Depende do aceite da família",             est: "#3, #6", value: amarelo,  color: "#d97706" },
        { name: "Depende dos prazos da Autorização",        est: "#4",     value: azul,     color: "#2563eb" },
        { name: "Depende do aval terapêutico e da família", est: "#5, #7", value: vermelho, color: "#dc2626" },
        { name: "Sem solução",                              est: "—",      value: sem,      color: "#9ca3af" },
      ].filter(d => d.value > 0),
    }
  }, [results])

  // Sessões sem solução → hipótese novo profissional
  const semSolucaoItems = useMemo(() =>
    results ? results.filter(r => r.analise.semSolucao) : []
  , [results])

  const novoProfData = useMemo(() => {
    if (!semSolucaoItems.length) return null

    const byDay: Record<string, AfetadaItem[]> = {}
    for (const item of semSolucaoItems) {
      const d = item.afetada.dia
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(item.afetada)
    }
    const dias = DIAS_UTIL.filter(d => byDay[d])
    const total = semSolucaoItems.length

    // Slots de trabalho por dia (apenas turnos que têm sessões)
    const dayWorkSlots: Record<string, Set<string>> = {}
    let totalSlots = 0
    for (const d of dias) {
      const items = byDay[d]
      const hasManha = items.some(af => MANHA_SLOTS.has(normHora(af.hora)))
      const hasTarde = items.some(af => TARDE_SLOTS.has(normHora(af.hora)))
      const slots = new Set<string>()
      if (hasManha) { for (const s of MANHA_SLOTS) slots.add(s); totalSlots += 6 }
      if (hasTarde) { for (const s of TARDE_SLOTS) slots.add(s); totalSlots += 7 }
      dayWorkSlots[d] = slots
    }

    const livreSlots = Math.max(0, totalSlots - total)
    const ocupPct = totalSlots > 0 ? (total / totalSlots) * 100 : 0

    const cargaSlices = [
      { name: "Ocupada", value: total,      color: "#22c55e" },
      { name: "Livre",   value: livreSlots, color: "#f87171" },
    ].filter(s => s.value > 0)

    const agendaMap: Record<string, AfetadaItem[]> = {}
    for (const item of semSolucaoItems) {
      const k = `${item.afetada.dia}|||${normHora(item.afetada.hora)}`
      if (!agendaMap[k]) agendaMap[k] = []
      agendaMap[k].push(item.afetada)
    }

    const displaySlots = ALL_SLOTS.filter(s => dias.some(d => dayWorkSlots[d].has(s)))

    const anyManha = dias.some(d => [...dayWorkSlots[d]].some(s => MANHA_SLOTS.has(s)))
    const anyTarde = dias.some(d => [...dayWorkSlots[d]].some(s => TARDE_SLOTS.has(s)))
    const turnInfo = anyManha && anyTarde
      ? "08:00 às 12:00 e 13:00 às 17:40 · intervalo de 12:00 às 13:00"
      : anyManha ? "08:00 às 12:00" : "13:00 às 17:40"

    const ocupPorDia = dias.map(d => {
      const slots_d = dayWorkSlots[d].size
      const ocup_d = ALL_SLOTS.filter(s => (agendaMap[`${d}|||${s}`] ?? []).length > 0).length
      const pct = slots_d > 0 ? (ocup_d / slots_d) * 100 : 0
      const livreMins = Math.max(0, slots_d - ocup_d) * 40
      const unidades = [...new Set(
        semSolucaoItems.filter(it => it.afetada.dia === d).map(it => it.afetada.unidade).filter(Boolean)
      )].join(", ")
      return { dia: d, pct, count: ocup_d, totalSlots: slots_d, livreMins, unidades }
    })

    const byEsp: Record<string, number> = {}
    for (const it of semSolucaoItems) {
      const esp = it.afetada.terapia || "—"
      byEsp[esp] = (byEsp[esp] ?? 0) + 1
    }
    const ocupPorEsp = Object.entries(byEsp)
      .sort((a, b) => b[1] - a[1])
      .map(([esp, count]) => ({
        esp,
        pct: totalSlots > 0 ? (count / totalSlots) * 100 : 0,
        count,
        totalSlots,
        livreMins: Math.max(0, totalSlots - count) * 40,
      }))

    return {
      total, totalSlots, livreSlots, ocupPct,
      chOcupMin: total * 40,
      chLivreMin: livreSlots * 40,
      chTotalMin: totalSlots * 40,
      dias, cargaSlices, agendaMap, displaySlots, dayWorkSlots, turnInfo,
      ocupPorDia, ocupPorEsp,
    }
  }, [semSolucaoItems])

  // Candidatos para slots livres do novo profissional.
  // A validação R2.1 + R5.1 usa slotValidoParaPaciente de candidatos.ts,
  // a mesma fonte que o módulo "Vagas Agora" (runAlgorithm.ts, Ocupação R2).
  const sugestoesPorSlot = useMemo<Record<string, CandidatoSlot[]>>(() => {
    if (!novoProfData || !lRows.length) return {}

    const especialidades = new Set(
      semSolucaoItems.map(i => TERAPIA_TO_ESP[i.afetada.terapia] ?? i.afetada.terapia)
    )

    const planoPorPac: Record<string, string> = {}
    for (const l of lRows) {
      const pac = String(l["Paciente"] || "").trim()
      if (pac && l["Plano"] && !planoPorPac[pac]) planoPorPac[pac] = String(l["Plano"])
    }

    const offered: Record<string, number> = {}
    for (const r of agendRows) {
      const pac = String(r["Nome Favorecido"] || "")
      const ter = String(r.Terapia || "")
      const esp = TERAPIA_TO_ESP[ter] ?? ter
      if (!pac || PACIENTES_FICTICIOS.has(pac)) continue
      offered[`${pac}|||${esp}`] = (offered[`${pac}|||${esp}`] ?? 0) + 1
    }

    const candidatos: CandidatoSlot[] = []
    const seenKey = new Set<string>()
    for (const l of lRows) {
      const pac = String(l["Paciente"] || "").trim()
      const esp = String(l["Especialidade"] || "").trim()
      const sit = String(l["Situação"] || "")
      const aut = parseFloat(String(l["Qtd autorizada"] || "0")) || 0
      if (!pac || !esp || !aut || sit.toLowerCase() !== "vigente") continue
      if (!especialidades.has(esp)) continue
      const k = `${pac}|||${esp}`
      if (seenKey.has(k)) continue
      seenKey.add(k)
      const gap = Math.round((aut - (offered[k] ?? 0)) * 10) / 10
      if (gap <= 0) continue
      const conv = String(l["Plano"] || planoPorPac[pac] || "")
      candidatos.push({ pac, esp, gap, conv, prio: gPrio(pac, planoPorPac, cfg.judicialMap || {}) })
    }
    candidatos.sort((a, b) => a.prio - b.prio || b.gap - a.gap || a.pac.localeCompare(b.pac))

    // Contagem de sugestões por pac|||esp para respeitar o limite do gap (canSug).
    // Um paciente com gap=1 aparece em no máximo 1 slot; gap=2 em até 2 slots, etc.
    const sugCount: Record<string, number> = {}
    const canSug = (pac: string, esp: string, gap: number) =>
      (sugCount[`${pac}|||${esp}`] ?? 0) < gap
    const incSug = (pac: string, esp: string) => {
      sugCount[`${pac}|||${esp}`] = (sugCount[`${pac}|||${esp}`] ?? 0) + 1
    }

    // Unidade por dia: o novo profissional trabalhará na mesma unidade do profissional saindo.
    // Necessário para que slotValidoParaPaciente não misture sessões de unidades distintas
    // ao checar R2.1 e R5.1 (o paciente não pode "preencher" R2.1 com sessões de outra unidade).
    const diaUnidade: Record<string, string> = {}
    for (const item of semSolucaoItems) {
      const d = item.afetada.dia
      if (!diaUnidade[d] && item.afetada.unidade) diaUnidade[d] = item.afetada.unidade
    }

    const result: Record<string, CandidatoSlot[]> = {}
    for (const dia of novoProfData.dias) {
      const unidade = diaUnidade[dia] || null
      for (const slot of novoProfData.dayWorkSlots[dia]) {
        const chave = `${dia}|||${slot}`
        if ((novoProfData.agendaMap[chave] ?? []).length > 0) continue
        const ocupadosNoSlot = new Set(
          agendRows
            .filter(r => String(r["Dia da Semana"] || "") === dia && normHora(String(r.HI_str || "")) === slot)
            .map(r => String(r["Nome Favorecido"] || ""))
        )
        const sug = candidatos.filter(c => {
          if (ocupadosNoSlot.has(c.pac)) return false
          if (!canSug(c.pac, c.esp, c.gap)) return false
          // R2.1 + R5.1 via validador compartilhado com "Vagas Agora".
          // unidade garante que sessões de outras unidades não contaminem os checks.
          return slotValidoParaPaciente(c.pac, dia, slot, agendRows, unidade)
        })
        if (sug.length) {
          for (const c of sug) incSug(c.pac, c.esp)
          result[chave] = sug
        }
      }
    }
    return result
  }, [novoProfData, lRows, agendRows, semSolucaoItems, cfg.judicialMap])

  function toggleDT(dia: string, turno: string) {
    setSelDT(prev => {
      const n = new Set(prev)
      const k = `${dia}|||${turno}`
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
    setResults(null)
  }

  function selectTodos() {
    const a = new Set<string>()
    for (const [d, ts] of Object.entries(profDT)) for (const t of ts) a.add(`${d}|||${t}`)
    setSelDT(a)
    setResults(null)
  }

  function analisar() {
    if (!prof || !selDT.size || !cRows.length) return
    const allRes = new Set(reservados)
    const seen = new Set<string>()
    const res: ResultItem[] = []

    const rowsProf = agendRows.filter(r => r.Profissional === prof)
    console.log(`[Saída] prof="${prof}" | agendRows total=${agendRows.length} | rowsProf=${rowsProf.length} | selDT=`, [...selDT])
    if (rowsProf.length === 0) {
      console.warn(`[Saída] 0 linhas Agendado para "${prof}". Primeiras 5 linhas agendadas:`)
      console.table(agendRows.slice(0, 5).map(r => ({ Profissional: r.Profissional, Terapia: r.Terapia, Dia: r["Dia da Semana"] })))
    }

    let cFict = 0, cExcl = 0, cSelDT = 0, cSeen = 0, cOk = 0, cErr = 0

    // Pré-passo: coleta todas as afetadas por paciente+dia para detectar buracos corretamente
    // quando múltiplas sessões consecutivas do mesmo profissional são removidas juntas
    const afetadasPorPacDia: Record<string, AfetadaItem[]> = {}
    {
      const seenPre = new Set<string>()
      for (const r of agendRows) {
        const nome = String(r["Nome Favorecido"] || "")
        if (r.Profissional !== prof || !nome || PACIENTES_FICTICIOS.has(nome)) continue
        if (EXCLUIR_OCUP.has(String(r.Terapia || ""))) continue
        const dia = String(r["Dia da Semana"] || "")
        const turno = getTurno(String(r.HI_str || ""))
        if (!selDT.has(`${dia}|||${turno}`)) continue
        const hora = normHora(String(r.HI_str || ""))
        const k = `${nome}|||${dia}|||${hora}|||${r.Terapia}`
        if (seenPre.has(k)) continue
        seenPre.add(k)
        const pacDia = `${nome}|||${dia}`
        if (!afetadasPorPacDia[pacDia]) afetadasPorPacDia[pacDia] = []
        afetadasPorPacDia[pacDia].push({
          pac: nome,
          terapia: String(r.Terapia || ""),
          terapiaExib: String(r["Terapia Exibição"] || r["Terapia Exibicao"] || "") || undefined,
          dia,
          hora,
          unidade: String(r.Unidade || ""),
          prof: String(r.Profissional || ""),
          conv: String(r["Convênio"] || ""),
        })
      }
    }

    for (const r of agendRows) {
      const nome = String(r["Nome Favorecido"] || "")
      if (r.Profissional !== prof || !nome || PACIENTES_FICTICIOS.has(nome)) { if (r.Profissional === prof) cFict++; continue }
      if (EXCLUIR_OCUP.has(String(r.Terapia || ""))) { cExcl++; continue }
      const dia = String(r["Dia da Semana"] || "")
      const turno = getTurno(String(r.HI_str || ""))
      if (!selDT.has(`${dia}|||${turno}`)) { cSelDT++; continue }
      const hora = normHora(String(r.HI_str || ""))
      const k = `${nome}|||${dia}|||${hora}|||${r.Terapia}`
      if (seen.has(k)) { cSeen++; continue }
      seen.add(k)

      const terapiaExibRaw = String(r["Terapia Exibição"] || r["Terapia Exibicao"] || "")
      const afetada: AfetadaItem = {
        pac: nome,
        terapia: String(r.Terapia || ""),
        terapiaExib: terapiaExibRaw || undefined,
        dia,
        hora,
        unidade: String(r.Unidade || ""),
        prof: String(r.Profissional || ""),
        conv: String(r["Convênio"] || ""),
      }

      try {
        const outrasAfetadasMesmoDia = (afetadasPorPacDia[`${nome}|||${dia}`] ?? [])
          .filter(af => !(af.hora === hora && af.terapia === String(r.Terapia || "")))
        const analise = buildSaidaAnalise(afetada, cRows, lRows, prof, allRes, outrasAfetadasMesmoDia)

        // Reservar slots da melhor estratégia disponível (em ordem de prioridade)
        if (analise.e1?.opcoes[0]) {
          const b = analise.e1.opcoes[0]
          allRes.add(`${b.prof}|||${b.dia}|||${b.hora}`)
        } else if (analise.e2?.opcoes[0]) {
          for (const m of analise.e2.opcoes[0].movimentos)
            allRes.add(`${m.paraProf}|||${m.paraDia}|||${m.paraHora}`)
        } else if (analise.e3?.opcoes[0]) {
          const b = analise.e3.opcoes[0]
          allRes.add(`${b.prof}|||${b.dia}|||${b.hora}`)
        } else if (analise.e4[0]?.opcoes[0]) {
          const b = analise.e4[0].opcoes[0]
          allRes.add(`${b.prof}|||${b.dia}|||${b.hora}`)
        } else if (analise.e5?.opcoes[0]) {
          for (const m of analise.e5.opcoes[0].movimentos)
            allRes.add(`${m.paraProf}|||${m.paraDia}|||${m.paraHora}`)
        } else if (analise.e6?.opcoes[0]) {
          for (const m of analise.e6.opcoes[0].movimentos)
            allRes.add(`${m.paraProf}|||${m.paraDia}|||${m.paraHora}`)
        } else if (analise.e7?.opcoes[0]) {
          for (const m of analise.e7.opcoes[0].movimentos)
            allRes.add(`${m.paraProf}|||${m.paraDia}|||${m.paraHora}`)
        }

        res.push({ pac: nome, afetada, analise })
        cOk++
      } catch (err) {
        console.error(`[Saída] Exceção para "${nome}" ${dia} ${afetada.hora}:`, err)
        cErr++
      }
    }

    console.log(`[Saída] Filtros: fictício=${cFict} | excluirOcup=${cExcl} | selDT=${cSelDT} | duplicado=${cSeen} | ok=${cOk} | erro=${cErr} | res.length=${res.length}`)
    if (cSelDT > 0) {
      const amostra = rowsProf.slice(0, 3).map(r => ({ dia: r["Dia da Semana"], HI_str: r.HI_str, turno: getTurno(String(r.HI_str || "")), selDT: [...selDT] }))
      console.warn("[Saída] Linhas filtradas por selDT. Amostra:", amostra)
    }

    res.sort((a, b) => {
      const pri = (x: ResultItem) =>
        x.analise.semSolucao ? 0
        : x.analise.buracoSiRemover ? 1
        : x.analise.min2Violation ? 2
        : x.analise.e1 ? 6
        : x.analise.e2 ? 5
        : x.analise.e3 ? 4
        : 3
      return pri(a) - pri(b)
    })
    setResults(res)
    setEstrategiaFiltro(new Set())
  }

  function handleStatus(afetada: AfetadaItem, status: StatusSaida, payload: StatusPayload) {
    const key = `${afetada.pac}|||${afetada.dia}|||${afetada.hora}|||${afetada.terapia}`
    const slotRes = (status === "recusado" || status === "sem_solucao") ? null : (payload.slotReservado ?? null)
    persistStatus({
      ...statusMap,
      [key]: { status, obs: payload.obs || "", estrategiaSel: payload.estrategiaSel, opcaoSel: payload.opcaoSel, opcao: payload.opcao, movimentos: payload.movimentos ?? null, slotReservado: slotRes, atualizadoEm: Date.now() },
    })
  }

  function getStatus(af: AfetadaItem): StatusEntry {
    return statusMap[`${af.pac}|||${af.dia}|||${af.hora}|||${af.terapia}`] ?? { status: "pendente" }
  }

  const counts = useMemo(() => {
    if (!results) return {} as Record<string, number>
    const c: Record<string, number> = { pendente: 0, aguardando: 0, resolvido: 0, recusado: 0, sem_solucao: 0 }
    for (const r of results) {
      const key = `${r.afetada.pac}|||${r.afetada.dia}|||${r.afetada.hora}|||${r.afetada.terapia}`
      c[statusMap[key]?.status ?? "pendente"]++
    }
    return c
  }, [results, statusMap])

  const pacGroups = useMemo(() => {
    if (!results) return []
    const acc: Record<string, ResultItem[]> = {}
    for (const r of results) (acc[r.pac] = acc[r.pac] ?? []).push(r)
    return Object.values(acc)
  }, [results])

  const filteredPacGroups = useMemo(() => {
    if (estrategiaFiltro.size === 0) return pacGroups
    return pacGroups
      .map(g => g.filter(r => {
        for (const key of estrategiaFiltro) {
          const pred = ESTRATEGIA_FILTER_MAP[key]
          if (pred?.(r)) return true
        }
        return false
      }))
      .filter(g => g.length > 0)
  }, [pacGroups, estrategiaFiltro])

  const canAnalyze = !!prof && selDT.size > 0 && cRows.length > 0

  // Derivados das sugestões para os slots livres
  const aConfirmarCount = Object.keys(sugestoesPorSlot).length
  const livresCount = Math.max(0, (novoProfData?.livreSlots ?? 0) - aConfirmarCount)
  const ocupPctExt = novoProfData
    ? Math.min(100, ((novoProfData.total + aConfirmarCount) / novoProfData.totalSlots) * 100)
    : 0
  const cargaSlicesExt = novoProfData ? [
    { name: "Confirmadas", value: novoProfData.total, color: "#22c55e" },
    { name: "A confirmar", value: aConfirmarCount,    color: "#fbbf24" },
    { name: "Livre",       value: livresCount,         color: "#f87171" },
  ].filter(s => s.value > 0) : []

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Linha 1: Formulário (flex-1) + Distribuição (280px) ─────────────── */}
      <div className="flex gap-4">

        {/* Card formulário */}
        <div style={{ flexShrink: 0, width: "360px", background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
          <div style={{ fontWeight: 800, color: B.navy, marginBottom: "6px", fontSize: "15px" }}>
            Saída de Profissional — Horário(s) Específico(s)
          </div>
          <div className="text-xs text-gray-500 mb-3">
            Selecione o profissional e os dias/turnos afetados. Cada vaga é oferecida a apenas um paciente.
          </div>

          <div className="mb-3">
            <div className="text-xs font-bold text-gray-500 mb-1">Profissional</div>
            <div ref={comboRef} style={{ position: "relative", width: "340px" }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => {
                  setInputVal(e.target.value)
                  setProf("")
                  setSelDT(new Set())
                  setResults(null)
                  setDropOpen(true)
                }}
                onFocus={() => setDropOpen(true)}
                placeholder="Buscar profissional..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                style={{ outline: "none" }}
              />
              {dropOpen && filteredProfs.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50,
                  background: "white", border: "1px solid #d1d5db", borderRadius: "10px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)", maxHeight: "200px", overflowY: "auto",
                }}>
                  {filteredProfs.map(p => (
                    <button
                      key={p}
                      onMouseDown={e => {
                        e.preventDefault()
                        setProf(p); setInputVal(p); setDropOpen(false); setSelDT(new Set()); setResults(null)
                      }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 12px", background: p === prof ? "#f3f4f6" : "none",
                        border: "none", fontSize: "13px", cursor: "pointer",
                        color: p === prof ? B.navy : "#374151", fontWeight: p === prof ? 700 : 400,
                      }}
                      onMouseEnter={e => { if (p !== prof) e.currentTarget.style.background = "#f9fafb" }}
                      onMouseLeave={e => { if (p !== prof) e.currentTarget.style.background = "none" }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {prof && Object.keys(profDT).length === 0 && (
            <div style={{ fontSize: "11px", color: "#ef4444", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "8px 12px", marginBottom: "4px" }}>
              Nenhuma sessão clínica encontrada para este profissional no CSV carregado.
              Possíveis causas: nome diferente no CSV, sessões com status diferente de &quot;Agendado&quot;, ou todas as sessões são administrativas.
              Abra o console (F12) e selecione este profissional novamente para ver o diagnóstico.
            </div>
          )}

          {prof && Object.keys(profDT).length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold text-gray-500">Dias e turnos afetados</span>
                <button
                  onClick={selectTodos}
                  style={{ padding: "3px 10px", borderRadius: "7px", border: `1px solid ${B.navy}`, background: selDT.size === todosCount ? B.navy : "white", color: selDT.size === todosCount ? "white" : B.navy, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                >
                  Todos
                </button>
              </div>
              <div className="flex flex-col gap-[5px]">
                {DIAS_UTIL.filter(d => profDT[d]).map(d => (
                  <div key={d} className="flex items-center gap-[6px]">
                    <span className="text-xs text-gray-700 w-20 font-medium">{d.replace("-feira", "")}</span>
                    {(["manhã", "tarde"] as const).filter(t => profDT[d]?.has(t)).map(t => {
                      const k = `${d}|||${t}`
                      const sel = selDT.has(k)
                      return (
                        <button
                          key={t}
                          onClick={() => toggleDT(d, t)}
                          style={{ padding: "4px 12px", borderRadius: "8px", border: `1px solid ${sel ? B.blue : "#d1d5db"}`, background: sel ? B.blueLt : "white", color: sel ? B.blue : "#6b7280", fontSize: "11px", fontWeight: sel ? 700 : 400, cursor: "pointer" }}
                        >
                          {t === "manhã" ? "Manhã" : "Tarde"}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={analisar}
            disabled={!canAnalyze}
            style={{ marginTop: "14px", padding: "8px 20px", borderRadius: "10px", background: canAnalyze ? B.navy : `${B.navy}55`, color: "white", border: "none", fontWeight: 800, fontSize: "13px", cursor: canAnalyze ? "pointer" : "not-allowed" }}
          >
            Analisar Impacto
          </button>
        </div>

        {/* ── Coluna direita: Distribuição + Garantidos ou Dependentes ─────────── */}
        <div style={{ display: "flex", flexDirection: "row", gap: "12px", flex: 1, minWidth: 0 }}>

          {/* Card Distribuição */}
          <div style={{ flex: 1, minWidth: 0, background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>
              Distribuição
            </div>
            {!donutData ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", border: "7px solid #e5e7eb" }} />
                <div style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
                  {results === null
                    ? <>Execute &quot;Analisar Impacto&quot;<br />para ver o resumo</>
                    : <span style={{ color: "#ef4444" }}>Nenhuma sessão clínica encontrada para este profissional. Verifique o console (F12) para detalhes.</span>
                  }
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                  {donutData.total} sessão(ões) afetada(s)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData.slices} cx="50%" cy="50%" innerRadius={58} outerRadius={82} dataKey="value" strokeWidth={0}>
                      {donutData.slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val ?? 0, name]} contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "4px 8px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "6px" }}>
                  {donutData.slices.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color, flexShrink: 0 }} />
                      <div style={{ fontSize: "13px", color: "#374151", flex: 1 }}>
                        <span style={{ fontWeight: 700 }}>{s.name}</span> {s.label}
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: B.navy, whiteSpace: "nowrap" }}>
                        {s.value} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({Math.round(s.value / donutData.total * 100)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Card Garantidos ou Dependentes */}
          <div style={{ flex: 1, minWidth: 0, background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>
              Garantidos ou Dependentes
            </div>
            {!garantidoData ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", border: "7px solid #e5e7eb" }} />
                <div style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
                  {results === null
                    ? <>Execute &quot;Analisar Impacto&quot;<br />para ver o resumo</>
                    : <span style={{ color: "#ef4444" }}>Nenhuma sessão clínica encontrada.</span>
                  }
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "6px" }}>
                  {garantidoData.total} sessão(ões) afetada(s)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={garantidoData.slices} cx="50%" cy="50%" innerRadius={58} outerRadius={82} dataKey="value" strokeWidth={0}>
                      {garantidoData.slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val ?? 0, name]} contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "4px 8px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {garantidoData.slices.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color, flexShrink: 0, marginTop: "2px" }} />
                      <div style={{ fontSize: "13px", color: "#374151", flex: 1, lineHeight: "1.4" }}>
                        {s.name}
                        <span style={{ display: "block", fontSize: "12px", color: "#9ca3af" }}>{s.est}</span>
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: B.navy, whiteSpace: "nowrap" }}>
                        {s.value} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({Math.round(s.value / garantidoData.total * 100)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

      </div>

      {/* ── Banner + Linha 2 (antes dos resultados) ─────────────────────────── */}
      {results && novoProfData && (
        <>
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "10px", padding: "8px 14px", fontSize: "11px", color: "#92400e", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px" }}>💡</span>
            <span>
              <strong>Hipótese: novo profissional.</strong>{" "}
              As {novoProfData.total} sessão(ões) abaixo não têm solução com a equipe atual.
              Caso você consiga contratar um profissional para cobrir este horário, veja como ficaria a carga e a agenda dele.
            </span>
          </div>

          {/* Grade 2×2: Agenda | Carga semanal / Ocup por dia | Ocup por esp */}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "12px", alignItems: "start" }}>

              {/* Agenda do novo profissional */}
              <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
                <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>
                  Agenda do novo profissional
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "10px" }}>
                  Dias e turnos necessários para cobrir as sessões sem solução
                </div>

                <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "#22c55e" }} />
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>sessões confirmadas</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "#fbbf24" }} />
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>sessões a confirmar</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "#fca5a5" }} />
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>livre</span>
                  </div>
                </div>

                <table style={{ borderCollapse: "collapse", tableLayout: "fixed", fontSize: "11px", width: `${48 + DIAS_UTIL.length * 90}px` }}>
                  <colgroup>
                    <col style={{ width: "48px" }} />
                    {DIAS_UTIL.map(d => <col key={d} style={{ width: "90px" }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ padding: "4px 6px", textAlign: "left", color: "#9ca3af", fontWeight: 600, borderBottom: "2px solid #e5e7eb", fontSize: "10px" }} />
                      {DIAS_UTIL.map(d => {
                        const isActive = novoProfData.dayWorkSlots[d] !== undefined
                        return (
                          <th key={d} style={{ width: "90px", padding: "6px 8px", textAlign: "center", fontWeight: 700, borderBottom: isActive ? `2px solid ${B.navy}` : "2px solid #e5e7eb", fontSize: "13px", color: isActive ? B.navy : "#d1d5db" }}>
                            {DIA_ABR[d] ?? d}
                            {isActive && <div style={{ fontSize: "11px", fontWeight: 600, color: B.blue, marginTop: "3px" }}>a contratar</div>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {novoProfData.displaySlots.map(slot => {
                      const isSeparator = slot === "13:00"
                      return (
                        <tr key={slot} style={{ borderTop: isSeparator ? "2px solid #d1d5db" : "1px solid #f3f4f6" }}>
                          <td style={{ padding: "2px 6px", color: "#9ca3af", fontSize: "10px", fontWeight: 500, height: "40px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                            {slot}
                          </td>
                          {DIAS_UTIL.map(d => {
                            const items = novoProfData.agendaMap[`${d}|||${slot}`] ?? []
                            const isWorking = novoProfData.dayWorkSlots[d]?.has(slot) ?? false

                            if (items.length > 0) {
                              return (
                                <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                                  <div style={{ background: "#22c55e", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", textAlign: "center", padding: "4px 6px", gap: "2px" }}>
                                    {items.map((it, idx) => (
                                      <div key={idx} style={{ fontWeight: 700, fontSize: idx === 0 ? "12px" : "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", lineHeight: 1.2, opacity: idx > 0 ? 0.9 : 1 }}>
                                        {fmtPacAgenda(it.pac)}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              )
                            } else if (isWorking) {
                              const chaveSlot = `${d}|||${slot}`
                              const sugs = sugestoesPorSlot[chaveSlot]
                              if (sugs?.length) {
                                return (
                                  <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                                    <div
                                      onClick={() => setSlotModal(chaveSlot)}
                                      style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", minHeight: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 4px", gap: "1px", cursor: "pointer" }}
                                    >
                                      <div style={{ fontWeight: 600, fontSize: "10px", color: "#92400e", lineHeight: 1.2 }}>
                                        {sugs.length} candidato{sugs.length > 1 ? "s" : ""}
                                      </div>
                                      <div style={{ fontSize: "9px", color: "#d97706", fontWeight: 700 }}>
                                        ver
                                      </div>
                                    </div>
                                  </td>
                                )
                              }
                              return (
                                <td key={d} style={{ padding: "2px 4px", verticalAlign: "middle" }}>
                                  <div style={{ background: "#fca5a5", borderRadius: "8px", height: "36px" }} />
                                </td>
                              )
                            } else {
                              return <td key={d} style={{ padding: "2px 4px" }} />
                            }
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

              </div>

              {/* Carga semanal */}
              <div style={{ minWidth: "240px", background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
                <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>Carga semanal</div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "6px" }}>Novo profissional</div>

                <div style={{ position: "relative" }}>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={cargaSlicesExt}
                        cx="50%" cy="50%"
                        innerRadius={46} outerRadius={66}
                        dataKey="value" strokeWidth={0}
                        startAngle={90} endAngle={-270}
                      >
                        {cargaSlicesExt.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={(val, name) => [`${val ?? 0} slot(s)`, name]}
                        contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "4px 8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: B.navy, lineHeight: 1 }}>
                      {ocupPctExt.toFixed(2).replace(".", ",")}%
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "11px", color: "#6b7280", marginBottom: "6px", flexWrap: "wrap" }}>
                  {cargaSlicesExt.map((s, i) => (
                    <span key={i}>
                      <span style={{ color: s.color, fontWeight: 700 }}>●</span>{" "}
                      {s.name} ({Math.round(s.value / novoProfData.totalSlots * 100)}%)
                    </span>
                  ))}
                </div>

                <div style={{ textAlign: "center", fontSize: "12px", color: "#6b7280", marginBottom: "2px" }}>
                  CH total: <strong style={{ color: B.navy }}>{fmtCh(novoProfData.chTotalMin)}</strong>
                </div>
                <div style={{ textAlign: "center", fontSize: "10px", color: "#9ca3af", marginBottom: "12px", lineHeight: 1.6 }}>
                  {novoProfData.turnInfo.includes("·") ? (
                    <>
                      {novoProfData.turnInfo.split("·")[0].trim()} ·<br />
                      {novoProfData.turnInfo.split("·")[1].trim()}
                    </>
                  ) : novoProfData.turnInfo}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ background: "#f0fdf4", borderRadius: "10px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#166534", lineHeight: 1 }}>{fmtCh(novoProfData.chOcupMin)}</div>
                    <div style={{ fontSize: "11px", color: "#22c55e", marginTop: "3px" }}>confirmadas</div>
                  </div>
                  {aConfirmarCount > 0 && (
                    <div style={{ background: "#fffbeb", borderRadius: "10px", padding: "8px 12px" }}>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#d97706", lineHeight: 1 }}>{fmtCh(aConfirmarCount * 40)}</div>
                      <div style={{ fontSize: "11px", color: "#fbbf24", marginTop: "3px" }}>a confirmar</div>
                    </div>
                  )}
                  <div style={{ background: "#fef2f2", borderRadius: "10px", padding: "8px 12px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#dc2626", lineHeight: 1 }}>{fmtCh(livresCount * 40)}</div>
                    <div style={{ fontSize: "11px", color: "#f87171", marginTop: "3px" }}>livres</div>
                  </div>
                </div>
              </div>

              {/* Ocupação por dia */}
              <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
                <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>Ocupação por dia</div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "12px" }}>Novo profissional</div>
                <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "44px", paddingRight: "12px" }}>Dia</th>
                      <th style={{ textAlign: "left", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "140px", paddingRight: "12px" }}>Unidade</th>
                      <th style={{ textAlign: "center", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "70px", paddingRight: "12px" }}>Sessões</th>
                      <th style={{ textAlign: "center", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "90px", paddingRight: "12px" }}>% ocup.</th>
                      <th style={{ textAlign: "right", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "60px" }}>Livre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {novoProfData.ocupPorDia.map(row => {
                      const badge = pctBadge(row.pct)
                      return (
                        <tr key={row.dia} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "9px 6px 9px 0", fontWeight: 700, color: "#1f2937", fontSize: "13px", whiteSpace: "nowrap" }}>
                            {DIA_ABR[row.dia] ?? row.dia}
                          </td>
                          <td style={{ padding: "9px 6px", color: "#374151", fontSize: "13px" }}>
                            {row.unidades || "—"}
                          </td>
                          <td style={{ padding: "9px 6px", textAlign: "center", fontWeight: 600, color: "#374151", fontSize: "13px" }}>
                            {row.count}/{row.totalSlots}
                          </td>
                          <td style={{ padding: "9px 6px", textAlign: "center" }}>
                            <span style={{ background: badge.bg, color: badge.color, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700, display: "inline-block", whiteSpace: "nowrap" }}>
                              {row.pct.toFixed(2).replace(".", ",")}%
                            </span>
                          </td>
                          <td style={{ padding: "9px 0 9px 6px", textAlign: "right", color: row.livreMins > 0 ? "#dc2626" : "#22c55e", fontWeight: 700, fontSize: "13px", whiteSpace: "nowrap" }}>
                            {fmtCh(row.livreMins)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Ocupação por especialidade */}
              <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "16px" }}>
                <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px", marginBottom: "2px" }}>Ocupação por especialidade</div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "12px" }}>Novo profissional</div>
                <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "180px", paddingRight: "12px" }}>Especialidade</th>
                      <th style={{ textAlign: "center", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "70px", paddingRight: "12px" }}>Sessões</th>
                      <th style={{ textAlign: "center", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "90px", paddingRight: "12px" }}>% ocup.</th>
                      <th style={{ textAlign: "right", color: "#9ca3af", fontWeight: 600, paddingBottom: "7px", fontSize: "11px", minWidth: "60px" }}>Livre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {novoProfData.ocupPorEsp.map(row => {
                      const badge = pctBadge(row.pct)
                      return (
                        <tr key={row.esp} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "9px 6px 9px 0", fontWeight: 600, color: "#1f2937", fontSize: "13px" }}>
                            {row.esp}
                          </td>
                          <td style={{ padding: "9px 6px", textAlign: "center", fontWeight: 600, color: "#374151", fontSize: "13px" }}>
                            {row.count}/{row.totalSlots}
                          </td>
                          <td style={{ padding: "9px 6px", textAlign: "center" }}>
                            <span style={{ background: badge.bg, color: badge.color, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700, display: "inline-block", whiteSpace: "nowrap" }}>
                              {row.pct.toFixed(2).replace(".", ",")}%
                            </span>
                          </td>
                          <td style={{ padding: "9px 0 9px 6px", textAlign: "right", color: row.livreMins > 0 ? "#dc2626" : "#22c55e", fontWeight: 700, fontSize: "13px", whiteSpace: "nowrap" }}>
                            {fmtCh(row.livreMins)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

          </div>
        </>
      )}

      {/* ── Linha 3: Resultados ──────────────────────────────────────────────── */}
      {results && (
        <div className="bg-white rounded-[14px] border border-gray-200 p-4">
          <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>
              {estrategiaFiltro.size > 0
                ? `${filteredPacGroups.length} paciente(s) · ${filteredPacGroups.reduce((s, g) => s + g.length, 0)} sessão(ões) filtrados`
                : `${pacGroups.length} paciente(s) afetado(s) · ${results.length} sessão(ões)`}
            </div>
            <div className="flex gap-[5px] flex-wrap">
              {Object.entries(ST_S).map(([k, v]) =>
                (counts[k] ?? 0) > 0 ? (
                  <span key={k} style={{ background: v.bg, color: v.c, borderRadius: "999px", padding: "2px 9px", fontSize: "11px", fontWeight: 700 }}>
                    {counts[k]}x {v.l}
                  </span>
                ) : null
              )}
            </div>
          </div>

          {/* ── Filtro por estratégia ── */}
          {donutData && donutData.slices.length > 1 && (
            <div className="flex gap-[5px] flex-wrap mb-3 items-center">
              <button
                onClick={() => {
                  const allKeys = donutData.slices.map(s => DONUT_NAME_TO_KEY[s.name]).filter(Boolean) as string[]
                  setEstrategiaFiltro(new Set(allKeys))
                }}
                style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}
              >
                Filtrar tudo
              </button>
              <button
                onClick={() => setEstrategiaFiltro(new Set())}
                style={{ padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}
              >
                Desmarcar tudo
              </button>
              <div style={{ width: "1px", height: "18px", background: "#e5e7eb", margin: "0 2px" }} />
              {donutData.slices.map(slice => {
                const key = DONUT_NAME_TO_KEY[slice.name]
                if (!key) return null
                const active = estrategiaFiltro.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => {
                      const next = new Set(estrategiaFiltro)
                      active ? next.delete(key) : next.add(key)
                      setEstrategiaFiltro(next)
                    }}
                    style={{
                      padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      background: active ? slice.color : "#f3f4f6",
                      color: active ? "white" : "#374151",
                      border: active ? `1px solid ${slice.color}` : "1px solid #e5e7eb",
                    }}
                  >
                    {slice.name} {slice.label} ({slice.value})
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: "9px", padding: "7px 12px", fontSize: "11px", color: B.blue, marginBottom: "12px" }}>
            Cada vaga é oferecida a um único paciente. Para liberar uma vaga, registre como Recusado.
          </div>

          <div className="flex flex-col gap-[7px]">
            {filteredPacGroups.map((sessoes, gi) => {
              const hasProblem = sessoes.some(r => r.analise.buracoSiRemover || r.analise.semSolucao)
              const allResolvido = sessoes.every(r => getStatus(r.afetada).status === "resolvido")
              const borderColor = hasProblem ? "#fca5a5" : allResolvido ? BD["resolvido"] : "#e5e7eb"

              return (
                <div key={gi} style={{ padding: "11px 13px", borderRadius: "12px", border: `1.5px solid ${borderColor}`, background: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "8px" }}>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "#1f2937" }}>{sessoes[0].pac}</div>
                    <button
                      onClick={() => { setModalGroup(sessoes); const firstSolvable = sessoes.findIndex(r => !r.analise.semSolucao); setModalTabIdx(firstSolvable >= 0 ? firstSolvable : 0) }}
                      style={{ padding: "6px 14px", borderRadius: "9px", background: B.navy, color: "white", border: "none", fontWeight: 700, fontSize: "11px", cursor: "pointer", flexShrink: 0 }}
                    >
                      Ver
                    </button>
                  </div>
                  {sessoes.map((r, si) => {
                    const st = getStatus(r.afetada)
                    const stSt = ST_S[st.status ?? "pendente"]
                    const { analise } = r
                    const showExib = r.afetada.terapiaExib && r.afetada.terapiaExib !== r.afetada.terapia
                    return (
                      <div key={si} style={{ display: "flex", alignItems: "flex-start", gap: "10px", flexWrap: "wrap", paddingTop: si > 0 ? "8px" : "0", marginTop: si > 0 ? "8px" : "0", borderTop: si > 0 ? "1px solid #f3f4f6" : "none" }}>
                        <div style={{ flex: "1 1 220px" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#1f2937", lineHeight: "1.3" }}>{r.afetada.terapia}</div>
                          {showExib && <div style={{ fontSize: "11px", color: "#9ca3af" }}>({r.afetada.terapiaExib})</div>}
                          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>{fmtName(r.afetada.prof)}</div>
                          <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px" }}>{r.afetada.dia} {r.afetada.hora} · {r.afetada.conv || "—"}</div>
                          <div className="flex gap-[3px] mt-[4px] flex-wrap items-center">
                            {analise.semSolucao && <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px", border: "1px solid #fca5a5" }}>Removida</span>}
                            {analise.buracoSiRemover && analise.semSolucao && <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px", border: "1px solid #fca5a5" }}>buraco</span>}
                            {analise.min2Violation && analise.semSolucao && <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px", border: "1px solid #fca5a5" }}>min-2</span>}
                            {analise.e1 && <span style={{ background: B.limeLt, color: "#4a6e20", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#1 Mesma terapia, mesmo horário</span>}
                            {analise.e2 && <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#2 Posições alteradas, prof. mantidos</span>}
                            {analise.e3 && <span style={{ background: B.blueLt, color: B.blue, fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#3 Mesma terapia, horário adjacente</span>}
                            {analise.e4.length > 0 && <span style={{ background: B.purpleLt, color: B.purple, fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#4 Outra terapia, mesmo horário{analise.e4.length > 1 ? ` (${analise.e4.length})` : ""}</span>}
                            {analise.e5 && <span style={{ background: "#fff7ed", color: "#c2410c", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#5 Posições alteradas, prof. alterados</span>}
                            {analise.e6 && <span style={{ background: "#f5f3ff", color: "#6d28d9", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#6 Alterar dia, prof. mantidos</span>}
                            {analise.e7 && <span style={{ background: "#f3f4f6", color: "#374151", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px" }}>#7 Alterar dia, prof. alterados</span>}
                            {analise.semSolucao && <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "9px", fontWeight: 700, borderRadius: "5px", padding: "1px 5px", border: "1px solid #fca5a5" }}>Sem solução</span>}
                          </div>
                          {st.opcao && (
                            <div style={{ marginTop: "5px", display: "inline-flex", alignItems: "center", gap: "4px", background: B.limeLt, border: `1px solid ${B.lime}`, borderRadius: "6px", padding: "2px 7px", fontSize: "10px", color: "#4a6e20", fontWeight: 600 }}>
                              <span style={{ fontWeight: 700 }}>Proposta:</span> {fmtName(st.opcao.prof)} · {st.opcao.dia} {st.opcao.hora}
                            </div>
                          )}
                        </div>

                        <div style={{ flex: "1 1 160px" }}>
                          <span style={{ background: stSt.bg, color: stSt.c, borderRadius: "999px", padding: "3px 9px", fontSize: "10px", fontWeight: 700, display: "inline-block", marginBottom: "3px" }}>
                            {stSt.l}
                          </span>
                          {st.obs && <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px", fontStyle: "italic" }}>&quot;{st.obs}&quot;</div>}
                        </div>

                        <div className="flex flex-col gap-[5px] items-end">
                          {st.status && st.status !== "pendente" && (
                            <button
                              onClick={() => persistStatus({ ...statusMap, [`${r.afetada.pac}|||${r.afetada.dia}|||${r.afetada.hora}|||${r.afetada.terapia}`]: { status: "pendente" } })}
                              style={{ padding: "3px 9px", borderRadius: "7px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", fontSize: "10px", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: "12px", padding: "9px 13px", background: "#f8fafc", borderRadius: "9px", fontSize: "11px", color: "#9ca3af", lineHeight: 1.7 }}>
            <strong style={{ color: "#374151" }}>Fluxo:</strong> Ver → escolher estratégia + opção → Aceitar (→ Acompanhamento) → Resolvido ou Recusado (libera para novo ciclo)
          </div>
        </div>
      )}

      {slotModal && sugestoesPorSlot[slotModal] && (() => {
        const [slotDia, slotHora] = slotModal.split("|||")
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3"
            onClick={e => {
              if (e.target === e.currentTarget) {
                setSlotModal(null)
                setScheduleModal(null)
              }
            }}
          >
            <div className="bg-white rounded-[18px] shadow-[0_24px_80px_rgba(0,0,0,.22)] w-[94vw] max-w-[760px] max-h-[88vh] flex flex-col overflow-hidden">
              <div className="px-5 py-[14px] border-b border-gray-100 bg-gray-50">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div style={{ fontWeight: 900, fontSize: "15px", color: B.navy }}>
                      Candidatos - {DIA_ABR[slotDia] ?? slotDia} {slotHora}
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>
                      Pacientes elegíveis, ordenados por prioridade de oferta.
                    </div>
                  </div>
                  <button
                    onClick={() => { setSlotModal(null); setScheduleModal(null) }}
                    className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors text-base"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="overflow-auto p-3 flex flex-col gap-2">
                {sugestoesPorSlot[slotModal].map((c, i) => {
                  const cKey = `${slotModal}|||${c.pac}`
                  const waStatus = candidatoWA[cKey] ?? null
                  const isDone = waStatus === "recusado" || waStatus === "inviavel"

                  return (
                    <div key={`${c.pac}-${c.esp}-${i}`} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: isDone ? "#f9fafb" : "#f8fafc", opacity: isDone ? 0.65 : 1, padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "#1f2937", fontSize: "13px" }}>{c.pac}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>
                          {c.esp} · {c.conv || "—"} · P{c.prio}
                        </div>
                        <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                          {waStatus === "aguardando" && <span style={{ fontSize: "10px", background: B.blueLt, color: B.blue, borderRadius: "5px", padding: "2px 6px", fontWeight: 700 }}>Aguardando Resposta</span>}
                          {waStatus === "recusado" && <span style={{ fontSize: "10px", background: "#fef2f2", color: "#dc2626", borderRadius: "5px", padding: "2px 6px", fontWeight: 700 }}>Recusou</span>}
                          {waStatus === "inviavel" && <span style={{ fontSize: "10px", background: "#f3f4f6", color: "#6b7280", borderRadius: "5px", padding: "2px 6px", fontWeight: 700 }}>Inviável</span>}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setScheduleModal({ slotKey: slotModal, candidato: c })}
                          style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer", fontWeight: 700 }}
                        >
                          🗓 Ver
                        </button>
                        {!waStatus && (
                          <>
                            <button onClick={() => setCandidatoWA(p => ({ ...p, [cKey]: "aguardando" }))} style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", cursor: "pointer", fontWeight: 700 }}>Aceitar (→ Acompanhamento)</button>
                            <button onClick={() => setCandidatoWA(p => ({ ...p, [cKey]: "inviavel" }))} style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>⛔ Inviável</button>
                          </>
                        )}
                        {waStatus === "aguardando" && (
                          <>
                            <button onClick={() => setCandidatoWA(p => ({ ...p, [cKey]: "inviavel" }))} style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>⛔ Inviável</button>
                            <button onClick={() => setCandidatoWA(p => { const n = { ...p }; delete n[cKey]; return n })} style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>Cancelar</button>
                          </>
                        )}
                        {isDone && (
                          <button onClick={() => setCandidatoWA(p => { const n = { ...p }; delete n[cKey]; return n })} style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "9px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>Resetar</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {scheduleModal && (() => {
        const [slotDia, slotHora] = scheduleModal.slotKey.split("|||")
        const c = scheduleModal.candidato
        const todasSessoes = agendRows.filter(r =>
          String(r["Nome Favorecido"] || "") === c.pac
        )
        const diasPac = new Set(todasSessoes.map(r => String(r["Dia da Semana"] || "")))
        diasPac.add(slotDia)
        const diasSorted = DIAS_UTIL.filter(d => diasPac.has(d))
        const slotsUsados = new Set(todasSessoes.map(r => normHora(String(r.HI_str || ""))).filter(Boolean))
        slotsUsados.add(slotHora)
        const slotsGrid = ALL_SLOTS.filter(s => slotsUsados.has(s))

        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3"
            onClick={e => { if (e.target === e.currentTarget) setScheduleModal(null) }}
          >
            <div className="bg-white rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,.2)] w-[93vw] max-w-[980px] max-h-[93vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-[#fafafa]">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "16px", color: B.navy }}>🗓 Cronograma — {c.pac}</div>
                    <div className="flex gap-[6px] flex-wrap mt-[5px]">
                      <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 800 }}>
                        Convênio: {c.conv || "—"}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "6px", fontSize: "12px", color: "#9ca3af" }}>
                      <span>
                        <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: B.limeLt, border: `1px solid ${B.lime}`, marginRight: "4px", verticalAlign: "middle" }} />
                        Verde = nova terapia sugerida
                      </span>
                      <span>
                        <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: "#f8fafc", border: "1px solid #e2e8f0", marginRight: "4px", verticalAlign: "middle" }} />
                        Cinza = existente
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setScheduleModal(null)}
                    className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors text-base"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="overflow-auto p-4">
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "520px" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "60px", paddingBottom: "10px", textAlign: "right", paddingRight: "14px", fontSize: "13px", color: "#9ca3af", fontWeight: 500 }}>Hora</th>
                      {diasSorted.map(d => (
                        <th key={d} style={{ minWidth: "155px", paddingBottom: "10px", textAlign: "center", fontSize: "15px", color: B.navy, fontWeight: 800 }}>
                          {d.replace("-feira", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slotsGrid.map(s => (
                      <tr key={s} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ textAlign: "right", paddingRight: "14px", verticalAlign: "top", paddingTop: "10px", fontFamily: "monospace", fontSize: "17px", fontWeight: 800, color: B.navy, letterSpacing: "-0.5px" }}>{s}</td>
                        {diasSorted.map(d => {
                          const sess = todasSessoes.filter(r => String(r["Dia da Semana"] || "") === d && normHora(String(r.HI_str || "")) === s)
                          const isNew = d === slotDia && s === slotHora
                          return (
                            <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                              {sess.map((r, ri) => (
                                <div key={ri} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "9px 11px", minHeight: "80px", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "4px" }}>
                                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{String(r.Terapia || "")}</div>
                                  <div style={{ fontSize: "12px", color: "#6b7280" }}>{fmtName(String(r.Profissional || ""))}</div>
                                </div>
                              ))}
                              {isNew && (
                                <div style={{ background: B.limeLt, border: `1px solid ${B.lime}`, borderRadius: "10px", padding: "9px 11px", minHeight: "80px", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "4px" }}>
                                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{c.esp}</div>
                                  <div style={{ fontSize: "12px", color: "#6b7280" }}>Novo profissional</div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: B.purple, marginTop: "auto" }}>✦ Nova Terapia</div>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal */}
      {modalGroup && modalGroup[modalTabIdx] && (() => {
        const item = modalGroup[modalTabIdx]
        return (
          <SaidaCronModal
            pac={item.pac}
            afetada={item.afetada}
            analise={item.analise}
            statusAtual={getStatus(item.afetada)}
            onClose={() => setModalGroup(null)}
            onStatus={handleStatus}
            sessionTabs={modalGroup.length > 1
              ? modalGroup.map(r => ({ label: `${r.afetada.terapia} · ${r.afetada.dia} ${r.afetada.hora}` }))
              : undefined}
            sessionTabIdx={modalTabIdx}
            onSessionTabChange={setModalTabIdx}
            todasAfetadas={modalGroup.length > 1 ? modalGroup.map(r => r.afetada) : undefined}
          />
        )
      })()}
    </div>
  )
}


