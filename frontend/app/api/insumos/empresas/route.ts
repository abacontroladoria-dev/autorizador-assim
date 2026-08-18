import type { NextRequest } from "next/server"
import { extrairAtor } from "@/lib/insumos/auth"
import { mapInsumosError } from "@/lib/insumos/erros"
import { ok } from "@/lib/central/response"

// GET /api/insumos/empresas
//
// Empresas em que o usuário tem vínculo ativo, para o seletor do formulário.
//
// Existe porque o AXIUM resolvia isso de outro jeito: lá a "unidade ativa" vivia
// no JWT e havia uma tela dedicada (SelecionarUnidadePage) para trocar. Aqui a
// empresa de escrita vem do header `x-empresa-id` que o extrairAtor valida — e,
// sem esta rota, a tela não teria como oferecer a escolha e toda solicitação
// cairia na empresa padrão em silêncio. Com três empresas em jogo, isso seria
// erro de lançamento difícil de perceber depois.
//
// A RLS de `usuarios_empresas` já limita a leitura ao próprio usuário, e o join
// com `empresas` traz só as que ele pode ver.
export async function GET(request: NextRequest) {
  try {
    const { ator, supabase } = await extrairAtor(request)

    const { data, error } = await supabase
      .from("usuarios_empresas")
      .select("empresa_id, empresa_padrao, empresas(nome_fantasia, ativo)")
      .eq("usuario_id", ator.usuarioId)
      .eq("ativo", true)

    if (error) throw error

    type Linha = {
      empresa_id: string
      empresa_padrao: boolean
      empresas: { nome_fantasia: string; ativo: boolean } | null
    }

    const empresas = ((data ?? []) as unknown as Linha[])
      // Empresa desativada continua com vínculo histórico, mas não deve receber
      // solicitação nova.
      .filter((l) => l.empresas?.ativo)
      .map((l) => ({
        id: l.empresa_id,
        nomeFantasia: l.empresas!.nome_fantasia,
        padrao: l.empresa_padrao,
      }))
      .sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR"))

    return ok(empresas)
  } catch (err) {
    return mapInsumosError(err)
  }
}
