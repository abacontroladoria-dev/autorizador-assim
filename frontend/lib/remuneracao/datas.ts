// Migrado de calculadora-remuneracao/src/utils/datas.ts
// Adaptação: no original, getCalendario importava FERIADOS_BR de um arquivo
// estático. No Pulsar os feriados vêm do Supabase (tabela public.feriados,
// ver hooks/useFeriados.ts), então passam a ser parâmetro em vez de import.

import { cleanTxt } from "./formatacao"
import type { FeriadoInfo } from "@/types/remuneracao"

export type Feriado = { date: string; nome: string; dow: number }

export type CalendarioResult = {
  counts: Record<1 | 2 | 3 | 4 | 5, number>
  feriadosAtivos: Feriado[]
}

export function getCalendario(
  year: number,
  month: number,
  feriados: Record<string, FeriadoInfo>,
  extraHols: Feriado[] = []
): CalendarioResult {
  const allH: Record<string, string> = {}
  for (const [data, info] of Object.entries(feriados)) allH[data] = info.nome
  extraHols.forEach(h => { if (h.date && h.nome) allH[h.date] = h.nome })

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>
  const feriadosAtivos: Feriado[] = []
  const dim = new Date(year, month, 0).getDate()

  for (let d = 1; d <= dim; d++) {
    const dt = new Date(year, month - 1, d)
    const dow = dt.getDay()
    if (dow < 1 || dow > 5) continue
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (allH[iso]) {
      feriadosAtivos.push({ date: iso, nome: allH[iso], dow })
    } else {
      counts[dow as 1 | 2 | 3 | 4 | 5]++
    }
  }

  return { counts, feriadosAtivos }
}

export function parseDateBR(v: unknown): Date | null {
  const t = cleanTxt(v)
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const [y, m, d] = t.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const match = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (!match) return null
  let [, dd, mm, yy] = match
  if (yy.length === 2) yy = "20" + yy
  return new Date(Number(yy), Number(mm) - 1, Number(dd))
}

export function dataParaISO(v: unknown): string {
  const d = parseDateBR(v)
  if (!d) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function formatDateBR(v: unknown): string {
  const d = parseDateBR(v)
  if (!d) return cleanTxt(v)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

export function mesAnoDeLinhas(linhas: Array<Record<string, unknown>>): string {
  const d = linhas.map(r => parseDateBR(r.data ?? r.Data)).find(Boolean)
  if (!d) return "Sem mês"
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d)
  return `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${d.getFullYear()}`
}

// Competência ('YYYY-MM') do mês coberto por linhas com campo `data` —
// mesma convenção usada em pep_registros_entrega/pep_apuracao_mensal.
export function competenciaDeLinhas(linhas: Array<{ data: string }>): string | null {
  const d = linhas.map(r => parseDateBR(r.data)).find((v): v is Date => v !== null)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
