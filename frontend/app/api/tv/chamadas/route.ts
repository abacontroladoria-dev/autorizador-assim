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

  // `sala` fica fora: a clínica tem uma recepção só, a TV não exibe qual, e o
  // endpoint é público — não faz sentido publicar campo que ninguém usa.
  let query = supabaseService
    .from('chamada_paciente')
    .select(
      'id, nome, agenda_id, unidade, chamado_em, paciente_id, data_atendimento, horario'
    )
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

  // A chamada guarda QUAL SESSÃO foi chamada — (paciente_id, data_atendimento,
  // horario) —, não um id de linha da fila. É o único vínculo possível: quem
  // chama é a /solicitar, e no instante do "Chamar" a linha da fila em geral
  // ainda não existe (o responsável está sendo chamado para que ela exista).
  // `unique_fila_agendamento` garante que essa tupla casa com no máximo uma
  // linha, então não há ambiguidade a resolver aqui.
  //
  // `agenda_id` é o vínculo legado da /autorizacoes (removida): as chamadas
  // antigas que ainda estejam na janela ficam sem sessão e expiram pelo tempo.
  const chave = (p: unknown, d: unknown, h: unknown) =>
    `${p}|${d}|${String(h).slice(0, 5)}`

  const comSessao = chamadas.filter(
    (c) => c.paciente_id && c.data_atendimento && c.horario
  )

  const encerradas = new Set<string>()

  if (comSessao.length > 0) {
    // Produto cartesiano de propósito: são no máximo 30 chamadas na janela, os
    // `in` batem em `unique_fila_agendamento` e o casamento exato acontece
    // abaixo, por chave. Montar um `or(and(...))` por sessão seria mais preciso
    // no wire e mais frágil na formatação de `time`.
    //
    // O filtro de status é por EXCLUSÃO, não por lista de terminais: `chk_status`
    // aceita 9 valores, e casar só `concluido` deixava na tela quem terminou em
    // `glosa` ou `concluido_sem_guia` — processo encerrado, responsável já foi
    // embora, nome parado na lateral. Assim um status terminal novo some
    // sozinho, sem ninguém precisar lembrar desta rota.
    //
    // `erro` fica do lado de cá junto dos em andamento, de propósito: a
    // automação falhou e alguém ainda vai tratar aquilo, então o nome continua.
    const { data: fila } = await supabaseService
      .from('fila_autorizacoes')
      .select('paciente_id, data_atendimento, horario')
      .in('paciente_id', [...new Set(comSessao.map((c) => c.paciente_id))])
      .in('data_atendimento', [
        ...new Set(comSessao.map((c) => c.data_atendimento)),
      ])
      .not('status', 'in', '(pendente,processando,executando,erro)')

    for (const f of fila ?? []) {
      encerradas.add(chave(f.paciente_id, f.data_atendimento, f.horario))
    }
  }

  // idade_segundos vem daqui e não do navegador: a TV pode estar num PC com o
  // relógio errado, e aí "chamada agora" viraria mentira na tela. Como o poll é
  // de 3s, a idade se atualiza sozinha sem timer nenhum no cliente.
  const agora = Date.now()

  const visiveis = chamadas
    .filter(
      (c) =>
        !encerradas.has(chave(c.paciente_id, c.data_atendimento, c.horario))
    )
    .slice(0, LIMITE)
    // Campo a campo, sem espalhar a linha: `paciente_id`, `data_atendimento` e
    // `horario` são lidos só para decidir o que sai da tela e NÃO podem ir na
    // resposta — este endpoint é público (a TV roda sem conta), e um `...c`
    // publicaria a agenda do paciente para quem chamasse a URL.
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      agenda_id: c.agenda_id,
      chamado_em: c.chamado_em,
      idade_segundos: Math.max(
        0,
        Math.round((agora - new Date(c.chamado_em as string).getTime()) / 1000)
      ),
    }))

  return NextResponse.json(
    { chamadas: visiveis },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
