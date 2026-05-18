import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

function buildCookieStore(request: NextRequest) {
  return {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookies: any) {
      // no-op in API route
    },
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: buildCookieStore(request),
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'not_authenticated' },
      { status: 401 }
    )
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

  if (perfilError) {
    return NextResponse.json(
      { error: 'profile_error', message: perfilError.message },
      { status: 500 }
    )
  }

  if (!perfil) {
    return NextResponse.json(
      { error: 'profile_not_found' },
      { status: 404 }
    )
  }

  if (!perfil.ativo) {
    return NextResponse.json(
      { error: 'user_inactive', message: 'Usuário desativado' },
      { status: 403 }
    )
  }

  return NextResponse.json({ data: perfil })
}
