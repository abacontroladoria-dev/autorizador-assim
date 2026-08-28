import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'
import { gerarSenhaAleatoria } from '@/lib/admin/temp-password'
import { UNIDADES_DISPONIVEIS } from '@/lib/admin/unidades'

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

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  if (!(await isAdmin(user))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const { nome, email, role, username, unidades } = await request.json()

    if (!nome || !email || !role) {
      return NextResponse.json({ error: 'Preencha todos os campos obrigatórios' }, { status: 400 })
    }

    const unidadesValidas = Array.isArray(unidades)
      ? unidades.filter((u) => UNIDADES_DISPONIVEIS.includes(u))
      : []

    const senhaTemporaria = gerarSenhaAleatoria()

    const { data, error } = await supabaseService.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: { nome, role },
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await supabaseService
      .from('usuarios')
      .upsert(
        {
          id: data.user.id,
          nome,
          email,
          role,
          ativo: true,
          primeiro_acesso: true,
          username: username?.trim() || null,
          unidades: unidadesValidas.length > 0 ? unidadesValidas : null,
        },
        { onConflict: 'id' }
      )

    return NextResponse.json({ success: true, password: senhaTemporaria })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
