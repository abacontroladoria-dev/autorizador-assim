import { ADMIN_ONLY, B, HORAS_GRID, normTxt } from "./constants"
import type { Sugestao } from "@/types/cronograma"

// ─── TEMPO ────────────────────────────────────────────────────────────────────

/** "HH:MM" → minutos (null se inválido) */
export function pm(t: string | null | undefined): number | null {
  if (!t) return null
  const s = String(t).slice(0, 5)
  const [h, m] = s.split(":").map(Number)
  return isNaN(h) || isNaN(m) ? null : h * 60 + m
}

/** minutos → "HH:MM" */
export function fm(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return ""
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
}

/** Extrai unidade da sala ("Unid. Realengo - Sala 1" → "Realengo") */
export function exU(s: string | null | undefined): string {
  if (!s) return "Desconhecida"
  const x = String(s)
  if (x.includes("AT Externo")) return "AT Externo"
  const m = x.match(/Unid\.\s+(.+?)(?:\s*-\s*|$)/)
  return m ? m[1].trim() : "Desconhecida"
}

/** Data de nascimento → faixa etária ("2-3", "4-5", ..., "13+") */
export function cFx(dn: string | null | undefined): string | null {
  if (!dn) return null
  const d = new Date(String(dn).replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"))
  if (isNaN(d.getTime())) return null
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5))
  return a <= 3 ? "2-3" : a <= 5 ? "4-5" : a <= 7 ? "6-7" : a <= 9 ? "8-9" : a <= 12 ? "10-12" : "13+"
}

/** Calcula prioridade do paciente (1–5) */
export function gPrio(pac: string, cM: Record<string, string>, jM: Record<string, string>): 1 | 2 | 3 | 4 | 5 {
  const c = String(cM[pac] || "").toUpperCase()
  const j = String(jM[pac] || "").toLowerCase()
  const iA = c.includes("ASSIM")
  const iJ = ["liminar", "penhora", "decisão", "decisao", "judicial"].some(x => j.includes(x))
  if (c.includes("LEVE")) return 5
  if (!iA && iJ) return 1
  if (!iA && !iJ) return 2
  if (iA && iJ) return 3
  return 4
}

/** Date → "DD/MM/YYYY" */
export function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

const PARTS = new Set(["de", "da", "do", "dos", "das", "e", "van", "von"])

/** Nome completo → abreviado ("João Carlos de Lima" → "João Carlos") */
export function fmtName(n: string | null | undefined): string {
  if (!n) return ""
  const p = n.trim().split(/\s+/)
  if (p.length <= 2) return p.join(" ")
  const r = [p[0]]
  let i = 1
  while (i < p.length) {
    if (PARTS.has(p[i].toLowerCase()) && i + 1 < p.length) {
      r.push(p[i])
      r.push(p[i + 1])
      break
    } else {
      r.push(p[i])
      break
    }
  }
  return r.join(" ")
}

// ─── UNIDADE ──────────────────────────────────────────────────────────────────

export function unidadeLabel(u: string | null | undefined): string {
  return String(u || "").trim() || "Unidade não informada"
}

export function unidadeBadgeText(u: string | null | undefined): string {
  return unidadeLabel(u).toUpperCase()
}

export function isUnidadeValida(u: string | null | undefined): boolean {
  const x = unidadeLabel(u)
  return x !== "Unidade não informada" && x !== "Desconhecida"
}

// ─── TURNO ────────────────────────────────────────────────────────────────────

export function turnoFromHora(hora: string | null | undefined): "manha" | "tarde" {
  return (pm(hora) || 0) < 780 ? "manha" : "tarde"
}

export const turnoNome: Record<"manha" | "tarde", string> = {
  manha: "Manhã",
  tarde: "Tarde",
}

// ─── LAUDO / ALTA ─────────────────────────────────────────────────────────────

export function isSupervisaoAba(terapia: string | null | undefined): boolean {
  return normTxt(terapia) === "supervisao aba"
}

const ADMIN_ONLY_NORM = new Set([...ADMIN_ONLY].map(t => normTxt(t)))

// Qualquer terapia administrativa (ver ADMIN_ONLY em constants.ts) — sessão sem
// presença do paciente, nunca tem linha própria em fila_autorizacoes. Usado pra
// saber quando uma dessas deve herdar o status geral do dia em vez de aparecer
// sempre como "futuro" mesmo em dias já passados.
export function isTerapiaAdministrativa(terapia: string | null | undefined): boolean {
  return ADMIN_ONLY_NORM.has(normTxt(terapia))
}

export function isAltaAtivaValor(v: unknown): boolean {
  const raw = String(v ?? "").trim()
  if (!raw) return false
  const n = normTxt(raw)
  return !["nao", "n", "no", "false", "falso", "0", "-"].includes(n)
}

export function isLaudoComAlta(r: Record<string, unknown> | null | undefined): boolean {
  return (
    isAltaAtivaValor(r?.["Alta"] ?? r?.["ALTA"] ?? r?.["alta"]) ||
    isAltaAtivaValor(r?.["Data alta"] ?? r?.["DATA ALTA"] ?? r?.["Data Alta"])
  )
}

// ─── CRONOGRAMA UNIT META ─────────────────────────────────────────────────────

interface CronoSession {
  tP: string
  unidade: string
}

