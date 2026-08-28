import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, created, ok } from "@/lib/central/response"
import { parseCriarSolicitacao, parseFiltroListagem } from "@/modules/insumos/dto/solicitacao.dto"
import { criarSolicitacao, listarSolicitacoes } from "@/modules/insumos/services/solicitacoes.service"

// GET /api/insumos/solicitacoes
// Lista as solicitações das empresas em que o usuário tem vínculo. Não há filtro
// de empresa aqui de propósito: a RLS de 20260817200000 já limita o SELECT, então
// pedir empresa_id na query só criaria uma segunda fronteira, mais fraca, para
// alguém confiar por engano.
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await extrairAtor(request)

    const parsed = parseFiltroListagem(request.nextUrl.searchParams)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const { status, limit, offset } = parsed.data
    const { data, count } = await listarSolicitacoes(supabase, { status, limit, offset })

    return ok(data, { total: count, limit, offset, hasMore: offset + data.length < count })
  } catch (err) {
    return mapInsumosError(err)
  }
}

// POST /api/insumos/solicitacoes
// Cria a solicitação e enfileira o job de cotação — atômico, via RPC.
export async function POST(request: NextRequest) {
  try {
    const { ator, supabase } = await extrairAtor(request)

    const corpo = await request.json().catch(() => null)
    const parsed = parseCriarSolicitacao(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const solicitacao = await criarSolicitacao(supabase, ator, parsed.data)

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra",
      entidadeId: (solicitacao as { id?: string } | null)?.id ?? null,
      acao: "criar",
      dadosDepois: solicitacao,
    })

    return created(solicitacao)
  } catch (err) {
    return mapInsumosError(err)
  }
}
