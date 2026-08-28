import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { buscarAcompanhamentoLaudos } from "@/services/laudos/acompanhamento"

// GET /api/acompanhamento-laudos → { ok, itens, meta }
//
// Existe porque `orbita_laudos_relatorio` só é legível por service_role (medido:
// 401/42501 com anon e com publishable key — falta de GRANT, não RLS negando
// linha). O browser não alcança aquela tabela de jeito nenhum, então a tela lê
// por aqui e a chave nunca sai do servidor.
//
// Rota PRÓPRIA e não um parâmetro de /api/laudos: aquela devolve as 1.849 linhas
// cruas com as 26 colunas do Excel, para o motor do cronograma. Esta devolve 343
// itens já agrupados por laudo e já cruzados com o cadastro. Projeções
// diferentes, consumidores diferentes; enfiar as duas numa rota faria cada
// chamador carregar o payload do outro.
//
// O dado por baixo troca todo dia (o robô roda de manhã) e a resposta depende de
// `hoje` para vigente/vencido — nunca pode ser assada no build.
export const dynamic = "force-dynamic"

async function usuarioDaRequisicao(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET(request: NextRequest) {
  // Esta rota roda com service_role e devolve nome de paciente e dado de laudo —
  // exige sessão, ao contrário de /api/laudos. `DISABLE_AUTH` cobre o
  // desenvolvimento local, onde não há login (mesma convenção de
  // /api/tita/situacao-favorecidos).
  //
  // A autorização FINA continua na RLS: quem não tem `acompanhamento_laudos`
  // (nem papel admin/diretoria/recepcao) não lê nem grava
  // `laudos_acompanhamento`, e o Sidebar/canAccess já esconde a rota. Repetir a
  // checagem de permissão aqui exigiria um segundo lugar para mantê-la em dia.
  if (process.env.DISABLE_AUTH !== "true") {
    const user = await usuarioDaRequisicao(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 })
    }
  }

  try {
    const { itens, meta } = await buscarAcompanhamentoLaudos()
    return NextResponse.json({ ok: true, itens, meta })
  } catch (e) {
    console.error("[api/acompanhamento-laudos] falha ao montar a lista", e)
    return NextResponse.json(
      { ok: false, error: "falha_ao_ler_acompanhamento_laudos" },
      { status: 500 },
    )
  }
}
