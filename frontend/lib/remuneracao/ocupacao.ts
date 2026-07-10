// Migrado de calculadora-remuneracao/src/utils/ocupacao.js e constants/capacidades.js
// Porte PARCIAL, apenas o necessário para calcularAnaliseFutura (Passo 4):
// calcularOcupacaoSemanal, parseUnidadeSala, resumirJornadaAgenda e suas
// dependências diretas. A aba "Ocupação de Salas" (UI completa) NÃO é portada
// — decisão confirmada com o usuário no Passo 4.

import { normKey } from "./constants"
import { cleanTxt, fmtNumBR, fmtPctOcup, fmtH, hhmm } from "./formatacao"

// ─── Capacidade por profissional/especialidade (constants/capacidades.js) ─────
// Só o padrão genérico é usado hoje (placeholder "base N" em CapacidadeConfig.tsx)
// — a capacidade real usada no cálculo de ocupação vem de
// lib/cronograma/ocupacaoProf.ts (ver calculo.ts).

const SLOT_CAP_ESP: Record<string, number> = {
  "terapia ocupacional": 1,
  "musicoterapia": 2,
  "aplicador aba (ef)": 1,
  "aplicador aba ef": 1,
}

export function capacidadePadraoProfissional(terapia = ""): number {
  return SLOT_CAP_ESP[normKey(terapia)] ?? 1
}

export type CapacidadeOverride = { dias?: Record<string, number>; padrao?: number }

// ─── Unidade ────────────────────────────────────────────────────────────────

export function normalizarUnidadeOcupacao(unidade: string | null | undefined): string {
  const raw = cleanTxt(unidade)
  const n = normKey(raw)
  if (!n) return "Consertar Unidade no sistema"
  if (n.includes("ambiente natural") || n.includes("casa") || n.includes("escola") || n.includes("externo")) return "Ambiente Natural"
  if (n.includes("fazendinha")) return "Fazendinha"
  if (n.includes("padre miguel")) return "Padre Miguel"
  if (n.includes("realengo")) return "Realengo"
  return "Consertar Unidade no sistema"
}

export function parseUnidadeSala(sala: string | null | undefined): string {
  const raw = cleanTxt(sala)
  if (!raw) return "Consertar Unidade no sistema"
  const n = normKey(raw)
  const mUnid = raw.match(/^Unid\.\s*([^-–—]+)\s*[-–—]?/i)
  if (mUnid?.[1]) return normalizarUnidadeOcupacao(mUnid[1])
  if (n.includes("ambiente natural") || n.includes("casa") || n.includes("escola") || n.includes("externo")) return "Ambiente Natural"
  if (n.includes("fazendinha")) return "Fazendinha"
  if (n.includes("padre miguel")) return "Padre Miguel"
  if (n.includes("realengo")) return "Realengo"
  return normalizarUnidadeOcupacao(raw.split(/[-–—]/)[0].trim())
}

export function turnoDoHorario(min: number | null): string {
  return min !== null && min < 12 * 60 ? "Manhã" : "Tarde"
}

// ─── Base de agregação de ocupação ────────────────────────────────────────────

export type BaseOcup = {
  slotsTotal: number; slotsOcupados: number; slotsLivres: number
  horariosTotal: number; horariosOcupados: number; horariosLivres: number
  horasTotal: number; horasOcupadas: number; horasLivres: number
  horasTecnicas: number; horasAssistenciais: number
  unidades?: string[]
  _unidades?: Set<string>
}

export function novaBaseOcup(): BaseOcup {
  return {
    slotsTotal: 0, slotsOcupados: 0, slotsLivres: 0,
    horariosTotal: 0, horariosOcupados: 0, horariosLivres: 0,
    horasTotal: 0, horasOcupadas: 0, horasLivres: 0,
    horasTecnicas: 0, horasAssistenciais: 0,
  }
}

type BaseOcupNumericKey = Exclude<keyof BaseOcup, "unidades" | "_unidades">
const BASE_KEYS = Object.keys(novaBaseOcup()) as BaseOcupNumericKey[]

export function somaBaseOcup(dest: BaseOcup, src: Partial<BaseOcup> & { unidade?: string }): BaseOcup {
  BASE_KEYS.forEach(k => {
    dest[k] = (dest[k] || 0) + (src[k] || 0)
  })
  const unidades: string[] = []
  if (src.unidade) unidades.push(src.unidade)
  if (Array.isArray(src.unidades)) unidades.push(...src.unidades)
  if (src._unidades instanceof Set) unidades.push(...src._unidades)
  if (unidades.length) {
    if (!(dest._unidades instanceof Set)) dest._unidades = new Set(Array.isArray(dest.unidades) ? dest.unidades : [])
    unidades.map(cleanTxt).filter(Boolean).forEach(u => dest._unidades!.add(u))
  }
  return dest
}

