// Leitura do snapshot diário da Previsão de Receitas (Etapa 4 — ver
// supabase/functions/snapshot-previsao-receitas). Cada linha é uma sessão já
// resolvida (valor/origem/falta calculados no dia do snapshot), gravada 1x/dia
// pelo cron. Aqui só lemos — quem grava é a Edge Function (RLS só permite
// INSERT via service_role).

import { getSupabaseClient } from "@/lib/supabase/client"
import type { PrevisaoReceitaSessaoHistorico, OrigemValor } from "@/lib/cronograma/faturamentoProjecao"

const PAGE = 1000

type SegmentoHistorico = "multidisciplinar" | "processo_diagnostico"

const DOW_LABEL: Record<number, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex" }
function diaLabelDeData(data: string): string {
  const dow = new Date(`${data}T12:00:00`).getDay()
  return DOW_LABEL[dow] ?? ""
}

/** Snapshot mais recente disponível pra uma competência ("2026-07") — null se nunca rodou pra esse mês. */
export async function buscarUltimoSnapshotData(competencia: string): Promise<string | null> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("previsao_receitas_historico")
    .select("snapshot_data")
    .eq("competencia", competencia)
    .order("snapshot_data", { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0]?.snapshot_data ?? null
}

export interface HistoricoPorSegmento {
  multidisciplinar: PrevisaoReceitaSessaoHistorico[]
  processoDiagnostico: PrevisaoReceitaSessaoHistorico[]
}

/** Todas as sessões do snapshot de uma competência/dia, já separadas por segmento. */
export async function buscarHistoricoPrevisaoReceitas(competencia: string, snapshotData: string): Promise<HistoricoPorSegmento> {
  const sb = getSupabaseClient()
  const multidisciplinar: PrevisaoReceitaSessaoHistorico[] = []
  const processoDiagnostico: PrevisaoReceitaSessaoHistorico[] = []

  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("previsao_receitas_historico")
      .select("segmento, convenio_nome, tita_agendamento_id, paciente_id, paciente_nome, terapia_id, terapia_nome, data_sessao, hora_inicial, valor, origem_valor, em_falta")
      .eq("competencia", competencia)
      .eq("snapshot_data", snapshotData)
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []

    rows.forEach((r: any) => {
      const sessao: PrevisaoReceitaSessaoHistorico = {
        convenio: r.convenio_nome,
        agendamentoId: r.tita_agendamento_id,
        pacienteId: r.paciente_id,
        pacienteNome: r.paciente_nome,
        terapiaId: r.terapia_id,
        terapiaNome: r.terapia_nome,
        diaLabel: diaLabelDeData(r.data_sessao),
        data: r.data_sessao,
        horaInicial: r.hora_inicial ? String(r.hora_inicial).slice(0, 5) : null,
        valor: r.valor !== null ? Number(r.valor) : null,
        origem: r.origem_valor as OrigemValor,
        emFalta: !!r.em_falta,
      }
      const segmento = r.segmento as SegmentoHistorico
      ;(segmento === "multidisciplinar" ? multidisciplinar : processoDiagnostico).push(sessao)
    })

    if (rows.length < PAGE) break
    from += PAGE
  }

  return { multidisciplinar, processoDiagnostico }
}
