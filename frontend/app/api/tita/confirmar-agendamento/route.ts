import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  prepararAgendamento,
  interpretarDisponibilidade,
  interpretarResultadoCriacao,
  mensagemAmigavel,
  mensagemResumoCriacao,
} from "@/services/tita/confirmar"
import { verificarDisponibilidade, criarAgendamento } from "@/services/tita/client"
import type { AceiteSessao } from "@/types/acompanhamento"

const LOG_TAG = "[tita:confirmar-agendamento]"

interface RequestBody {
  pac?: string
  sessoes?: AceiteSessao[]
}

// Nunca inclui conteúdo bruto da TiTa (stack trace, caminhos internos) — apenas
// código de erro estável, mensagem amigável e o identificador da sessão. O corpo
// bruto de qualquer erro só é logado no servidor (ver client.ts/confirmar.ts).
interface ResultadoSessao {
  csvGradeId: string
  ok: boolean
  codigoErro?: string
  mensagem?: string
  // Preenchidos só na fase de criação (Fase 3) — reflete o achado de que
  // agendamento/create não é transacional: cria a série inteira e marca cada
  // ocorrência individualmente como "Planejado" ou "Conflito".
  status?: "success" | "partial_success" | "failed" | "erro_api"
  criadas?: number
  conflitos?: number
  rejeitadas?: number
  total?: number
  idAgendaFav?: number
}

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