function baseCompactaOcup(b: BaseOcup, capacidadeMultipla = (b.slotsTotal || 0) > (b.horariosTotal || 0) + 0.0001): string {
  if (!(b.slotsTotal > 0)) return ""
  const num = capacidadeMultipla ? b.slotsOcupados : b.horariosOcupados
  const den = capacidadeMultipla ? b.slotsTotal : b.horariosTotal
  const casasNum = num % 1 ? 1 : 0
  const casasDen = den % 1 ? 1 : 0
  return `${fmtNumBR(num, casasNum)}/${fmtNumBR(den, casasDen)}${capacidadeMultipla ? " vagas" : ""}`
}

export type OcupacaoFinalizada = BaseOcup & {
  pct: number | null
  ociosidade: number | null
  capacidadeMultipla: boolean
  baseCompacta: string
  baseTexto: string
  baseHorasTexto: string
  unidades: string[]
  unidadeTexto: string
}

export function finalizarBaseOcup(b: BaseOcup): OcupacaoFinalizada {
  const pct = b.slotsTotal > 0 ? b.slotsOcupados / b.slotsTotal : null
  const capacidadeMultipla = (b.slotsTotal || 0) > (b.horariosTotal || 0) + 0.0001
  const baseCompacta = baseCompactaOcup(b, capacidadeMultipla)
  const baseTexto = b.slotsTotal > 0
    ? capacidadeMultipla
      ? `${fmtNumBR(b.slotsOcupados, b.slotsOcupados % 1 ? 1 : 0)} de ${fmtNumBR(b.slotsTotal, b.slotsTotal % 1 ? 1 : 0)} vagas preenchidas = ${fmtPctOcup(pct)}`
      : `${fmtNumBR(b.horariosOcupados, b.horariosOcupados % 1 ? 1 : 0)} de ${fmtNumBR(b.horariosTotal, b.horariosTotal % 1 ? 1 : 0)} horários ocupados = ${fmtPctOcup(pct)}`
    : "Sem base de agenda para calcular ocupação"
  const baseHorasTexto = b.horasTotal > 0
    ? capacidadeMultipla
      ? `Agenda do profissional: ${fmtNumBR(b.horariosOcupados, 0)} de ${fmtNumBR(b.horariosTotal, 0)} horários com paciente · ${fmtH(b.horasOcupadas)} de ${fmtH(b.horasTotal)}`
      : `${fmtH(b.horasOcupadas)} ocupadas de ${fmtH(b.horasTotal)} disponíveis`
    : "Sem carga semanal calculada"
  const unidades = [...(b._unidades instanceof Set ? b._unidades : new Set(Array.isArray(b.unidades) ? b.unidades : []))].sort((a, b2) => a.localeCompare(b2))
  const { _unidades, ...limpo } = b
  void _unidades
  return {
    ...limpo,
    pct,
    ociosidade: pct === null ? null : 1 - pct,
    capacidadeMultipla,
    baseCompacta,
    baseTexto,
    baseHorasTexto,
    unidades,
    unidadeTexto: unidades.join(", "),
  }
}

type SlotDetalhe = {
  date?: string; dow?: number; terp?: string; unidade?: string; sala?: string
  ini: number; fim: number; ag: number; liv: number; realAg?: number; technicalAg?: number
  patients?: string[]
}

// ─── Slot data (estrutura intermediária vinda de calculo.ts) ─────────────────

export type DiaInfo = {
  dow: number
  inicioMin: number
  fimMin: number
  ag: number
  liv: number
  pacIvs: [number, number][]
  slotMap: Record<string, number>
  slotDetails: Record<string, SlotDetalhe>
}

export type SlotData = {
  diasInfo: Record<string, DiaInfo>
  terpDays: Record<string, Record<string, number>>
}

export function resumirJornadaAgenda(slotData: SlotData): string {
  const dias = Object.values(slotData?.diasInfo || {})
  if (!dias.length) return ""
  const slots = dias.flatMap(di => Object.values(di.slotDetails || {}))
  if (!slots.length) return ""
  const morning = slots.filter(s => s.ini < 12 * 60)
  const afternoon = slots.filter(s => s.fim > 13 * 60 && s.ini >= 12 * 60)
  const mStart = morning.length ? Math.min(...morning.map(s => s.ini)) : null
  const mEnd = morning.length ? Math.max(...morning.map(s => s.fim)) : null
  const aStart = afternoon.length ? Math.min(...afternoon.map(s => s.ini)) : null
  const aEnd = afternoon.length ? Math.max(...afternoon.map(s => s.fim)) : null
  const parts: string[] = []
  if (mStart !== null && mEnd !== null) parts.push(`${hhmm(mStart)} às ${hhmm(mEnd)}`)
  if (aStart !== null && aEnd !== null) parts.push(`${hhmm(aStart)} às ${hhmm(aEnd)}`)
  if (parts.length === 2 && mEnd! <= 12 * 60 && aStart! >= 13 * 60) {
    return `${parts.join(" e ")} · intervalo de ${hhmm(mEnd)} às ${hhmm(aStart)}`
  }
  return parts.join(" e ")
}
