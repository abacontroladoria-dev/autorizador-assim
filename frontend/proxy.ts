import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getRoleDefaultPermissions, codigosToRotas } from '@/lib/permissions/routes'

export async function proxy(request: NextRequest) {
  // Bypass de auth para dev local (nunca deve estar true em produção).
  if (process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next()
  }

  let response = NextResponse.next()

  const clientIp = getClientIp(request)
  const pathname = request.nextUrl.pathname

  // Rate limit: 5 login attempts per 15 minutes per IP
  if (pathname === '/login' && request.method === 'POST') {
    const rateLimitKey = `login:${clientIp}`
    if (checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }
  }

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

  // Rotas públicas
  const publicRoutes = ['/login', '/definir-senha', '/auth/callback', '/disponibilidade-terapeuta/login', '/disponibilidade-terapeuta', '/sem-permissao', '/tv']

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    // Verifica se ainda precisa configurar antes de enviar ao dashboard
    const { data: p } = await supabase
      .from('usuarios')
      .select('primeiro_acesso, username, ativo')
      .eq('id', user.id)
      .maybeSingle()

    if (!p || !p.ativo) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (p.primeiro_acesso === true || !p.username) {
      return NextResponse.redirect(new URL('/definir-senha', request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Para rotas públicas ou usuários não logados, não verificar perfil
  if (!user || isPublicRoute) {
    return response
  }

  let { data: perfil, error: perfilError } = await supabase
    .from('usuarios')
    .select('role, ativo, primeiro_acesso, username')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil && user.email) {
    const { data: fallback } = await supabase
      .from('usuarios')
      .select('role, ativo, primeiro_acesso, username')
      .eq('email', user.email)
      .maybeSingle()
    perfil = fallback
  }

  if (!perfil?.ativo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const precisaConfigurar = perfil?.primeiro_acesso === true || !perfil?.username
  if (precisaConfigurar && pathname !== '/definir-senha') {
    return NextResponse.redirect(new URL('/definir-senha', request.url))
  }

  const role = perfil?.role ?? ''

  // Admin acessa tudo.
  if (role === 'admin') {
    return response
  }

  // Deriva as rotas permitidas do mesmo modelo do Sidebar:
  // defaults do role + overrides individuais (usuarios_permissoes).
  // A RLS permite o usuário ler as próprias linhas.
  const codigos = new Set(getRoleDefaultPermissions(role))

  const { data: overrides } = await supabase
    .from('usuarios_permissoes')
    .select('permissao_codigo, permitido')
    .eq('usuario_id', user.id)

  for (const o of overrides ?? []) {
    if (o.permitido) {
      codigos.add(o.permissao_codigo)
    } else {
      codigos.delete(o.permissao_codigo)
    }
  }

  const allowedRoutes = codigosToRotas(codigos)

  const hasAccess = allowedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  if (!hasAccess) {
    return NextResponse.redirect(new URL('/sem-permissao', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next|favicon|logo|icon|manifest|.+\\..+$).*)'],
}
