import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, ok } from "@/lib/central/response"
import { parseDecidirAprovacao } from "@/modules/insumos/dto/fluxo.dto"
import { decidirAprovacao } from "@/modules/insumos/services/fluxo.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/aprovacao
// Grava a decisao, marca a cotacao escolhida e move o status — os tres numa
// transacao so (RPC insumos_decidir_aprovacao). Uma decisao registrada sem a
// troca de status seria uma aprovacao fantasma.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parseDecidirAprovacao(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const { antes, depois } = await decidirAprovacao(supabase, id, parsed.data)

    await registrarAuditoria(supabase, ator, {
      entidade: "AprovacaoCompra", entidadeId: id, acao: "editar",
      dadosAntes: antes,
      dadosDepois: {
        decisao: parsed.data.decisao,
        cotacaoEscolhidaId: parsed.data.cotacaoEscolhidaId ?? null,
        justificativa: parsed.data.justificativa ?? null,
      },
    })

    return ok(depois)
  } catch (err) {
    return mapInsumosError(err)
  }
}
