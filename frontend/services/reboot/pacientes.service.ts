import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import type { Database } from "@/types/supabase"

export type RebootPaciente = Database["public"]["Tables"]["reboot_pacientes"]["Row"]

export type PacienteEdit = {
  id_paciente?: number
  nome: string
  data_nascimento: string | null
  telefone: string | null
  ativo: boolean
}

const TABLE = "reboot_pacientes"

export async function getPacientes(): Promise<{ data: RebootPaciente[]; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from(TABLE).select("*").order("nome")

  if (error) {
    console.error("Erro ao buscar pacientes:", error)
    return { data: [], error: error.message }
  }

  return { data: data ?? [], error: null }
}

export async function upsertPaciente(row: PacienteEdit): Promise<boolean> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()
  const { error } = await supabase.from(TABLE).upsert(
    {
      ...row,
      id_usuario: usuario.id,
      nome_usuario_responsavel: usuario.nome,
    },
    { onConflict: "id_paciente" }
  )

  if (error) {
    console.error("Erro ao salvar paciente:", error)
    return false
  }

  return true
}
