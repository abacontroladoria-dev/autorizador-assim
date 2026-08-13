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
