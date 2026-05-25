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
