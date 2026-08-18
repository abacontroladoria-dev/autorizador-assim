import type { NextRequest } from "next/server"
import { extrairAtor, registrarAuditoria } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { badRequest, ok } from "@/lib/central/response"
import { parseAlterarStatus } from "@/modules/insumos/dto/solicitacao.dto"
import { alterarStatusManualmente } from "@/modules/insumos/services/solicitacoes.service"

type Ctx = { params: Promise<{ id: string }> }

// POST /api/insumos/solicitacoes/[id]/status
//
// Escape hatch: NAO valida a transicao, de proposito — serve para destravar uma
// solicitacao presa. No AXIUM exigia permissao em escopo CONSOLIDADO; aqui a
// rota precisa ficar gated pela permissao do Pulsar quando a fase 2 entrar
// (ver docs/AXIUM_MIGRACAO.md). Ate la, qualquer usuario com vinculo na empresa
// alcanca este endpoint — nao publicar sem fechar isso.
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { ator, supabase } = await extrairAtor(request)
    const { id } = await ctx.params

    const corpo = await request.json().catch(() => null)
    const parsed = parseAlterarStatus(corpo)
    if (!parsed.ok) return badRequest(parsed.errors.join("; "))

    const { antes, depois } = await alterarStatusManualmente(
      supabase, id, parsed.data.status, parsed.data.observacao
    )

    await registrarAuditoria(supabase, ator, {
      entidade: "SolicitacaoCompra", entidadeId: id, acao: "editar",
      dadosAntes: antes, dadosDepois: depois,
    })

    return ok(depois)
  } catch (err) {
    return mapInsumosError(err)
  }
}
