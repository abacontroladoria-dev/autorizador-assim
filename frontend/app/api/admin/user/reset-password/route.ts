import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { checkRateLimit } from '@/lib/rate-limit'
import { gerarSenhaAleatoria } from '@/lib/admin/temp-password'

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

  const rateLimitKey = `admin:reset-password:${user.id}`
  if (checkRateLimit(rateLimitKey, 10, 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many admin operations. Please try again in a moment.' },
      { status: 429 }
    )
  }

  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })

    const senhaTemporaria = gerarSenhaAleatoria()

    const { error: authError } = await supabaseService.auth.admin.updateUserById(userId, {
      password: senhaTemporaria,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const { error: dbError } = await supabaseService
      .from('usuarios')
      .update({ primeiro_acesso: true })
      .eq('id', userId)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, password: senhaTemporaria })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
