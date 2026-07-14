// Busca a grade para a Análise Futura direto do Supabase (csv_grades_profissionais),
// SEM upload. Espelha frontend/lib/cronograma/gradeService.ts (não editar aquele
// arquivo — é compartilhado com Indicadores) com o mesmo filtro unidade_id=280 e
// reparo de mojibake, mas mapeando para o formato de colunas que a Análise Futura
// espera (ver Apêndice A.3 do plano).

import { getSupabaseClient } from "@/lib/supabase/client"
import type { CsvRow } from "@/types/cronograma"

const FIELDS = "paciente_id, paciente_nome, dia_semana, hora_inicial, hora_final, profissional_nome, terapia_nome, status_agendamento, sala_nome, data, unidade_nome"
const PAGE = 1000

const DIAS_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

function diaSemanaDeData(data: string | null): string {
  if (!data) return ""
  return DIAS_PT[new Date(`${data}T12:00:00`).getDay()] ?? ""
}

// Padrão de dupla codificação UTF-8 (mojibake) — mesma lógica de gradeService.ts,
// cópia própria pois aquele arquivo não a exporta.
const MOJIBAKE_RE = /[Â-Ã][-¿]/

function fixMojibake(s: string | null | undefined): string {
  const str = s ?? ""
  if (!str || !MOJIBAKE_RE.test(str)) return str
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      Uint8Array.from(str, c => c.charCodeAt(0) & 0xff),
    )
  } catch {
    return str
  }
}

export async function buscarGradeParaAnalise(dataInicio: string, dataFim: string): Promise<CsvRow[]> {
  const sb = getSupabaseClient()
  const all: Record<string, string | number | null>[] = []

  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("csv_grades_profissionais")
      .select(FIELDS)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .eq("unidade_id", 280)
      .order("data")
      .order("hora_inicial")
      .order("profissional_nome")
      .order("id")
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...(rows as typeof all))
    if (rows.length < PAGE) break
    from += PAGE
  }

  return all.map(r => {
    const salaNome = fixMojibake(r.sala_nome as string | null)
    return {
      "Id Favorecido": String(r.paciente_id ?? ""),
      "Nome Favorecido": fixMojibake(r.paciente_nome as string | null),
      "Dia da Semana": (r.dia_semana as string) || diaSemanaDeData(r.data as string | null),
      "Hora Inicial": String(r.hora_inicial ?? "").slice(0, 5),
      "Hora Final": String(r.hora_final ?? "").slice(0, 5),
      "Terapia": fixMojibake(r.terapia_nome as string | null),
      "Profissional": fixMojibake(r.profissional_nome as string | null),
      "Status do Agendamento": (r.status_agendamento as string) ?? "",
      "Sala": salaNome,
      "Data": (r.data as string) ?? "",
      "Unidade": fixMojibake(r.unidade_nome as string | null),
    } as unknown as CsvRow
  })
}
