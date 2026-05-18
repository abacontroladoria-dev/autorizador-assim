export type AdminUser = {
  id: string
  nome?: string
  email?: string
  role?: string
  ativo?: boolean
  created_at?: string
}

export type AdminMachine = {
  id: string
  nome?: string
  status?: string
  user_id?: string
}

import { getSupabaseClient } from '@/lib/supabase/client'
import { getFunctionHeaders, getFunctionUrl } from '@/lib/supabase/functions'

export async function getAdminUsers() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, role, ativo, created_at')
    .order('nome', { ascending: true })

  if (error) {
    console.error('Erro ao buscar usuários:', error)
    return []
  }

  return data || []
}

export async function getAdminMachines() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('maquinas')
    .select('id, nome, status, user_id')
    .order('nome', { ascending: true })

  if (error) {
    console.error('Erro ao buscar máquinas:', error)
    return []
  }

  return data || []
}

export async function toggleUserActive(userId: string, active: boolean) {
  const response = await fetch(getFunctionUrl('admin-toggle-user'), {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ userId, active }),
  })

  return response.ok
}

export async function changeUserRole(userId: string, role: string) {
  const response = await fetch(getFunctionUrl('admin-change-role'), {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ userId, role }),
  })

  return response.ok
}

export async function updateMachineStatus(machineId: string, status: string) {
  const response = await fetch(getFunctionUrl('admin-update-machine'), {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ machineId, status }),
  })

  return response.ok
}
