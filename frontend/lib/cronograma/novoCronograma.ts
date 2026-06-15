import { DIA_COLS_DISP, DIAS_ORD, ESP_CLINICO, EXCLUIR_OCUP } from "./constants"
import { isLaudoComAlta, pm } from "./helpers"
import type { CsvRow, DispRow, LaudoRow } from "@/types/cronograma"

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface EspEntry {
  sol: number
  aut: number
  of: number
  vigente: boolean
}

export interface SessEntry {
  tP: string
  esp: string
  prof: string
}

export interface AvailWindow {
  inicio: number
  fim: number
}

export interface Alerta {
  tipo: "error" | "warn" | "info"
  msg: string
}

export interface NovoCronogramaResult {
  schedule: Record<string, Record<string, SessEntry>>
  espTable: Record<string, EspEntry>
  alertas: Alerta[]
  availWindows: Record<string, AvailWindow>
  turnoClinico: "manha" | "tarde" | null
}

// ─── ALGORITMO ────────────────────────────────────────────────────────────────

export function buildNewCronograma(
  paciente: string,
  unidade: string,
  dispRows: DispRow[] | null | undefined,
  laudosRows: LaudoRow[] | null | undefined,
  livreSlots: CsvRow[],
): NovoCronogramaResult {
  const dispRow = (dispRows || []).find(
    r => String(r["Nome Paciente"] || "").trim().toLowerCase() === paciente.trim().toLowerCase(),
  )

  const availWindows: Record<string, AvailWindow> = {}
  if (dispRow) {
    for (const [dia, [ic, fc]] of Object.entries(DIA_COLS_DISP)) {
      const ini = String(dispRow[ic] || "").trim()
      const fim = String(dispRow[fc] || "").trim()
      if (ini && fim && ini !== "—" && fim !== "—") {
        const hi = pm(ini)
        const hf = pm(fim)
        if (hi !== null && hf !== null) availWindows[dia] = { inicio: hi, fim: hf }
      }
    }
  }

  const escolaIni = pm(String(dispRow?.["Escola Início"] || "").trim())
  const turnoClinico: "manha" | "tarde" | null =
    escolaIni === null ? null : escolaIni < 780 ? "tarde" : "manha"

  const espTable: Record<string, EspEntry> = {}
  const altaEsp = new Set<string>()

  for (const r of laudosRows || []) {
    if (String(r["Paciente"] || "").trim() !== paciente) continue
    const esp = String(r["Especialidade"] || "").trim()
    if (!esp) continue
    if (isLaudoComAlta(r as Record<string, unknown>)) { altaEsp.add(esp); continue }
    const sol = parseFloat(String(r["Qtd laudo"] || "0")) || 0
    const aut = parseFloat(String(r["Qtd autorizada"] || "0")) || 0
    const vigente = String(r["Situação"] || "") === "Vigente"
    if (!espTable[esp]) espTable[esp] = { sol: 0, aut: 0, of: 0, vigente: false }
    espTable[esp].sol = Math.max(espTable[esp].sol, sol)
    if (vigente) {
      espTable[esp].aut = Math.max(espTable[esp].aut, aut)
      espTable[esp].vigente = true
    }
  }
  for (const esp of altaEsp) delete espTable[esp]

  const inWindow = (dia: string, hi: number) => {
    const w = availWindows[dia]
    return w ? hi >= w.inicio && hi < w.fim : false
  }
  const inTurno = (hi: number) =>
    turnoClinico === null ? true : turnoClinico === "manha" ? hi < 780 : hi >= 780

  const eligible = (livreSlots || []).filter(r => {
    const hiVal = Number(r.HI ?? r["HI"] ?? null)
    return (
      String(r.Unidade || r["Unidade"] || "") === unidade &&
      r.HI !== null && !isNaN(hiVal) &&
      !EXCLUIR_OCUP.has(r["Terapia"]) &&
      inWindow(r["Dia da Semana"], hiVal) &&
      inTurno(hiVal)
    )
  })

  const ESP_ORD = [
    "Fonoaudiologia", "Terapia Ocupacional", "Psicologia ABA", "Musicoterapia",
    "Psicopedagogia", "Psicomotricidade", "Terapia Alimentar", "Fisioterapia Motora",
    "Fisioterapia Aquática", "Equoterapia", "Arteterapia", "Psicologia", "Habilidades Sociais",
  ]
  const toPlace = Object.fromEntries(
    Object.entries(espTable).filter(([, v]) => v.vigente && v.aut > 0).map(([e, v]) => [e, v.aut]),
  )
  const orderedEsps = [
    ...ESP_ORD.filter(e => toPlace[e]),
    ...Object.keys(toPlace).filter(e => !ESP_ORD.includes(e)),
  ]

  const schedule: Record<string, Record<string, SessEntry>> = {}
  const usedSlots = new Set<string>()

  for (const esp of orderedEsps) {
    let needed = toPlace[esp] || 0
    if (needed <= 0) continue
    const terapiasEsp = (ESP_CLINICO[esp] || []).filter(t => !EXCLUIR_OCUP.has(t))
    const candidates = eligible
      .filter(r => {
        const hiStr = String(r.HI_str || r["HI_str"] || "")
        return terapiasEsp.includes(r["Terapia"]) && !usedSlots.has(`${r["Dia da Semana"]}|||${hiStr}`)
      })
      .sort((a, b) => {
        const d = (DIAS_ORD[a["Dia da Semana"]] ?? 9) - (DIAS_ORD[b["Dia da Semana"]] ?? 9)
        return d !== 0 ? d : (Number(a.HI ?? 0)) - (Number(b.HI ?? 0))
      })

    for (const slot of candidates) {
      if (needed <= 0) break
      const dia = slot["Dia da Semana"]
      const hiStr = String(slot.HI_str || slot["HI_str"] || "")
      const hi = Number(slot.HI ?? 0)
      const dayTimes = Object.keys(schedule[dia] || {})
        .map(h => pm(h))
        .filter((t): t is number => t !== null)
        .sort((a, b) => a - b)
      if (dayTimes.length > 0) {
        const all = [...dayTimes, hi].sort((a, b) => a - b)
        if (all.some((t, i) => i > 0 && t - all[i - 1] !== 40)) continue
      }
      if (!schedule[dia]) schedule[dia] = {}
      schedule[dia][hiStr] = { tP: slot["Terapia"], esp, prof: slot["Profissional"] }
      usedSlots.add(`${dia}|||${hiStr}`)
      espTable[esp].of++
      needed--
    }
  }

  const alertas: Alerta[] = []
  if (!dispRow) alertas.push({ tipo: "error", msg: "Paciente não encontrado no relatório de disponibilidade — carregue o CSV do Órbita" })
  if (!turnoClinico) alertas.push({ tipo: "info", msg: "Escola não informada: todos os horários da disponibilidade foram considerados" })
  for (const [dia, ds] of Object.entries(schedule))
    if (Object.keys(ds).length === 1) alertas.push({ tipo: "warn", msg: `${dia}: apenas 1 sessão — regra exige mínimo 2 (R2.1)` })
  for (const [esp, { aut, of: of_, vigente }] of Object.entries(espTable))
    if (vigente && aut > 0 && of_ < aut) alertas.push({ tipo: "info", msg: `${esp}: ${of_}/${aut} sessões alocadas — disponibilidade insuficiente` })

  return { schedule, espTable, alertas, availWindows, turnoClinico }
}
