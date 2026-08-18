import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, ok } from "@/lib/central/response"
import { parsePausar } from "@/modules/insumos/dto/solicitacao.dto"
import { pausarSolicitacao } from "@/modules/insumos/services/solicitacoes.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/pausar
// Pausa operacional. O status de origem fica no historico — e o retomar depende
// dele para saber para onde voltar.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parsePausar(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const { antes, depois } = await pausarSolicitacao(supabase, id, parsed.data.motivo)

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra", entidadeId: id, acao: "editar",
      dadosAntes: antes, dadosDepois: depois,
    })

    return ok(depois)
  } catch (err) {
    return mapInsumosError(err)
  }
}
