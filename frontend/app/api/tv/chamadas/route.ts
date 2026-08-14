import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

// A TV do saguão roda sem conta logada (/tv é rota pública em proxy.ts), e a RLS
// de chamada_paciente só responde a `authenticated` — o anon lê `[]`. Por isso a
// leitura acontece aqui, no servidor, com service_role: a tela recebe apenas as
// últimas chamadas, não a tabela inteira, e nenhuma policy precisa ser afrouxada.

// A TV é painel de sala de espera, não histórico: passada a janela, some.
const JANELA_HORAS = 6

// 1 no card grande + 5 na lista lateral.
const LIMITE = 6

export async function GET(request: NextRequest) {
  try {
    return await listar(request)
  } catch {
    // Ex.: SUPABASE_SERVICE_ROLE_KEY ausente no ambiente — a TV mostra
    // "Sem conexão" em vez de quebrar a tela.
    return NextResponse.json(
      { error: 'Serviço indisponível' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

async function listar(request: NextRequest) {
  const unidade = request.nextUrl.searchParams.get('unidade')
  const desde = new Date(Date.now() - JANELA_HORAS * 60 * 60 * 1000).toISOString()

  let query = supabaseService
    .from('chamada_paciente')
    .select('id, nome, sala, agenda_id, unidade, chamado_em')
    .eq('status', 'ativo')
    .gte('chamado_em', desde)
    .order('chamado_em', { ascending: false })
    .limit(30)

  // Hoje nenhum insert preenche `unidade` (fica no default 'principal'), então o
  // filtro é opt-in: /tv?unidade=x quando existir uma segunda recepção.
  if (unidade) {
    query = query.eq('unidade', unidade)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: 'Falha ao ler as chamadas' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const chamadas = data ?? []

  // chamada_paciente.agenda_id aponta para fila_autorizacoes.id (é o que
  // /autorizacoes grava). Quando a fila conclui, o responsável já foi atendido e
  // o nome sai da tela. Chamadas de /solicitar vêm com agenda_id null e ficam.
  const agendaIds = [
    ...new Set(chamadas.map((c) => c.agenda_id).filter(Boolean) as string[]),
  ]

  const concluidos = new Set<string>()

  if (agendaIds.length > 0) {
    const { data: fila } = await supabaseService
      .from('fila_autorizacoes')
      .select('id')
      .in('id', agendaIds)
      .eq('status', 'concluido')

    for (const f of fila ?? []) {
      concluidos.add(f.id as string)
    }
  }

  const visiveis = chamadas
    .filter((c) => !c.agenda_id || !concluidos.has(c.agenda_id))
    .slice(0, LIMITE)

  return NextResponse.json(
    { chamadas: visiveis },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
