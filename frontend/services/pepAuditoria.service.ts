import { getSupabaseClient } from '@/lib/supabase/client'

export type PepTrilhaTabela = 'registro_entrega' | 'planejamento_semestral' | 'apuracao_mensal'
export type PepTrilhaAcao = 'criar' | 'editar' | 'excluir'

export type PepTrilhaAuditoria = {
  id: string
  tabela: PepTrilhaTabela
  registro_id: string
  acao: PepTrilhaAcao
  prestador_nome: string
  paciente_nome: string | null
  competencia: string | null
  antes: unknown
  depois: unknown
  motivo: string | null
  usuario_id: string | null
  criado_em: string
}

// PRD Seção 11.4 — toda alteração manual fica em trilha de auditoria
// (usuário, competência, antes/depois). Chamado pelos próprios serviços de
// escrita (pep.service.ts), nunca direto pela tela.
export async function registrarAuditoria(input: {
  tabela: PepTrilhaTabela
  registroId: string
  acao: PepTrilhaAcao
  prestadorNome: string
  pacienteNome?: string | null
  competencia?: string | null
  antes?: unknown
  depois?: unknown
  motivo?: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('pep_trilha_auditoria').insert({
    tabela: input.tabela,
    registro_id: input.registroId,
    acao: input.acao,
    prestador_nome: input.prestadorNome,
    paciente_nome: input.pacienteNome ?? null,
    competencia: input.competencia ?? null,
    antes: input.antes ?? null,
    depois: input.depois ?? null,
    motivo: input.motivo ?? null,
    usuario_id: user?.id ?? null,
  })
  // Auditoria não pode derrubar a ação principal (salvar/excluir o registro
  // real) — só loga o erro. Perder uma linha de trilha é ruim; bloquear o
  // trabalho da clínica por causa dela seria pior.
  if (error) console.error('Erro registrarAuditoria:', error)
}

export async function getTrilhaAuditoria(
  prestadorNome: string,
  competencia?: string
): Promise<{ data: PepTrilhaAuditoria[]; error: unknown }> {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('pep_trilha_auditoria')
    .select('*')
    .eq('prestador_nome', prestadorNome)
    .order('criado_em', { ascending: false })
  if (competencia) query = query.eq('competencia', competencia)
  const { data, error } = await query
  if (error) {
    console.error('Erro getTrilhaAuditoria:', error)
    return { data: [], error }
  }
  return { data: (data ?? []) as PepTrilhaAuditoria[], error: null }
}