// Implanta na TiTa as sessões aceitas no fluxo de Ocupação de Paciente.
//
// Estratégia "tudo ou nada": as três fases rodam em sequência para o BUNDLE
// inteiro (nenhuma fase começa até a anterior confirmar todas as sessões).
// Isso evita criar 1 de 5 sessões e travar as outras 4 num estado incerto na
// maioria dos casos — mas não é atômico: se agendamento/create falhar para a
// sessão N depois de já ter sucesso nas sessões 1..N-1, essas já foram
// efetivamente criadas na TiTa e não há rollback automático aqui.
export async function POST(request: NextRequest) {
  const inicioTotal = Date.now()

  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 })

  const body = await request.json().catch(() => null) as RequestBody | null
  if (!body?.pac || !Array.isArray(body.sessoes) || body.sessoes.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 })
  }
  if (body.sessoes.some(s => !s.csvGradeId)) {
    return NextResponse.json({ ok: false, error: "sessao_sem_csv_grade_id" }, { status: 400 })
  }

  console.log(`${LOG_TAG} início pac=${body.pac} sessoes=${body.sessoes.length}`)

  // Fase 1: busca a grade e monta o payload de cada sessão (sem chamar a TiTa ainda).
  const inicioPreparacao = Date.now()
  const preparos = await Promise.all(
    body.sessoes.map(async sessao => ({ sessao, preparo: await prepararAgendamento(sessao.csvGradeId, body.pac!) })),
  )
  const falhasPreparo = preparos.filter(p => !p.preparo.ok)
  console.log(
    `${LOG_TAG} etapa=preparacao ok=${preparos.length - falhasPreparo.length} falhas=${falhasPreparo.length} duracaoMs=${Date.now() - inicioPreparacao}`,
  )
  if (falhasPreparo.length > 0) {
    const resultados: ResultadoSessao[] = preparos.map(p => ({
      csvGradeId: p.sessao.csvGradeId,
      ok: p.preparo.ok,
      codigoErro: p.preparo.erro,
      mensagem: p.preparo.ok ? undefined : mensagemAmigavel(p.preparo.erro),
    }))
    // Códigos internos (ex.: "grade_nao_encontrada") são seguros de logar — nunca
    // carregam resposta bruta da TiTa (essa só passa por prepararAgendamento/
    // resolverGradeTerapeuta, que já logam o detalhe técnico separadamente).
    console.error(`${LOG_TAG} cancelado na fase de preparação`, JSON.stringify(resultados))
    return NextResponse.json({
      ok: false, etapa: "preparacao", mensagem: mensagemAmigavel(falhasPreparo[0].preparo.erro), resultados,
    })
  }

  // Fase 2: confere disponibilidade de TODAS antes de criar QUALQUER uma.
  const inicioDisponibilidade = Date.now()
  const disponibilidades = await Promise.all(
    preparos.map(async p => ({
      sessao: p.sessao,
      resultado: await verificarDisponibilidade({
        data_inicial: p.preparo.payload!.data_inicial,
        data_final: p.preparo.payload!.data_final,
        id_grade_terapeuta: p.preparo.payload!.id_grade_terapeuta,
        ids_favorecidos: p.preparo.payload!.ids_favorecidos,
      }),
    })),
  )
  const statusDisponibilidade = disponibilidades.map(d => ({ ...d, status: interpretarDisponibilidade(d.resultado) }))
  const indisponiveis = statusDisponibilidade.filter(d => d.status !== "disponivel")
  console.log(
    `${LOG_TAG} etapa=disponibilidade ok=${statusDisponibilidade.length - indisponiveis.length} indisponiveis=${indisponiveis.length} duracaoMs=${Date.now() - inicioDisponibilidade}`,
  )
  if (indisponiveis.length > 0) {
    // "erro_verificacao" (falha na chamada em si) é um problema técnico diferente
    // de "indisponivel" (grade genuinamente cheia) — cada sessão carrega o código
    // que reflete o que de fato aconteceu com ela.
    const resultados: ResultadoSessao[] = statusDisponibilidade.map(d => {
      const disponivel = d.status === "disponivel"
      const codigoErro = disponivel ? undefined : d.status === "erro_verificacao" ? "erro_ao_verificar_disponibilidade" : "indisponivel_na_tita"
      return { csvGradeId: d.sessao.csvGradeId, ok: disponivel, codigoErro, mensagem: codigoErro ? mensagemAmigavel(codigoErro) : undefined }
    })
    console.error(`${LOG_TAG} cancelado na fase de disponibilidade`, JSON.stringify(resultados))
    const primeiraFalha = indisponiveis[0].status === "erro_verificacao" ? "erro_ao_verificar_disponibilidade" : "indisponivel_na_tita"
    return NextResponse.json({
      ok: false, etapa: "disponibilidade", mensagem: mensagemAmigavel(primeiraFalha), resultados,
    })
  }

  // Fase 3: cria o agendamento na TiTa para todas as sessões.
  // Achado da homologação: agendamento/create NÃO é transacional — cria a série
  // semanal inteira e marca cada ocorrência como "Planejado" ou "Conflito" em vez
  // de aceitar/rejeitar tudo (ver interpretarResultadoCriacao). Por isso "ok" aqui
  // continua refletindo só o sucesso HTTP da chamada (igual à Sprint 2): mesmo com
  // conflitos parciais a reserva é persistida no Pulsar, consistente com o que a
  // TiTa de fato criou. Se a própria chamada falhar (erro_api), a reserva local do
  // Pulsar NÃO é persistida (ver confirmarImplantacao em OcupPacMode.tsx); sessões
  // já criadas com sucesso antes da falha permanecem criadas lá (sem rollback).
  const inicioCriacao = Date.now()
  const criacoes = await Promise.all(
    preparos.map(async p => {
      const inicioChamada = Date.now()
      const resultado = await criarAgendamento(p.preparo.payload!)
      const resumo = interpretarResultadoCriacao(resultado)
      // Diagnóstico completo da operação, sem token: permite reconstruir o que
      // aconteceu com cada sessão sem precisar reler os logs brutos da TiTa.
      console.log(
        `${LOG_TAG} criacao`,
        JSON.stringify({
          csvGradeId: p.sessao.csvGradeId,
          id_grade_terapeuta: p.preparo.payload!.id_grade_terapeuta,
          ids_favorecidos: p.preparo.payload!.ids_favorecidos,
          id_agenda_fav: resumo.idAgendaFav,
          status: resumo.status,
          criadas: resumo.criadas,
          conflitos: resumo.conflitos,
          rejeitadas: resumo.rejeitadas,
          duracaoMs: Date.now() - inicioChamada,
        }),
      )
      return { sessao: p.sessao, resultado, resumo }
    }),
  )
  const resultados: ResultadoSessao[] = criacoes.map(c => ({
    csvGradeId: c.sessao.csvGradeId,
    ok: c.resultado.ok,
    codigoErro: c.resultado.ok ? undefined : `tita_erro_http_${c.resultado.status}`,
    mensagem: mensagemResumoCriacao(c.resumo),
    status: c.resumo.status,
    criadas: c.resumo.criadas,
    conflitos: c.resumo.conflitos,
    rejeitadas: c.resumo.rejeitadas,
    total: c.resumo.total,
    idAgendaFav: c.resumo.idAgendaFav,
  }))
  const falhasCriacao = resultados.filter(r => !r.ok)
  const ok = falhasCriacao.length === 0
  const agregado = criacoes.reduce(
    (acc, c) => ({
      criadas: acc.criadas + c.resumo.criadas,
      conflitos: acc.conflitos + c.resumo.conflitos,
      rejeitadas: acc.rejeitadas + c.resumo.rejeitadas,
      total: acc.total + c.resumo.total,
    }),
    { criadas: 0, conflitos: 0, rejeitadas: 0, total: 0 },
  )
  console.log(
    `${LOG_TAG} etapa=criacao ok=${resultados.length - falhasCriacao.length} falhas=${falhasCriacao.length} ` +
      `criadas=${agregado.criadas} conflitos=${agregado.conflitos} rejeitadas=${agregado.rejeitadas} duracaoMs=${Date.now() - inicioCriacao}`,
  )
  if (!ok) console.error(`${LOG_TAG} falha na chamada de criação — auditar`, JSON.stringify(resultados.map(r => ({ csvGradeId: r.csvGradeId, codigoErro: r.codigoErro }))))

  console.log(`${LOG_TAG} fim pac=${body.pac} ok=${ok} duracaoTotalMs=${Date.now() - inicioTotal}`)
  return NextResponse.json({
    ok,
    etapa: "criacao",
    mensagem: ok
      ? mensagemResumoCriacao({
          status: agregado.total === 0 ? "erro_api" : agregado.criadas === agregado.total ? "success" : agregado.criadas === 0 ? "failed" : "partial_success",
          ...agregado,
        })
      : mensagemAmigavel(falhasCriacao[0]?.codigoErro),
    resultados,
  })
}
