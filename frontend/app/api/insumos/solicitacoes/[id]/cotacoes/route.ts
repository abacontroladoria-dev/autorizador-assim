import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, created } from "@/lib/central/response"
import { parseCriarCotacaoManual } from "@/modules/insumos/dto/fluxo.dto"
import { criarCotacaoManual } from "@/modules/insumos/services/fluxo.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/cotacoes
// Cotacao incluida a mao. Os valores derivados (valor de decisao, forma de
// pagamento, score de compatibilidade) sao calculados no service pela mesma
// logica que o worker usa — nao vem do corpo da requisicao.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parseCriarCotacaoManual(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const cotacao = await criarCotacaoManual(supabase, id, parsed.data)

    await registrarAuditoria(supabase, ator, {
      entidade: "CotacaoCompra",
      entidadeId: (cotacao as { id?: string } | null)?.id ?? null,
      acao: "criar",
      dadosDepois: cotacao,
    })

    return created(cotacao)
  } catch (err) {
    return mapInsumosError(err)
  }
}
