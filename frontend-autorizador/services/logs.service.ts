import { createClient } from '@/lib/supabase/client'
import { Log } from '@/types/log'

const supabase = createClient()

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