import { getSupabaseClient } from '@/lib/supabase/client'
import type { FeriadoRow } from '@/types/feriados'

export async function getFeriados(): Promise<{ data: FeriadoRow[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('feriados').select('*').order('data')

  if (error) {
    console.error('Erro ao buscar feriados:', error)
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export async function upsertFeriado(
  row: { data: string; nome: string; tipo: 'integral' | 'parcial'; horario_inicio: string; horario_fim: string },
  updatedBy?: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('feriados')
    .upsert({ ...row, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null }, { onConflict: 'data' })

  if (error) {
    console.error('Erro ao salvar feriado:', error)
    return false
  }

  return true
}

export async function deleteFeriadoPorData(data: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('feriados').delete().eq('data', data)

  if (error) {
    console.error('Erro ao remover feriado:', error)
    return false
  }

  return true
}
