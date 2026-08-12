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
