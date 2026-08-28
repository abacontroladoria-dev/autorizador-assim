import { getSupabaseClient } from '@/lib/supabase/client'
import type { TaxaEspecialidade } from '@/types/remuneracao'

export async function getTaxasEspecialidade(): Promise<{ data: TaxaEspecialidade[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('remuneracao_taxas_especialidade').select('*').order('especialidade')

  if (error) {
    console.error('Erro ao buscar taxas por especialidade:', error)
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

// Leitura para cálculo (sem exigir acesso a Taxas/Parâmetros de Remuneração,
// restrito a rp/admin/diretoria) — mesmo racional de
// listarConvenioValoresCalculo() em convenioValores.service.ts, ver a
// migration 20260824160000. `diaria` não é usada por quem só calcula
// simulação/previsão, então nem é devolvida pela RPC — fica em 0 aqui.
export async function getTaxasEspecialidadeCalculo(): Promise<{ data: TaxaEspecialidade[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('valores_calculo_taxas_especialidade')

  if (error) {
    console.error('Erro ao buscar taxas por especialidade (cálculo):', error)
    return { data: [], error: error.message }
  }

  const rows = ((data ?? []) as {
    especialidade: string; taxa_pa: number
    be_custo_mensal_pj: number | null; be_capacidade_manha: number | null; be_capacidade_tarde: number | null
  }[]).map(r => ({
    id: "", especialidade: r.especialidade, taxa_pa: r.taxa_pa, diaria: 0,
    be_custo_mensal_pj: r.be_custo_mensal_pj, be_capacidade_diaria: null,
    be_capacidade_manha: r.be_capacidade_manha, be_capacidade_tarde: r.be_capacidade_tarde,
    created_at: "", updated_at: "", updated_by: null,
  }))

  return { data: rows, error: null }
}

export async function upsertTaxaEspecialidade(
  row: {
    especialidade: string; taxa_pa: number; diaria: number
    be_custo_mensal_pj?: number | null
    be_capacidade_manha?: number | null; be_capacidade_tarde?: number | null
  },
  updatedBy?: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('remuneracao_taxas_especialidade')
    .upsert({ ...row, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null }, { onConflict: 'especialidade' })

  if (error) {
    console.error('Erro ao salvar taxa por especialidade:', error)
    return false
  }

  return true
}

export async function deleteTaxaEspecialidade(especialidade: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_taxas_especialidade').delete().eq('especialidade', especialidade)

  if (error) {
    console.error('Erro ao remover taxa por especialidade:', error)
    return false
  }

  return true
}
