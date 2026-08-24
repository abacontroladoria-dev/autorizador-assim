import { getSupabaseClient } from "@/lib/supabase/client"

// "Cadastro de quantidade esperada de pacientes" (cronograma/indicadores,
// aba Profissionais) — cada linha é uma exceção ao padrão de 1 vaga por
// horário: profissional × dia da semana (1-5) × vagas simultâneas
// esperadas. Ausência de linha para um profissional+dia = padrão (1).

const TABLE = "cronograma_capacidade_profissional_dia"

export interface CapacidadeProfissionalDiaRow {
  profissional_nome: string
  dow: number
  capacidade: number
}

export async function listarCapacidadesProfissionalDia(): Promise<CapacidadeProfissionalDiaRow[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE).select("profissional_nome, dow, capacidade")
  if (error) throw new Error(error.message)
  return (data ?? []) as CapacidadeProfissionalDiaRow[]
}

/** Upsert por (profissional_nome, dow) — usado tanto para criar a primeira exceção quanto para editar uma já cadastrada. */
export async function definirCapacidadeProfissionalDia(profissionalNome: string, dow: number, capacidade: number): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb
    .from(TABLE)
    .upsert(
      { profissional_nome: profissionalNome, dow, capacidade, atualizado_em: new Date().toISOString() },
      { onConflict: "profissional_nome,dow" },
    )
  if (error) throw new Error(error.message)
}
