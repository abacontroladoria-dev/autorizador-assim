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

// Máscara de moeda "estilo caixa eletrônico": os últimos 2 dígitos digitados
// são sempre os centavos — cada tecla reformata o texto todo a partir dos
// dígitos brutos (ignora o que já estava formatado). Usado em <input> de
// valor (PA, valor total) pra digitar sem precisar saber onde fica a vírgula.
export function maskMoedaBR(raw: string): string {
  const digitos = onlyDigits(raw)
  if (!digitos) return ""
  const centavos = parseInt(digitos, 10)
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Número → texto já mascarado (com separador de milhar), pra popular o
// mesmo <input> de maskMoedaBR com o valor vindo do servidor.
export function formatMoedaBRTexto(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ""
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function validarCpfCnpj(v: unknown): boolean {
  const digitos = onlyDigits(v)
  if (!digitos) return true
  return digitos.length === 11 || digitos.length === 14
}

// Documento → texto mascarado, escolhendo o formato pela contagem de dígitos:
// até 11 vira CPF, acima vira CNPJ. Formata parcialmente enquanto se digita
// (não espera o documento estar completo), e trunca em 14 dígitos. Usado em
// <input> de CPF/CNPJ pra que o operador consiga conferir o que digitou —
// 11 ou 14 dígitos corridos sem pontuação são ilegíveis de bater com um papel.
export function maskCpfCnpj(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}
