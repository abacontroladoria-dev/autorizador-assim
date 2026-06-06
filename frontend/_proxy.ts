import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

export default async function proxy(request: NextRequest) {
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

  // ROTAS PÚBLICAS
  const publicRoutes = ['/login']

  const isPublicRoute = publicRoutes.includes(pathname)

  // NÃO LOGADO
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // LOGADO TENTANDO ACESSAR LOGIN
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // SE LOGADO, BUSCAR ROLE
  if (user) {
    let { data: perfil } = await supabaseService
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
    }

    // USUÁRIO INATIVO
    if (!perfil?.ativo) {
      await supabase.auth.signOut()

      return NextResponse.redirect(new URL('/login', request.url))
    }

    const role = perfil?.role

    // CONTROLE DE ROTAS
    const roleRoutes: Record<string, string[]> = {
      admin: ['*'],

      diretoria: [
        '/',
        '/solicitacao',
        '/guias',
        '/financeiro',
      ],

      recepcao: [
        '/',
        '/solicitacao',
      ],

      terapeutico: [
        '/',
        '/terapeutas',
      ],

      faturamento: [
        '/',
        '/guias',
      ],
    }

    const allowedRoutes = roleRoutes[role] || []

    const hasAccess =
      allowedRoutes.includes('*') ||
      allowedRoutes.some((route) =>
        pathname.startsWith(route)
      )

    if (!hasAccess) {
      return NextResponse.redirect(
        new URL('/sem-permissao', request.url)
      )
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * protege tudo EXCETO:
     * - api
     * - _next
     * - favicon
     * - imagens
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}