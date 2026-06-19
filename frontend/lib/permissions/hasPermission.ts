import { getSupabaseClient } from '@/lib/supabase/client'

// Fonte única de verdade movida para ./routes (módulo puro, sem supabase),
// compartilhada com o proxy server-side. Re-exportado aqui por compatibilidade.
export { roleDefaults, getRoleDefaultPermissions } from './routes'
import { getRoleDefaultPermissions } from './routes'

export async function hasPermission(userId: string, permissaoCodigo: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  // 1. Verifica permissão individual
  const { data: override } = await supabase
    .from('usuarios_permissoes')
    .select('permitido')
    .eq('usuario_id', userId)
    .eq('permissao_codigo', permissaoCodigo)
    .maybeSingle()

  if (override !== null) {
    return override.permitido
  }

  // 2. Fallback para perfil (role)
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', userId)
    .single()

  if (!usuario?.role) return false

  return getRoleDefaultPermissions(usuario.role).includes(permissaoCodigo)
}
