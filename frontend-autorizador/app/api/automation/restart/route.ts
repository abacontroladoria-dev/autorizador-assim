import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

async function getCurrentUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function isAdmin(userId: string) {
  const { data } = await supabaseService
    .from('usuarios')
    .select('role, ativo')
    .eq('id', userId)
    .single()
  return data?.role === 'admin' && data?.ativo === true
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const workerUrl = process.env.WORKER_API_URL || 'http://localhost:3010'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`${workerUrl}/restart`, {
      method: 'POST',
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: body.error ?? 'Worker retornou erro' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Worker não respondeu (timeout 10s). Verifique se está em execução.' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: 'Não foi possível conectar ao worker: ' + err.message },
      { status: 502 }
    )
  }
}
