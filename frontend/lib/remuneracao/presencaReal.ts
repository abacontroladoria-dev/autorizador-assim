// Cruza a grade de evolução (relatório csv_grade_profissionais, upload manual) com
// fila_autorizacoes — mesma tabela usada por cronograma/reposicao para faltas — para
// saber se a recepção realmente registrou falta do paciente. O relatório de evolução
// não carrega essa informação, então presencaOrbita ("Presença Recep.") saía sempre
// fixa em "Sim" (ver normalizarGradeParaSessao em relatorio.ts).
//
// Casamento em duas camadas — mesmo padrão do protótipo em calculadora-remuneracao
// (utils/faltasPacientes.js): por tita_agendamento_id quando a fila tem esse dado
// (mais confiável, imune a nome/hora ligeiramente diferentes), caindo para
// paciente+data+hora só quando a fila não registrou o id do agendamento.

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

export type PresencaIndice = {
  porId: Map<string, boolean>
  porChave: Map<string, boolean>
}

/**
 * Índice de presença (true = compareceu/concluído, false = falta) construído a
 * partir de fila_autorizacoes no intervalo de datas informado. Uma sessão ausente
 * dos dois mapas significa "sem registro na fila" — quem consome deve manter o
 * fallback atual (presença assumida) nesse caso, igual ao comportamento anterior
 * à checagem.
 */
export async function buscarPresencaFilaAutorizacoes(dataInicio: string, dataFim: string): Promise<PresencaIndice> {
  const porId = new Map<string, boolean>()
  const porChave = new Map<string, boolean>()
  if (!dataInicio || !dataFim) return { porId, porChave }

  const sb = getSupabaseClient()
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from("fila_autorizacoes")
      .select("tita_agendamento_id, paciente_nome, data_atendimento, horario, status, falta_revertida_em, cancelado_em")
      .in("status", ["falta", "concluido", "glosa"])
      .is("cancelado_em", null)
      .gte("data_atendimento", dataInicio)
      .lte("data_atendimento", dataFim)
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("Erro ao buscar presença em fila_autorizacoes:", error)
      return { porId, porChave }
    }

    const rows = data ?? []
    rows.forEach((r: any) => {
      // falta_revertida_em: a falta foi desfeita — não deve contar como ausência.
      if (r.status === "falta" && r.falta_revertida_em) return
      const presente = r.status !== "falta"
      if (r.tita_agendamento_id != null) {
        porId.set(String(r.tita_agendamento_id), presente)
      } else {
        porChave.set(chavePresenca(r.paciente_nome, r.data_atendimento, r.horario), presente)
      }
    })

    if (rows.length < PAGE) break
    from += PAGE
  }

  return { porId, porChave }
}

/**
 * Resolve a presença de uma sessão da grade: tenta pelo id do agendamento
 * (SessaoReal.id, o mesmo tita_agendamento_id) antes de cair para
 * paciente+data+hora. Retorna undefined quando não há registro em nenhum dos
 * dois mapas — o chamador decide o fallback (hoje: assume presença).
 */
export function presencaDaSessao(
  sessaoId: string | undefined,
  paciente: unknown,
  data: unknown,
  hora: unknown,
  indice: PresencaIndice
): boolean | undefined {
  const id = String(sessaoId ?? "").trim()
  if (id && indice.porId.has(id)) return indice.porId.get(id)
  return indice.porChave.get(chavePresenca(paciente, data, hora))
}
