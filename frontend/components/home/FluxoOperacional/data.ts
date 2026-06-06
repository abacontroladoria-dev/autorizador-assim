// 13 slots de 40 min: 08:00–11:20 (manha) e 13:00–17:00 (tarde, última sessão termina 17:40)
export const TIME_SLOTS = [
  "08:00", "08:40", "09:20", "10:00", "10:40", "11:20",
  "13:00", "13:40", "14:20", "15:00", "15:40", "16:20", "17:00",
] as const

export type TimeSlot = (typeof TIME_SLOTS)[number]

export interface FluxoSlotPoint {
  slot: string
  realengo: number
  fazendinha: number
  padreMiguel: number
}

export interface FluxoUnitCount {
  realengo: number | null
  fazendinha: number | null
  padreMiguel: number | null
  total: number | null
}

export const UNIT_COLORS = {
  realengo: "#3B82F6",
  fazendinha: "#8B5CF6",
  padreMiguel: "#10B981",
  media: "#94A3B8",
} as const

// Dados iniciais (loading skeleton) enquanto o Supabase carrega
export const FLUXO_MOCK_DATA: FluxoSlotPoint[] = [
  { slot: "08:00", realengo: 22, fazendinha: 3, padreMiguel: 0 },
  { slot: "08:40", realengo: 24, fazendinha: 4, padreMiguel: 1 },
  { slot: "09:20", realengo: 26, fazendinha: 4, padreMiguel: 1 },
  { slot: "10:00", realengo: 28, fazendinha: 4, padreMiguel: 1 },
  { slot: "10:40", realengo: 28, fazendinha: 4, padreMiguel: 1 },
  { slot: "11:20", realengo: 26, fazendinha: 4, padreMiguel: 1 },
  { slot: "13:00", realengo: 24, fazendinha: 4, padreMiguel: 1 },
  { slot: "13:40", realengo: 26, fazendinha: 4, padreMiguel: 1 },
  { slot: "14:20", realengo: 24, fazendinha: 4, padreMiguel: 0 },
  { slot: "15:00", realengo: 22, fazendinha: 4, padreMiguel: 0 },
  { slot: "15:40", realengo: 20, fazendinha: 4, padreMiguel: 0 },
  { slot: "16:20", realengo: 16, fazendinha: 4, padreMiguel: 0 },
  { slot: "17:00", realengo: 10, fazendinha: 4, padreMiguel: 0 },
]

// Mapeia horário HH:MM(:SS) do banco para o slot correspondente
export function horarioToSlot(horario: string): string | null {
  const hhmm = horario.slice(0, 5) // "HH:MM"
  return (TIME_SLOTS as readonly string[]).includes(hhmm) ? hhmm : null
}

// Constrói dados de slot a partir das linhas do Supabase
export function buildSlotData(
  rows: { horario: string | null; sala_nome: string[] | null }[],
  _blacklist: Set<string> | undefined,
  getUnitKey?: (sala: string | null) => "realengo" | "fazendinha" | "padreMiguel" | null,
): FluxoSlotPoint[] {
  const counts: Record<string, { realengo: number; fazendinha: number; padreMiguel: number }> = {}
  for (const slot of TIME_SLOTS) {
    counts[slot] = { realengo: 0, fazendinha: 0, padreMiguel: 0 }
  }

  for (const row of rows) {
    if (!row.horario) continue
    const slot = horarioToSlot(row.horario)
    if (!slot) continue
    if (!getUnitKey) continue

    const salas = row.sala_nome ?? []
    let uk: "realengo" | "fazendinha" | "padreMiguel" | null = null
    for (const sala of salas) {
      uk = getUnitKey(sala)
      if (uk) break
    }
    if (uk) counts[slot][uk]++
  }

  return TIME_SLOTS.map((slot) => ({ slot, ...counts[slot] }))
}

export function getTotalAtendimentos(atendimentos: FluxoUnitCount | null): number {
  return atendimentos?.total ?? 0
}

export function getMostActiveUnit(atendimentos: FluxoUnitCount | null): { label: string; total: number } {
  if (!atendimentos) return { label: "—", total: 0 }
  const entries: [string, number][] = [
    ["Realengo", atendimentos.realengo ?? 0],
    ["Fazendinha", atendimentos.fazendinha ?? 0],
    ["Padre Miguel", atendimentos.padreMiguel ?? 0],
  ]
  const [label, total] = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
  return { label, total }
}

export function getPeakSlot(data: FluxoSlotPoint[]): { slot: string; total: number } {
  return data.reduce(
    (peak, d) => {
      const total = d.realengo + d.fazendinha + d.padreMiguel
      return total > peak.total ? { slot: d.slot, total } : peak
    },
    { slot: "", total: 0 },
  )
}

export function getDailyAverage(data: FluxoSlotPoint[]): number {
  const allValues = data.flatMap((d) => [d.realengo, d.fazendinha, d.padreMiguel])
  if (!allValues.length) return 0
  return Math.round(allValues.reduce((s, v) => s + v, 0) / allValues.length)
}

// ─── Unit key helper (shared) ─────────────────────────────────────────────────

