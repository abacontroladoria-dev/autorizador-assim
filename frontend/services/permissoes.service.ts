import { getSupabaseClient } from '@/lib/supabase/client'

export type Permissao = {
  id: string
  codigo: string
  nome: string
  descricao: string | null
  rota: string | null
  grupo: string | null
}

export type UsuarioPermissao = {
  id: string
  usuario_id: string
  permissao_codigo: string
  permitido: boolean
}

export async function getPermissoes(): Promise<Permissao[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('permissoes')
    .select('id, codigo, nome, descricao, rota, grupo')
    .order('grupo')
    .order('nome')

  if (error) {
    console.error('Erro ao buscar módulos de permissão:', error)
    return []
  }

  return data || []
}

export async function getUsuarioPermissoes(usuarioId: string): Promise<UsuarioPermissao[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('usuarios_permissoes')
    .select('*')
    .eq('usuario_id', usuarioId)

  if (error) {
    console.error('Erro ao buscar permissões do usuário:', error)
    return []
  }

  return data || []
}

// Todas as sobrescritas individuais, de todos os usuários — usado pela view
// "por permissão" (quem tem acesso a X), que precisa do mapa completo de uma
// vez para não fazer N chamadas. RLS libera select completo pra admin/diretoria
// (ver 20260529110000_create_permissoes_tables.sql e
// 20260713140000_diretoria_gerencia_permissoes.sql).
export async function getAllUsuariosPermissoes(): Promise<UsuarioPermissao[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('usuarios_permissoes')
    .select('*')

  if (error) {
    console.error('Erro ao buscar permissões de todos os usuários:', error)
    return []
  }

  return data || []
}

export async function salvarPermissoesUsuario(
  usuarioId: string,
  permissoes: Record<string, boolean>
): Promise<boolean> {
  const supabase = getSupabaseClient()

  const upserts = Object.entries(permissoes).map(([codigo, permitido]) => ({
    usuario_id: usuarioId,
    permissao_codigo: codigo,
    permitido,
  }))

  const { error } = await supabase
    .from('usuarios_permissoes')
    .upsert(upserts, { onConflict: 'usuario_id,permissao_codigo' })

  if (error) {
    console.error('Erro ao salvar permissões:', error)
    return false
  }

  return true
}

export async function restaurarPermissoesDoPerfil(usuarioId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('usuarios_permissoes')
    .delete()
    .eq('usuario_id', usuarioId)

  if (error) {
    console.error('Erro ao restaurar permissões:', error)
    return false
  }

  return true
}
