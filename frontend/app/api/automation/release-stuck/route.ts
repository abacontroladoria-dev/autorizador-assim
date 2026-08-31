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

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  // Data de HOJE em São Paulo. `en-CA` devolve YYYY-MM-DD, o formato de data_atendimento.
  const hojeSP = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())

  // Mesmos filtros da Edge Function automation-release-stuck, que é a que o botão
  // do Sidebar chama de fato. Sem eles, um clique devolvia para 'pendente' toda
  // linha órfã em 'processando' de qualquer dia (incidente de 2026-08-14):
  //   - sessão de outro dia não pode ser autorizada hoje — a ASSIM carimba
  //     data_execucao no instante da autorização e o casamento por data quebra
  //   - linha que já tem guia reautorizada vira "1601-REINCIDENCIA NO ATEN"
  const { data, error } = await supabaseService
    .from('fila_autorizacoes')
    .update({
      status: 'pendente',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'processando')
    .lt('updated_at', twoHoursAgo)
    .eq('data_atendimento', hojeSP)
    .is('numero_autorizacao', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: retidas } = await supabaseService
    .from('fila_autorizacoes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'processando')
    .lt('updated_at', twoHoursAgo)

  return NextResponse.json({
    success: true,
    liberados: data?.length ?? 0,
    retidas: retidas ?? 0,
  })
}