export function salaToUnitKey(
  salaNome: string | null,
): "realengo" | "fazendinha" | "padreMiguel" | null {
  if (!salaNome) return null
  const lower = salaNome.toLowerCase()
  if (lower.includes("realengo")) return "realengo"
  if (lower.includes("fazendinha")) return "fazendinha"
  if (lower.includes("padre miguel")) return "padreMiguel"
  return null
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const SHORT_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

// Seg–Sex apenas (5 dias úteis)
export function getWeekDateRange(): { start: string; end: string; dates: string[]; labels: string[] } {
  const today = new Date()
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))

  const dates: string[] = []
  const labels: string[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(toISO(d))
    labels.push(`${SHORT_DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`)
  }
  return { start: dates[0], end: dates[4], dates, labels }
}

// Agrupa os dias do mês vigente em blocos de 7 (ex: "01-07", "08-14", ...)
export interface WeekGroup {
  label: string
  dates: string[]
  start: string
  end: string
}

export function getMonthWeekGroups(): WeekGroup[] {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const mm = String(month + 1).padStart(2, "0")

  const groups: WeekGroup[] = []
  let day = 1
  while (day <= lastDay) {
    const groupEnd = Math.min(day + 6, lastDay)
    const dates: string[] = []
    for (let d = day; d <= groupEnd; d++) {
      dates.push(`${year}-${mm}-${String(d).padStart(2, "0")}`)
    }
    groups.push({
      label: `${String(day).padStart(2, "0")}-${String(groupEnd).padStart(2, "0")}`,
      dates,
      start: dates[0],
      end: dates[dates.length - 1],
    })
    day = groupEnd + 1
  }
  return groups
}

// Constrói dados de slot agrupados por data (para visão semanal)
export function buildDateSlotData(
  rows: { data_atendimento: string; sala_nome: string[] | null }[],
  blacklist: Set<string>,
  dates: string[],
  labels: string[],
): FluxoSlotPoint[] {
  const counts: Record<string, { realengo: number; fazendinha: number; padreMiguel: number }> = {}
  for (const date of dates) counts[date] = { realengo: 0, fazendinha: 0, padreMiguel: 0 }

  for (const row of rows) {
    const date = row.data_atendimento
    if (!date || !counts[date]) continue

    const salas = row.sala_nome ?? []
    let uk: "realengo" | "fazendinha" | "padreMiguel" | null = null
    for (const sala of salas) {
      uk = salaToUnitKey(sala)
      if (uk) break
    }
    if (uk) counts[date][uk]++
  }

  return dates.map((date, i) => ({ slot: labels[i], ...counts[date] }))
}

// Constrói dados de slot agrupados por semana (para visão mensal)
export function buildGroupedSlotData(
  rows: { data_atendimento: string; sala_nome: string[] | null }[],
  groups: WeekGroup[],
): FluxoSlotPoint[] {
  const dateToGroup = new Map<string, number>()
  for (let i = 0; i < groups.length; i++) {
    for (const date of groups[i].dates) dateToGroup.set(date, i)
  }

  const counts = groups.map(() => ({ realengo: 0, fazendinha: 0, padreMiguel: 0 }))

  for (const row of rows) {
    const idx = dateToGroup.get(row.data_atendimento)
    if (idx === undefined) continue

    const salas = row.sala_nome ?? []
    let uk: "realengo" | "fazendinha" | "padreMiguel" | null = null
    for (const sala of salas) {
      uk = salaToUnitKey(sala)
      if (uk) break
    }
    if (uk) counts[idx][uk]++
  }

  return groups.map((g, i) => ({ slot: g.label, ...counts[i] }))
}

// Média de atendimentos por ponto do gráfico (slot / dia / semana)
export function getPeriodPointAverage(data: FluxoSlotPoint[]): number {
  if (!data.length) return 0
  const totals = data.map((d) => d.realengo + d.fazendinha + d.padreMiguel)
  return Math.round(totals.reduce((s, v) => s + v, 0) / totals.length)
}

// Computa totais de unidade a partir de slotData de período
export function computePeriodUnitCount(slotData: FluxoSlotPoint[]): FluxoUnitCount {
  const uc: FluxoUnitCount = { realengo: 0, fazendinha: 0, padreMiguel: 0, total: 0 }
  for (const d of slotData) {
    uc.realengo = (uc.realengo ?? 0) + d.realengo
    uc.fazendinha = (uc.fazendinha ?? 0) + d.fazendinha
    uc.padreMiguel = (uc.padreMiguel ?? 0) + d.padreMiguel
    uc.total = (uc.total ?? 0) + d.realengo + d.fazendinha + d.padreMiguel
  }
  return uc
}

// ─── Current slot ─────────────────────────────────────────────────────────────

export function getCurrentSlotKey(): string | null {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const totalMin = h * 60 + m

  const slotMins = [
    8 * 60, 8 * 60 + 40, 9 * 60 + 20, 10 * 60, 10 * 60 + 40, 11 * 60 + 20,
    13 * 60, 13 * 60 + 40, 14 * 60 + 20, 15 * 60, 15 * 60 + 40, 16 * 60 + 20, 17 * 60,
  ]

  for (let i = 0; i < slotMins.length; i++) {
    const start = slotMins[i]
    const end = i + 1 < slotMins.length ? slotMins[i + 1] : 17 * 60 + 40
    if (totalMin >= start && totalMin < end) {
      const sh = Math.floor(start / 60)
      const sm = start % 60
      return `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`
    }
  }
  return null
}
