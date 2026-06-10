import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Rotas públicas
  const publicRoutes = ['/login', '/definir-senha', '/auth/callback', '/disponibilidade-terapeuta/login']

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    // Verifica se ainda precisa configurar antes de enviar ao dashboard
    const { data: p } = await supabaseService
      .from('usuarios')
      .select('primeiro_acesso, username, ativo')
      .eq('id', user.id)
      .maybeSingle()
    if (!p?.ativo) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (p?.primeiro_acesso === true || !p?.username) {
      return NextResponse.redirect(new URL('/definir-senha', request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Para rotas públicas ou usuários não logados, não verificar perfil
  if (!user || isPublicRoute) {
    return response
  }

  let { data: perfil } = await supabaseService
    .from('usuarios')
    .select('role, ativo, primeiro_acesso, username')
    .eq('id', user.id)
    .single()

  if (!perfil && user.email) {
    const fallback = await supabaseService
      .from('usuarios')
      .select('role, ativo, primeiro_acesso, username')
      .eq('email', user.email)
      .single()
    perfil = fallback.data
  }

  if (!perfil?.ativo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const precisaConfigurar = perfil?.primeiro_acesso === true || !perfil?.username
  if (precisaConfigurar && pathname !== '/definir-senha') {
    return NextResponse.redirect(new URL('/definir-senha', request.url))
  }

  const role = perfil?.role

  const roleRoutes: Record<string, string[]> = {
    admin: ['*'],
    diretoria: ['/', '/solicitacao', '/guias', '/financeiro'],
    recepcao: ['/', '/solicitacao'],
    terapeutico: ['/', '/terapeutas'],
    faturamento: ['/', '/guias'],
    autorizacao: ['/', '/auditoria-assim'],
    disponibilidade_terapeuta: ['/disponibilidade-terapeuta'],
  }

  const allowedRoutes = roleRoutes[role] || []

  const hasAccess =
    allowedRoutes.includes('*') ||
    allowedRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))

  if (!hasAccess) {
    return NextResponse.redirect(new URL('/sem-permissao', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
