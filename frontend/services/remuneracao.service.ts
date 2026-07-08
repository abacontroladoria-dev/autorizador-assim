import { getSupabaseClient } from '@/lib/supabase/client'
import type { RemuneracaoConfig } from '@/types/remuneracao'

export type RemuneracaoConfigFetch = {
  data: RemuneracaoConfig | null
  error: string | null
}

export async function getRemuneracaoConfig(): Promise<RemuneracaoConfigFetch> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('remuneracao_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar configuração de remuneração:', error)
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

export async function updateRemuneracaoConfig(
  id: string,
  patch: Partial<Omit<RemuneracaoConfig, 'id' | 'updated_at'>>,
  updatedBy?: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('remuneracao_config')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null })
    .eq('id', id)

  if (error) {
    console.error('Erro ao atualizar configuração de remuneração:', error)
    return false
  }

  return true
}

export async function getCapacidades() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('remuneracao_capacidades').select('*').order('profissional_nome')
  if (error) console.error('Erro getCapacidades:', error)
  return { data, error }
}

export async function upsertCapacidade(record: any) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_capacidades').upsert(record, { onConflict: 'profissional_nome' })
  if (error) console.error('Erro ao salvar capacidade:', error)
  return !error
}

// Lista de profissionais distintos vindos da grade (vw_remuneracao_profissionais_roster),
// usada para popular a lista completa de cadastro mesmo para quem ainda não tem
// contrato antigo/atual cadastrado.
export async function getProfissionaisRoster(): Promise<{ data: string[] | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('vw_remuneracao_profissionais_roster')
    .select('profissional_nome')
    .order('profissional_nome')

  if (error) {
    console.error('Erro getProfissionaisRoster:', error)
    return { data: null, error }
  }
  return { data: (data ?? []).map((r: any) => r.profissional_nome as string), error: null }
}

export async function getContratosAtuais() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('remuneracao_contratos_atuais').select('*').order('profissional_nome')
  if (error) console.error('Erro getContratosAtuais:', error)
  return { data, error }
}

export async function upsertContratoAtual(record: any) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_contratos_atuais').upsert(record, { onConflict: 'profissional_nome' })
  if (error) console.error('Erro ao salvar contrato atual:', error)
  return !error
}

export async function getContratosAntigos() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('remuneracao_contratos_antigos').select('*').order('profissional_nome')
  if (error) console.error('Erro getContratosAntigos:', error)
  return { data, error }
}

export async function upsertContratoAntigo(record: any) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_contratos_antigos').upsert(record, { onConflict: 'profissional_nome' })
  if (error) console.error('Erro ao salvar contrato antigo:', error)
  return !error
}

export async function getHistoricoSnapshots() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('remuneracao_historico')
    .select('*')
    .order('mes_ano', { ascending: false }) // Ordem decrescente de tempo

  if (error) console.error('Erro getHistoricoSnapshots:', error)
  return { data, error }
}

export async function saveHistoricoSnapshot(record: any) {
  const supabase = getSupabaseClient()
  // upsert onConflict: mes_ano (assim a gente sobreescreve o retrato do mesmo mês se salvar de novo)
  const { data, error } = await supabase
    .from('remuneracao_historico')
    .upsert(record, { onConflict: 'mes_ano' })
    .select()
    .single()

  if (error) console.error('Erro saveHistoricoSnapshot:', error)
  return { data, error }
}

export async function deleteHistoricoSnapshot(id: string) {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('remuneracao_historico')
    .delete()
    .eq('id', id)

  return !error
}
