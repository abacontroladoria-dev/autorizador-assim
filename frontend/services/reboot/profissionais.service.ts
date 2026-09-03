import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import type { RebootProfissionalRow } from "@/types/reboot"

export type RebootProfissional = RebootProfissionalRow

export type ProfissionalEdit = {
  id_profissional?: number
  nome: string
  especialidade: string | null
  ativo: boolean
}

const TABLE = "reboot_profissionais"

export async function getProfissionais(): Promise<{ data: RebootProfissional[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from(TABLE).select("*").order("nome")

  if (error) {
    console.error("Erro ao buscar profissionais:", error)
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export async function upsertProfissional(row: ProfissionalEdit): Promise<number | null> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        ...row,
        id_usuario: usuario.id,
        nome_usuario_responsavel: usuario.nome,
      },
      { onConflict: "id_profissional" }
    )
    .select("id_profissional")
    .single()

  if (error) {
    console.error("Erro ao salvar profissional:", error)
    return null
  }

  return data?.id_profissional ?? null
}
