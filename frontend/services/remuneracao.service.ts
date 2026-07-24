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
// profissional. Os itens de contrato (numero, funcao, valorPA, vigente,
// modeloFaturamento, valorTotal) vivem em remuneracao_contratos_itens desde
// 20260724160000 (colunas próprias em vez do blob jsonb "contratos", que
// fica congelado como backup) — reconstruídos aqui no mesmo shape
// `contratos: ContratoAtualItem[]` que os consumidores (hooks/telas) já esperam.
export async function getContratos() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('remuneracao_contratos')
    .select('*, remuneracao_contratos_itens(*)')
    .order('profissional_nome')
  if (error) {
    console.error('Erro getContratos:', error)
    return { data: null, error }
  }
  const shaped = (data ?? []).map((r: any) => {
    const { remuneracao_contratos_itens, ...resto } = r
    return {
      ...resto,
      contratos: (remuneracao_contratos_itens ?? [])
        .slice()
        .sort((a: any, b: any) => a.ordem - b.ordem)
        .map((it: any) => ({
          numero: it.numero ?? '',
          funcao: it.funcao ?? '',
          valorPA: it.valor_pa ?? 0,
          vigente: it.vigente,
          modeloFaturamento: it.modelo_faturamento === 'banco_horas' ? 'banco_horas' : 'atendimento',
          valorTotal: it.valor_total ?? 0,
        })),
    }
  })
  return { data: shaped, error: null }
}

export async function upsertContrato(record: any): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getSupabaseClient()
  const { contratos, ...parent } = record

  const { data: parentRow, error: parentError } = await supabase
    .from('remuneracao_contratos')
    .upsert(parent, { onConflict: 'profissional_nome' })
    .select('id')
    .single()
  if (parentError) {
    console.error('Erro ao salvar contrato:', parentError)
    return { ok: false, error: parentError.message }
  }

  // Substitui os itens do profissional pelo conjunto atual (mais simples que
  // diff — o volume por profissional é pequeno e a tela sempre manda a lista
  // completa dos contratos daquele profissional).
  const { error: deleteError } = await supabase
    .from('remuneracao_contratos_itens')
    .delete()
    .eq('contrato_id', parentRow.id)
  if (deleteError) {
    console.error('Erro ao limpar itens de contrato:', deleteError)
    return { ok: false, error: deleteError.message }
  }

  const itens = (contratos ?? []).map((it: any, idx: number) => ({
    contrato_id: parentRow.id,
    ordem: idx,
    numero: it.numero || null,
    funcao: it.funcao || null,
    valor_pa: it.valorPA ?? null,
    vigente: it.vigente ?? true,
    modelo_faturamento: it.modeloFaturamento === 'banco_horas' ? 'banco_horas' : 'atendimento',
    valor_total: it.valorTotal ?? null,
  }))
  if (itens.length) {
    const { error: itensError } = await supabase.from('remuneracao_contratos_itens').insert(itens)
    if (itensError) {
      console.error('Erro ao salvar itens de contrato:', itensError)
      return { ok: false, error: itensError.message }
    }
  }

  return { ok: true, error: null }
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
