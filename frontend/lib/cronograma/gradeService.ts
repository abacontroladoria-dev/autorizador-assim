import { getSupabaseClient } from "@/lib/supabase/client"
import { pm, exU } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"

export async function buscarGradeComoCSVRows(dataInicio: string, dataFim: string): Promise<CsvRow[]> {
  const sb = getSupabaseClient()

  const { data, error } = await sb
    .from("csv_grades_profissionais")
    .select(
      "paciente_nome, dia_semana, hora_inicial, hora_final, profissional_nome, terapia_nome, terapia_exibicao_nome, status_agendamento, convenio_nome, sala_nome, data, unidade_nome",
    )
    .gte("data", dataInicio)
    .lte("data", dataFim)
    .eq("unidade_id", 280)
    .order("data")
    .order("hora_inicial")

  if (error) throw new Error(error.message)

  return (data ?? []).map(r => {
    const hi_str = String(r.hora_inicial ?? "").slice(0, 5)
    return {
      "Nome Favorecido":        r.paciente_nome         ?? "",
      "Dia da Semana":          r.dia_semana            ?? "",
      "Hora Inicial":           hi_str,
      "Terapia":                r.terapia_nome          ?? "",
      "Terapia Exibição":       r.terapia_exibicao_nome ?? "",
      "Profissional":           r.profissional_nome     ?? "",
      "Status do Agendamento":  r.status_agendamento    ?? "",
      "Convênio":               r.convenio_nome         ?? "",
      "Sala":                   r.sala_nome             ?? "",
      "Data":                   r.data                  ?? "",
      HI_str:                   hi_str,
      HI:                       pm(hi_str),
      Unidade:                  exU(r.sala_nome),
    } as unknown as CsvRow
  })
}
