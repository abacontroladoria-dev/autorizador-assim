import { getSupabaseClient } from "@/lib/supabase/client"
import { pm, exU } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"

const FIELDS = "id, paciente_nome, dia_semana, hora_inicial, hora_final, profissional_nome, terapia_nome, terapia_exibicao_nome, status_agendamento, convenio_nome, sala_nome, data, unidade_nome"
const PAGE = 1000

// Padrão de dupla codificação UTF-8 (mojibake): byte líder C2/C3 seguido de byte
// de continuação (80–BF). Ex.: "Araújo" gravado como "AraÃºjo".
const MOJIBAKE_RE = /[Â-Ã][-¿]/

// A sincronização da grade (Edge Function sync-grade-csv) grava texto com dupla
// codificação UTF-8. Isto repara na leitura. Só atua quando o padrão está presente,
// para não corromper texto já correto.
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

export async function buscarGradeComoCSVRows(dataInicio: string, dataFim: string): Promise<CsvRow[]> {
  const sb = getSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []

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
      .order("id")          // desempate único — paginação estável, sem pular/duplicar linhas
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (all as any[]).map((r: Record<string, string | null>) => {
    const hi_str   = String(r.hora_inicial ?? "").slice(0, 5)
    const salaNome = fixMojibake(r.sala_nome)
    return {
      CsvGradeId:               r.id ?? undefined,
      "Nome Favorecido":        fixMojibake(r.paciente_nome),
      "Dia da Semana":          r.dia_semana            ?? "",
      "Hora Inicial":           hi_str,
      "Terapia":                fixMojibake(r.terapia_nome),
      "Terapia Exibição":       fixMojibake(r.terapia_exibicao_nome),
      "Profissional":           fixMojibake(r.profissional_nome),
      "Status do Agendamento":  r.status_agendamento    ?? "",
      "Convênio":               fixMojibake(r.convenio_nome),
      "Sala":                   salaNome,
      "Data":                   r.data                  ?? "",
      HI_str:                   hi_str,
      HI:                       pm(hi_str),
      Unidade:                  exU(salaNome),
    } as unknown as CsvRow
  })
}
