import { getSupabaseClient } from '@/lib/supabase/client'
import type { ParametrosGerais } from '@/types/remuneracao'

export async function getParametrosGerais(): Promise<{ data: ParametrosGerais | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('remuneracao_parametros_gerais')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar parâmetros gerais de remuneração:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

// Leitura para cálculo (sem exigir acesso a Taxas/Parâmetros de Remuneração,
// restrito a rp/admin/diretoria) — mesmo racional de
// listarConvenioValoresCalculo() em convenioValores.service.ts, ver a
// migration 20260824160000. Os demais parâmetros (cc_pa_default etc., usados
// só em telas de remuneração de terapeuta que já têm acesso via 'rp') vêm
// zerados aqui — não lidos por quem só calcula simulação/previsão.
export async function getParametrosGeraisCalculo(): Promise<{ data: ParametrosGerais | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('valores_calculo_parametros_gerais')

  if (error) {
    console.error('Erro ao buscar parâmetros gerais de remuneração (cálculo):', error)
    return { data: null, error: error.message }
  }

  const row = ((data ?? []) as {
    imposto_faturamento_pct: number; pa_capacidade_manha_padrao: number; pa_capacidade_tarde_padrao: number
  }[])[0]
  if (!row) return { data: null, error: 'Nenhum parâmetro geral encontrado. Contate um administrador.' }

  return {
    data: {
      id: "", cc_pa_default: 0, cc_pe_default: 0, cc_lim_default: 0, eta_bonus_default: 0, presenca_padrao: 0,
      imposto_faturamento_pct: row.imposto_faturamento_pct,
      pa_capacidade_manha_padrao: row.pa_capacidade_manha_padrao,
      pa_capacidade_tarde_padrao: row.pa_capacidade_tarde_padrao,
      updated_at: "", updated_by: null,
    },
    error: null,
  }
}

export async function updateParametrosGerais(
  id: string,
  patch: Partial<Omit<ParametrosGerais, 'id' | 'updated_at'>>,
  updatedBy?: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('remuneracao_parametros_gerais')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null })
    .eq('id', id)

  if (error) {
    console.error('Erro ao atualizar parâmetros gerais de remuneração:', error)
    return false
  }

  return true
}
