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

// Busca APENAS os feriados da config de remuneração — nunca as taxas/diárias/
// valores de CC. Usado pela tela "Análise de Tratativas" (escopo Terapêutico),
// que precisa dos feriados para classificar sessões corretamente, mas jamais
// pode carregar dados monetários no cliente. Ver lib/remuneracao/tratativas.ts.
export async function getFeriadosConfig(): Promise<{ feriados: RemuneracaoConfig['feriados']; error: string | null }> {
  const supabase = getSupabaseClient()
  // Via RPC SECURITY DEFINER (migration 20260713130000): devolve SÓ a coluna
  // feriados, sem expor taxas. Funciona para roles sem SELECT direto em
  // remuneracao_config (ex.: 'terapeutico'), diferente de um select na tabela,
  // que o RLS bloquearia silenciosamente (linhas vazias) e zeraria os feriados.
  const { data, error } = await supabase.rpc('get_remuneracao_feriados')

  if (error) {
    console.error('Erro ao buscar feriados da configuração:', error)
    return { feriados: {}, error: error.message }
  }

  return { feriados: (data ?? {}) as RemuneracaoConfig['feriados'], error: null }
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

// Mesma view do roster, mas incluindo a terapia mais recente de cada profissional
// (coluna terapia_principal, adicionada em 20260708140000_...) — usada em
// Config → Capacidade do profissional para exibir a "terapia base".
export async function getProfissionaisRosterComTerapia(): Promise<{ data: { profissional_nome: string; terapia_principal: string | null }[] | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('vw_remuneracao_profissionais_roster')
    .select('profissional_nome, terapia_principal')
    .order('profissional_nome')

  if (error) {
    console.error('Erro getProfissionaisRosterComTerapia:', error)
    return { data: null, error }
  }
  return { data: data as { profissional_nome: string; terapia_principal: string | null }[], error: null }
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

export async function upsertContrato(record: any) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('remuneracao_contratos').upsert(record, { onConflict: 'profissional_nome' })
  if (error) console.error('Erro ao salvar contrato:', error)
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
