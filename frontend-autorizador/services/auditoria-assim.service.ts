import { getSupabaseClient } from '@/lib/supabase/client'
import type { AuditoriaAssimItem, KpisAuditoriaAssim } from '@/components/auditoria-assim/types'

const supabase = getSupabaseClient()

export async function listarAuditoriaAssim(data: string): Promise<AuditoriaAssimItem[]> {
  const { data: result, error } = await supabase
    .rpc('get_auditoria_assim', { p_data: data })

  if (error) {
    console.error('Erro ao buscar auditoria ASSIM:', error)
    return []
  }

  return (result || []) as AuditoriaAssimItem[]
}

export async function listarFaltasAuditoria(data: string): Promise<AuditoriaAssimItem[]> {
  const { data: result, error } = await supabase
    .from('fila_autorizacoes')
    .select('paciente_id, paciente_nome, data_atendimento, horario, tuss, terapia_nome')
    .eq('data_atendimento', data)
    .ilike('tipo_falta', '%paciente%')
    .not('terapia_nome', 'ilike', '%Equoterapia%')
    .not('terapia_nome', 'ilike', '%Fisioterapia Aquática%')

  if (error) {
    console.error('Erro ao buscar faltas auditoria ASSIM:', error)
    return []
  }

  return (result || []).map((f) => ({
    bloco_id: null,
    paciente_id: String(f.paciente_id),
    paciente_nome: f.paciente_nome,
    data_atendimento: f.data_atendimento,
    hora_inicial: f.horario,
    codigo_tuss: f.tuss,
    terapias: f.terapia_nome,
    situacao: 'FALTA',
    prioridade: 7,
    convenio_nome: null,
    profissionais: null,
    quantidade_sessoes: null,
    guia: null,
    status_assim: null,
    codigo_erro: null,
    descricao_erro: null,
    data_execucao: null,
    dias_atraso: null,
    possui_autorizacao: null,
    possui_solicitacao: null,
    observacao: 'Falta do paciente',
    motivo_glosa: null,
  }))
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
