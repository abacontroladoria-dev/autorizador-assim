// Índice mensal do histórico de Previsão de Receitas (Etapa 4, complemento) —
// 1 linha por competência, gravada pela Edge Function snapshot-previsao-receitas
// (execuções diárias normais deixam status='parcial'; o job de fechamento,
// dia 5 do mês seguinte, marca 'fechado' com os números finais).

import { getSupabaseClient } from "@/lib/supabase/client"

export interface PrevisaoReceitasResumoMes {
  competencia: string
  status: "parcial" | "fechado"
  snapshotData: string
  sessoesMes: number
  faltasMes: number
  pacientesUnicos: number
  receitaSemDeducao: number
  deducaoFalta: number
  receitaComDeducao: number
}

/** Todos os meses com resumo gravado (parcial ou fechado), mais recente primeiro. */
export async function buscarResumoHistoricoReceitas(): Promise<PrevisaoReceitasResumoMes[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("previsao_receitas_historico_resumo")
    .select("competencia, status, snapshot_data, sessoes_mes, faltas_mes, pacientes_unicos, receita_sem_deducao, deducao_falta, receita_com_deducao")
    .order("competencia", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r: any) => ({
    competencia: r.competencia,
    status: r.status,
    snapshotData: r.snapshot_data,
    sessoesMes: r.sessoes_mes,
    faltasMes: r.faltas_mes,
    pacientesUnicos: r.pacientes_unicos,
    receitaSemDeducao: Number(r.receita_sem_deducao),
    deducaoFalta: Number(r.deducao_falta),
    receitaComDeducao: Number(r.receita_com_deducao),
  }))
}
