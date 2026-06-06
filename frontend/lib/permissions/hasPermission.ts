import { getSupabaseClient } from '@/lib/supabase/client'

const roleDefaults: Record<string, string[]> = {
  admin: [
    'dashboard', 'atendimentos', 'gestao', 'cronograma',
    'escala_terapeutica', 'agenda_terapeutica', 'salas',
    'guias_digitais', 'auditoria_assim', 'usuarios', 'permissoes',
  ],
  diretoria: [
    'dashboard', 'atendimentos', 'gestao', 'cronograma',
    'escala_terapeutica', 'agenda_terapeutica', 'salas',
    'guias_digitais', 'auditoria_assim',
  ],
  recepcao: ['dashboard', 'atendimentos', 'gestao', 'cronograma', 'auditoria_assim'],
  autorizacao: ['dashboard', 'cronograma', 'agenda_terapeutica', 'salas', 'auditoria_assim'],
  terapeutico: ['dashboard', 'escala_terapeutica', 'salas', 'agenda_terapeutica'],
  faturamento: ['dashboard', 'guias_digitais', 'cronograma', 'agenda_terapeutica', 'salas'],
  rp: ['dashboard', 'escala_terapeutica'],
}

export function getRoleDefaultPermissions(role: string): string[] {
  return roleDefaults[role] ?? []
}

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