export interface DayMeta { manha: string[]; tarde: string[]; all: string[] }

export interface UnitMeta {
  globalUnits: string[]
  globalUnit: string | null
  byDay: Record<string, DayMeta>
}

/** "manhã" | "tarde" com acento — chaves dos selDT do SaidaProfMode */
export function getTurno(hora: string | null | undefined): "manhã" | "tarde" {
  return (pm(hora) || 0) < 780 ? "manhã" : "tarde"
}

export function buildCronoUnitMeta(
  dias: string[],
  cMap: Record<string, CronoSession[]>,
): UnitMeta {
  const allUnits = new Set<string>()
  const byDay: UnitMeta["byDay"] = {}

  for (const d of dias) {
    const turnSets = { manha: new Set<string>(), tarde: new Set<string>() }
    const daySet = new Set<string>()

    for (const h of HORAS_GRID) {
      for (const c of cMap[`${d}|||${h}`] || []) {
        if (isSupervisaoAba(c.tP)) continue
        if (!isUnidadeValida(c.unidade)) continue
        const u = unidadeLabel(c.unidade)
        turnSets[turnoFromHora(h)].add(u)
        daySet.add(u)
        allUnits.add(u)
      }
    }

    byDay[d] = {
      manha: [...turnSets.manha].sort(),
      tarde: [...turnSets.tarde].sort(),
      all: [...daySet].sort(),
    }
  }

  const globalUnits = [...allUnits].sort()
  return { globalUnits, globalUnit: globalUnits.length === 1 ? globalUnits[0] : null, byDay }
}

export function shouldShowSessionUnit(unitMeta: UnitMeta | null | undefined, dia: string, hora: string): boolean {
  const units = unitMeta?.byDay?.[dia]?.[turnoFromHora(hora)] || []
  return units.length > 1
}

// ─── WA KEY ──────────────────────────────────────────────────────────────────

export function waKey(s: Sugestao): string {
  return `${s.pac}|||${s.prof}|||${s.dia}|||${s.hora}`
}

// `slotReservado` (Saída de Profissional) grava 1+ movimentos como
// "prof|||dia|||hora" separados por ";;" quando há mais de um (ver
// buildSlotReservado em SaidaCronModal.tsx). Sempre isole o primeiro
// movimento via ";;" ANTES de separar por "|||" — fazer só ".split(\"|||\")"
// direto na string inteira faz o campo "hora" vazar o profissional do
// próximo movimento (ex.: "09:20;;Nome Do Próximo Profissional").
export function parseSlotReservado(slotReservado: string | null | undefined): { prof: string; dia: string; hora: string } {
  const primeiro = (slotReservado || "").split(";;")[0] || ""
  const [prof = "", dia = "", hora = ""] = primeiro.split("|||")
  return { prof, dia, hora }
}

// ─── FORMATAÇÃO OCUPAÇÃO ─────────────────────────────────────────────────────

export function fmtH(h: number | string): string {
  const n = Number(h) || 0
  let horas = Math.floor(n)
  let mins = Math.round((n - horas) * 60)
  if (mins >= 60) { horas += Math.floor(mins / 60); mins = mins % 60 }
  return `${horas}h${String(mins).padStart(2, "0")}`
}

export function fmtNumBR(v: unknown, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—"
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function fmtHDec(h: number | string, casas = 2): string {
  return `${fmtNumBR(Number(h) || 0, casas)}h`
}

export function fmtPctOcup(v: number | null | undefined): string {
  return v === null || v === undefined
    ? "—"
    : `${(v * 100).toFixed(2).replace(".", ",")}%`
}

export function hhmm(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—"
  const h = String(Math.floor(min / 60)).padStart(2, "0")
  const m = String(Math.round(min % 60)).padStart(2, "0")
  return `${h}:${m}`
}

export function cleanTxt(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim()
}

// ─── SEMANA DE REFERÊNCIA ─────────────────────────────────────────────────────

/** 1ª segunda-sexta de um mês (1-indexado) específico — base de getRefWeek() e do seletor de mês da Previsão de Receitas (getRefWeekDoMes). */
export function getRefWeekDoMes(ano: number, mes: number): { inicio: string; fim: string; label: string } {
  const nm = new Date(ano, mes - 1, 1)
  while (nm.getDay() !== 1) nm.setDate(nm.getDate() + 1)
  const fri = new Date(nm)
  fri.setDate(fri.getDate() + 4)
  return {
    inicio: nm.toISOString().slice(0, 10),
    fim: fri.toISOString().slice(0, 10),
    label: `${fmtDate(nm)} a ${fmtDate(fri)}`,
  }
}

export function getRefWeek(): { inicio: string; fim: string; label: string } {
  const hoje = new Date()
  const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  return getRefWeekDoMes(proximoMes.getFullYear(), proximoMes.getMonth() + 1)
}

/** "Julho de 2026" — mesmo formato usado por mesReferenciaDeDatas em faturamentoProjecao.ts, mas a partir de um ano/mês explícito (seletor de mês), não derivado das datas dos dados carregados. */
export function labelMesAno(ano: number, mes: number): string {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, mes - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Dia 1 ao último dia de um mês (1-indexado), formato ISO — usado para buscar as sessões REAIS do mês inteiro (não a amostra de uma semana), ex.: Deduções por falta na Previsão de Receitas. */
export function mesInteiroRange(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) }
}

