import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, noContent, ok } from "@/lib/central/response"
import { parseAtualizarSolicitacao } from "@/modules/insumos/dto/solicitacao.dto"
import {
  atualizarSolicitacao,
  buscarSolicitacao,
  excluirSolicitacao,
} from "@/modules/insumos/services/solicitacoes.service"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/insumos/solicitacoes/[id]
// Detalhe com cotações, histórico e o último job de cotação.
export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    return ok(await buscarSolicitacao(supabase, id))
  } catch (err) {
    return mapInsumosError(err)
  }
}

// PATCH /api/insumos/solicitacoes/[id]
// Editar dispara nova cotação — a edição existe para melhorar a busca com mais
// detalhe. Solicitação PAUSADA é a exceção: não destrava sozinha.
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parseAtualizarSolicitacao(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const { antes, depois } = await atualizarSolicitacao(supabase, id, parsed.data)

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra",
      entidadeId: id,
      acao: "editar",
      dadosAntes: antes,
      dadosDepois: depois,
    })

    return ok(depois)
  } catch (err) {
    return mapInsumosError(err)
  }
}

// DELETE /api/insumos/solicitacoes/[id]
// Recusa se já gerou compra. A auditoria é gravada DEPOIS do delete, mas guarda
// o estado anterior — é o único registro que sobra da solicitação.
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const antes = await excluirSolicitacao(supabase, id)

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra",
      entidadeId: id,
      acao: "excluir",
      dadosAntes: antes,
    })

    return noContent()
  } catch (err) {
    return mapInsumosError(err)
  }
}
