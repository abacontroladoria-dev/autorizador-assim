import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

export async function buscarLogsFila(
  filaId: string
): Promise<Record<string, any>[]> {

  const { data, error } = await supabase

    .from('fila_autorizacoes_logs')

    .select('*')

    .eq('fila_id', filaId)

    .order('created_at', {
      ascending: true
    })

  if (error) {
    console.error(error)
    return []
  }

  return data || []
}