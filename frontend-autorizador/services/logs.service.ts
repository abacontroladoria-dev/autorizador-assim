import { getSupabaseClient } from '@/lib/supabase/client'
import { Log } from '@/types/log'

const supabase = getSupabaseClient()

export async function buscarLogs(autorizacaoId: string): Promise<Log[]> {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('autorizacao_id', autorizacaoId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data as Log[]
}