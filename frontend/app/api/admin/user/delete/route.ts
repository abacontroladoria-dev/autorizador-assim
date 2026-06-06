import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

async function getCurrentUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseService.auth.getUser(token)
  return user
}

async function isAdmin(user: any) {
  if (!user) return false
  const { data: perfil } = await supabaseService
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
    return fallback.data?.role === 'admin' && fallback.data?.ativo
  }
  return perfil?.role === 'admin' && perfil?.ativo
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  if (!(await isAdmin(user))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })

    if (userId === user.id) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 })
    }

    await supabaseService.from('usuarios').delete().eq('id', userId)
    const { error } = await supabaseService.auth.admin.deleteUser(userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
