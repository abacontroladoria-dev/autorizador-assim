import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import type { Paciente, PacienteEdit } from "@/types/paciente"

// Cadastro canônico de paciente. Substitui services/reboot/pacientes.service.ts:
// a tabela `reboot_pacientes` foi promovida a `public.pacientes` em
// 20260817190000_pacientes_canonica.sql (uma identidade de paciente, não duas).

const TABLE = "pacientes"

// Colunas explícitas em vez de `select("*")`: sob privilégio por COLUNA o
// PostgREST devolve 403 para `*`, e esse já foi um problema real neste projeto
// (ver reference_grants_coluna_postgrest). Listar também deixa óbvio, na
// revisão, quando uma coluna nova deixa de ser lida.
const COLUNAS = [
  "id_paciente",
  "tita_paciente_id",
  "nome",
  "nome_normalizado",
  "cpf",
  "data_nascimento",
  "sexo",
  "email",
  "telefone",
  "ficticio",
  "ativo",
  "observacoes",
  "origem_cadastro",
  "sincronizado_em",
  "lgpd_consentimento_em",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "responsavel_nome",
  "responsavel_cpf",
  "responsavel_email",
  "responsavel_telefone",
  "responsavel_parentesco",
  "responsavel_financeiro",
  "responsavel_financeiro_id",
  "convenio_id",
  "convenio_nome",
  "numero_carteirinha",
  "criado_em",
  "atualizado_em",
  "nome_usuario_responsavel",
].join(",")

export type ListarPacientesOpts = {
  /** Inclui os fictícios (Horário Administrativo e afins). Padrão: false. */
  incluirFicticios?: boolean
  /** Inclui os inativos. Padrão: true — a tela de cadastro precisa vê-los. */
  incluirInativos?: boolean
}

export async function getPacientes(
  opts: ListarPacientesOpts = {}
): Promise<{ data: Paciente[]; error: string | null }> {
  const { incluirFicticios = false, incluirInativos = true } = opts
  const supabase = getSupabaseClient()

  let query = supabase.from(TABLE).select(COLUNAS).order("nome")
  if (!incluirFicticios) query = query.eq("ficticio", false)
  if (!incluirInativos) query = query.eq("ativo", true)

  const { data, error } = await query

  if (error) {
    console.error("Erro ao buscar pacientes:", error)
    return { data: [], error: error.message }
  }

  // Cast por `unknown`: com a lista de colunas montada em runtime o supabase-js
  // não consegue inferir a forma da linha e devolve GenericStringError[]. O
  // client do projeto é `createBrowserClient<any>`, então a garantia de tipo
  // aqui é o próprio `COLUNAS` acima.
  return { data: (data ?? []) as unknown as Paciente[], error: null }
}

/**
 * Busca por `tita_paciente_id` — a chave estável. Use isto ao cruzar com
 * `agenda_tita`, nunca o nome.
 */
export async function getPacientePorTitaId(
  titaPacienteId: number
): Promise<{ data: Paciente | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUNAS)
    .eq("tita_paciente_id", titaPacienteId)
    .maybeSingle()

  if (error) {
    console.error("Erro ao buscar paciente por tita_paciente_id:", error)
    return { data: null, error: error.message }
  }

  return { data: (data ?? null) as Paciente | null, error: null }
}

export async function upsertPaciente(row: PacienteEdit): Promise<boolean> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  // `origem_cadastro` só é definida na CRIAÇÃO. Num paciente que veio do TiTa
  // ela permanece 'tita', para o resync continuar podendo refrescar identidade
  // (nome/cpf/nascimento) — o backfill preserva o que foi digitado aqui via
  // COALESCE, então editar cadastro não briga com o sync.
  const payload: Record<string, unknown> = {
    ...row,
    id_usuario: usuario.id,
    nome_usuario_responsavel: usuario.nome,
  }
  if (row.id_paciente === undefined) payload.origem_cadastro = "pulsar"

  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "id_paciente" })

  if (error) {
    console.error("Erro ao salvar paciente:", error)
    return false
  }

  return true
}
