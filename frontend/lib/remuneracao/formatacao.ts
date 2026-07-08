// Migrado de calculadora-remuneracao/src/utils/formatacao.ts

export const fmt = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const fmtPct = (v: number): string =>
  `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`

export const fmtH = (h: number | string): string => {
  const n = Number(h) || 0
  let horas = Math.floor(n)
  let mins = Math.round((n - horas) * 60)
  if (mins >= 60) { horas += Math.floor(mins / 60); mins = mins % 60 }
  return `${horas}h${String(mins).padStart(2, "0")}`
}

export const fmtHDec = (h: number | string, casas = 2): string =>
  `${fmtNumBR(Number(h) || 0, casas)}h`

export function fmtNumBR(v: unknown, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—"
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
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

export function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export const minToH = (m: number): number => m / 60

export const cleanTxt = (v: unknown): string =>
  String(v ?? "").replace(/\s+/g, " ").trim()

export const isSim = (v: unknown): boolean =>
  ["sim", "1", "true", "realizado", "evoluido"].includes(
    String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  )

export const isCancelado = (v: unknown): boolean =>
  String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().includes("cancel")

export const htmlEsc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, ch => (
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]
  ))

export const onlyDigits = (v: unknown): string =>
  String(v ?? "").replace(/\D/g, "")

export function parseNumeroBR(v: string | undefined | null): number | null {
  if (!v) return null
  const limpo = String(v).trim().replace(/\./g, "").replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

// Número → texto editável em formato BR (vírgula decimal, sem separador de
// milhar) — pensado pra popular um <input> que o usuário continua editando,
// não pra exibição final (essa é a fmt/fmtNumBR).
export function numeroParaTextoBR(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ""
  return String(v).replace(".", ",")
}

export function validarCpfCnpj(v: unknown): boolean {
  const digitos = onlyDigits(v)
  if (!digitos) return true
  return digitos.length === 11 || digitos.length === 14
}
