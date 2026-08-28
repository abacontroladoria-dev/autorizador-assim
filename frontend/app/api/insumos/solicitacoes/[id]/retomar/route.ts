import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { ok } from "@/lib/central/response"
import { retomarSolicitacao } from "@/modules/insumos/services/solicitacoes.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/retomar
// Volta para o status anterior a pausa, lido do historico.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const { antes, depois } = await retomarSolicitacao(supabase, id)

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra", entidadeId: id, acao: "editar",
      dadosAntes: antes, dadosDepois: depois,
    })

    return ok(depois)
  } catch (err) {
    return mapInsumosError(err)
  }
}
