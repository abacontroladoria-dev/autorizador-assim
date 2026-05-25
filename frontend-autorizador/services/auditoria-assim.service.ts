import { getSupabaseClient } from '@/lib/supabase/client'
import type { AuditoriaAssimItem, KpisAuditoriaAssim } from '@/components/auditoria-assim/types'

const supabase = getSupabaseClient()

export async function listarAuditoriaAssim(data: string): Promise<AuditoriaAssimItem[]> {
  const { data: result, error } = await supabase
    .from('vw_auditoria_autorizacoes_assim')
    .select(`
      bloco_id,
      paciente_id,
      paciente_nome,
      data_atendimento,
      hora_inicial,
      codigo_tuss,
      convenio_nome,
      terapias,
      profissionais,
      quantidade_sessoes,
      guia,
      status_assim,
      codigo_erro,
      descricao_erro,
      data_execucao,
      situacao,
      prioridade,
      dias_atraso,
      possui_autorizacao,
      possui_solicitacao,
      observacao,
      motivo_glosa
    `)
    .eq('data_atendimento', data)
    .order('prioridade', { ascending: true })
    .order('hora_inicial', { ascending: true })
    .not('terapias', 'ilike', '%Equoterapia%')
    .not('terapias', 'ilike', '%Fisioterapia Aquática%')

  if (error) {
    console.error('Erro ao buscar auditoria ASSIM:', error)
    return []
  }

  return (result || []) as AuditoriaAssimItem[]
}

export async function salvarMotivoGlosa(bloco_id: string, motivo_glosa: string): Promise<void> {
  const { error } = await supabase
    .from('auditoria_glosa_motivos')
    .upsert({ bloco_id, motivo_glosa, atualizado_em: new Date().toISOString() }, { onConflict: 'bloco_id' })
  if (error) throw error
}

export async function buscarKpisAuditoriaAssim(data: string): Promise<KpisAuditoriaAssim | null> {
  const { data: result, error } = await supabase
    .rpc('get_kpis_auditoria_assim', { p_data: data })
    .single()

  if (error) {
    console.error('Erro ao buscar KPIs auditoria ASSIM:', error)
    return null
  }

  return result as KpisAuditoriaAssim
}
