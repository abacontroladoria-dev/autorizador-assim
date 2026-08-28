import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import type { Database } from "@/types/supabase"

export type RebootDisponibilidade = Database["public"]["Tables"]["reboot_disponibilidade_profissional"]["Row"]

export type DisponibilidadeEdit = {
  dia_semana: number
  horario_inicio: string
  horario_fim: string
  duracao_sessao_minutos: number
  intervalo_inicio: string | null
  intervalo_fim: string | null
}

const TABLE = "reboot_disponibilidade_profissional"

export async function getDisponibilidadePorProfissional(
  idProfissional: number
): Promise<{ data: RebootDisponibilidade[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id_profissional", idProfissional)
    .order("dia_semana")

  if (error) {
    console.error("Erro ao buscar disponibilidade:", error)
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

// Substitui todas as linhas de disponibilidade do profissional pelas
// informadas — mais simples que diff fino linha a linha, e o volume por
// profissional é pequeno (poucos dias da semana).
export async function salvarDisponibilidade(
  idProfissional: number,
  linhas: DisponibilidadeEdit[]
): Promise<boolean> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  const { error: deleteError } = await supabase.from(TABLE).delete().eq("id_profissional", idProfissional)
  if (deleteError) {
    console.error("Erro ao limpar disponibilidade anterior:", deleteError)
    return false
  }

  if (linhas.length === 0) return true

  const { error: insertError } = await supabase.from(TABLE).insert(
    linhas.map((linha) => ({
      ...linha,
      id_profissional: idProfissional,
      id_usuario: usuario.id,
      nome_usuario_responsavel: usuario.nome,
    }))
  )

  if (insertError) {
    console.error("Erro ao salvar disponibilidade:", insertError)
    return false
  }

  return true
}
