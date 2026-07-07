// Cruza a grade de evolução (relatório csv_grade_profissionais, upload manual) com
// fila_autorizacoes — mesma tabela usada por cronograma/reposicao para faltas — para
// saber se a recepção realmente registrou falta do paciente. O relatório de evolução
// não carrega essa informação, então presencaOrbita ("Presença Recep.") saía sempre
// fixa em "Sim" (ver normalizarGradeParaSessao em relatorio.ts).

import { getSupabaseClient } from "@/lib/supabase/client"
import { normKey } from "./constants"
import { dataParaISO } from "./datas"

const PAGE = 1000

function horaChave(hora: unknown): string {
  return String(hora ?? "").slice(0, 5)
}

export function chavePresenca(paciente: unknown, data: unknown, hora: unknown): string {
  return `${normKey(paciente)}|${dataParaISO(data)}|${horaChave(hora)}`
}

/**
 * Mapa chave→presente (true = compareceu/concluído, false = falta) construído a
 * partir de fila_autorizacoes no intervalo de datas informado. Uma chave ausente no
 * mapa significa "sem registro na fila" — quem consome deve manter o fallback atual
 * (presença assumida) nesse caso, igual ao comportamento anterior à checagem.
 */
export async function buscarPresencaFilaAutorizacoes(dataInicio: string, dataFim: string): Promise<Map<string, boolean>> {
  const mapa = new Map<string, boolean>()
  if (!dataInicio || !dataFim) return mapa

  const sb = getSupabaseClient()
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from("fila_autorizacoes")
      .select("paciente_nome, data_atendimento, horario, status, falta_revertida_em, cancelado_em")
      .in("status", ["falta", "concluido", "glosa"])
      .is("cancelado_em", null)
      .gte("data_atendimento", dataInicio)
      .lte("data_atendimento", dataFim)
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("Erro ao buscar presença em fila_autorizacoes:", error)
      return mapa
    }

    const rows = data ?? []
    rows.forEach((r: any) => {
      // falta_revertida_em: a falta foi desfeita — não deve contar como ausência.
      if (r.status === "falta" && r.falta_revertida_em) return
      mapa.set(chavePresenca(r.paciente_nome, r.data_atendimento, r.horario), r.status !== "falta")
    })

    if (rows.length < PAGE) break
    from += PAGE
  }

  return mapa
}
