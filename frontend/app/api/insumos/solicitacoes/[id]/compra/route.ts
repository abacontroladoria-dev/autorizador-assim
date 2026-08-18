import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, created } from "@/lib/central/response"
import { parseRegistrarCompra } from "@/modules/insumos/dto/fluxo.dto"
import { registrarCompra } from "@/modules/insumos/services/fluxo.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/compra
// Registra a compra e move COMPRA_REALIZADA -> AGUARDANDO_ENTREGA. As duas
// trocas ficam no historico: a primeira e o ato do usuario, a segunda e o
// sistema seguindo o fluxo.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parseRegistrarCompra(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const compra = await registrarCompra(supabase, id, parsed.data)

    await registrarAuditoria(supabase, ator, {
      entidade: "CompraRealizada",
      entidadeId: (compra as { id?: string } | null)?.id ?? null,
      acao: "criar",
      dadosDepois: compra,
    })

    return created(compra)
  } catch (err) {
    return mapInsumosError(err)
  }
}
