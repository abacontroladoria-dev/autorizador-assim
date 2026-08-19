import { getSupabaseClient } from '@/lib/supabase/client'

export type Grupo = {
  id: string
  nome: string
  descricao: string | null
  modelo_permissoes: Record<string, boolean>
  created_at?: string
}

export async function getGrupos(): Promise<Grupo[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('grupos_permissoes')
    .select('id, nome, descricao, modelo_permissoes, created_at')
    .order('nome')

  if (error) {
    console.error('Erro ao buscar grupos:', error)
    return []
  }

  return (data || []).map(g => ({ ...g, modelo_permissoes: g.modelo_permissoes || {} }))
}

// Todas as associações grupo→usuário de uma vez, igual
// getAllUsuariosPermissoes (evita N chamadas por grupo).
export async function getAllMembrosPorGrupo(): Promise<Record<string, string[]>> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('grupos_permissoes_membros')
    .select('grupo_id, usuario_id')

  if (error) {
    console.error('Erro ao buscar membros dos grupos:', error)
    return {}
  }

  const map: Record<string, string[]> = {}
  for (const row of data || []) {
    if (!map[row.grupo_id]) map[row.grupo_id] = []
    map[row.grupo_id].push(row.usuario_id)
  }
  return map
}

export async function criarGrupo(nome: string, descricao?: string): Promise<Grupo | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('grupos_permissoes')
    .insert({ nome, descricao: descricao || null })
    .select('id, nome, descricao, modelo_permissoes, created_at')
    .single()

  if (error) {
    console.error('Erro ao criar grupo:', error)
    return null
  }

  return { ...data, modelo_permissoes: data.modelo_permissoes || {} }
}

export async function renomearGrupo(
  grupoId: string,
  changes: { nome?: string; descricao?: string | null }
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('grupos_permissoes')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', grupoId)

  if (error) {
    console.error('Erro ao renomear grupo:', error)
    return false
  }

  return true
}

export async function excluirGrupo(grupoId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('grupos_permissoes').delete().eq('id', grupoId)

  if (error) {
    console.error('Erro ao excluir grupo:', error)
    return false
  }

  return true
}

export async function adicionarMembro(grupoId: string, usuarioId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('grupos_permissoes_membros')
    .upsert({ grupo_id: grupoId, usuario_id: usuarioId }, { onConflict: 'grupo_id,usuario_id' })

  if (error) {
    console.error('Erro ao adicionar membro ao grupo:', error)
    return false
  }

  return true
}

export async function removerMembro(grupoId: string, usuarioId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('grupos_permissoes_membros')
    .delete()
    .eq('grupo_id', grupoId)
    .eq('usuario_id', usuarioId)

  if (error) {
    console.error('Erro ao remover membro do grupo:', error)
    return false
  }

  return true
}

export async function salvarModeloGrupo(
  grupoId: string,
  modelo: Record<string, boolean>
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('grupos_permissoes')
    .update({ modelo_permissoes: modelo, updated_at: new Date().toISOString() })
    .eq('id', grupoId)

  if (error) {
    console.error('Erro ao salvar modelo de permissões do grupo:', error)
    return false
  }

  return true
}

// Aplica o modelo como override explícito (true ou false) em
// usuarios_permissoes para cada membro — mesma tabela usada pelas telas "por
// usuário"/"por permissão", só que em lote. Escreve um override para TODOS os
// códigos de permissão existentes (não só os marcados como true no modelo),
// pra garantir que o membro fique exatamente igual ao modelo — sem sobras de
// um override individual anterior que o modelo não previa.
export async function aplicarModeloAoGrupo(
  modelo: Record<string, boolean>,
  usuarioIds: string[],
  todosOsCodigos: string[]
): Promise<boolean> {
  if (usuarioIds.length === 0 || todosOsCodigos.length === 0) return true

  const supabase = getSupabaseClient()
  const upserts = usuarioIds.flatMap(usuario_id =>
    todosOsCodigos.map(permissao_codigo => ({
      usuario_id,
      permissao_codigo,
      permitido: modelo[permissao_codigo] ?? false,
    }))
  )

  const { error } = await supabase
    .from('usuarios_permissoes')
    .upsert(upserts, { onConflict: 'usuario_id,permissao_codigo' })

  if (error) {
    console.error('Erro ao aplicar modelo de permissões ao grupo:', error)
    return false
  }

  return true
}
