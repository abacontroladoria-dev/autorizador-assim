import { getSupabaseClient } from '@/lib/supabase/client'

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

// Tabela única de contratos (substitui remuneracao_contratos_atuais +
// remuneracao_contratos_antigos — ver migration 20260710120000): 1 linha por
// profissional, lista de contratos onde "antigo" é só um item vigente=false.
export async function getContratos() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('remuneracao_contratos').select('*').order('profissional_nome')
  if (error) console.error('Erro getContratos:', error)
  return { data, error }
}

export async function upsertContrato(record: any): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_contratos').upsert(record, { onConflict: 'profissional_nome' })
  if (error) console.error('Erro ao salvar contrato:', error)
  return { ok: !error, error: error?.message ?? null }
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
