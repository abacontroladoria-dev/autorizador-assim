import { redirect } from 'next/navigation'
import AdminPageShell from '@/components/admin/AdminPageShell'
import { createClient } from '@/lib/supabase/server'
import { supabaseService } from '@/lib/supabase/service'

export default async function AdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let { data: perfil, error: perfilError } = await supabaseService
    .from('usuarios')
    .select('role, ativo')
    .eq('id', user.id)
    .single()

  if (!perfil && user.email) {
    const fallback = await supabaseService
      .from('usuarios')
      .select('role, ativo')
      .eq('email', user.email)
      .single()
    perfil = fallback.data
    perfilError = fallback.error
  }

  if (perfilError || !perfil || !perfil.ativo) {
    redirect('/login')
  }

  if (perfil.role !== 'admin') {
    redirect('/sem-permissao')
  }

  const [usersResponse, machinesResponse] = await Promise.all([
    supabaseService
      .from('usuarios')
      .select('id, nome, email, role, ativo, created_at')
      .order('nome', { ascending: true }),
    supabaseService
      .from('maquinas')
      .select('id, nome, status, user_id')
      .order('nome', { ascending: true }),
  ])

  return (
    <AdminPageShell
      initialUsers={usersResponse.data || []}
      initialMachines={machinesResponse.data || []}
    />
  )
}
