import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { buscarControlePrazosPdi } from "@/services/pdi/prazos"

// GET /api/pdi-controle-prazos → { ok, itens, meta }
//
// Mesmo esqueleto de /api/acompanhamento-laudos/route.ts: existe porque a
// elegibilidade do PDI depende de `orbita_laudos_relatorio`, que só
// service_role lê (ver o cabeçalho de services/pdi/prazos.ts) — o browser não
// alcança aquela tabela, e a chave nunca sai do servidor.
//
// O dado por baixo troca todo dia (o robô de laudos roda de manhã, e a grade
// sincroniza continuamente) e a resposta depende de `hoje` para todo o cálculo
// de status/prazo — nunca pode ser assada no build.
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
  // Rota com service_role, devolve nome de paciente e dado clínico — exige
  // sessão. `DISABLE_AUTH` cobre o desenvolvimento local, sem login (mesma
  // convenção de /api/acompanhamento-laudos e /api/tita/situacao-favorecidos).
  //
  // A autorização FINA (quem tem `terapeutico_pdi`) continua no
  // Sidebar/canAccess — mesma decisão e mesmo motivo já registrados em
  // /api/acompanhamento-laudos: repetir a checagem aqui exigiria um segundo
  // lugar para mantê-la em dia.
  if (process.env.DISABLE_AUTH !== "true") {
    const user = await usuarioDaRequisicao(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 })
    }
  }

  try {
    const { itens, meta } = await buscarControlePrazosPdi()
    return NextResponse.json({ ok: true, itens, meta })
  } catch (e) {
    console.error("[api/pdi-controle-prazos] falha ao montar a lista", e)
    return NextResponse.json(
      { ok: false, error: "falha_ao_ler_pdi_controle_prazos" },
      { status: 500 },
    )
  }
}
