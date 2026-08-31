import { getSupabaseClient } from "@/lib/supabase/client"

export type RecusaOrigem = "ocp-clinica" | "ocp-profissional" | "ocp-paciente" | "saida-profissional"
export type RecusaAcao = "recusar" | "reativar"

export type CronogramaRecusaAuditoria = {
  id: string
  origem: RecusaOrigem
  acao: RecusaAcao
  paciente: string
  profissional: string | null
  especialidade: string | null
  unidade: string | null
  dia: string | null
  hora: string | null
  slot_chave: string
  motivo: string | null
  usuario_id: string | null
  usuario_nome: string | null
  criado_em: string
  /** Já formatado como DD/MM/AAAA HH:MM, horário de Brasília — preenchido por trigger no banco. */
  criado_em_brasilia: string | null
}

const TABLE = "cronograma_recusas_auditoria"

/** Mesma chave em todo lugar que precisa cruzar uma recusa com sua auditoria
 * (grade de Ocupação Paciente, lista Recusados, histórico de reativação). */
export function buildSlotChave(paciente: string, profissional: string, dia: string, hora: string): string {
  return `${paciente}|||${profissional}|||${dia}|||${hora}`
}

type RegistrarInput = {
  origem: RecusaOrigem
  paciente: string
  profissional?: string | null
  especialidade?: string | null
  unidade?: string | null
  dia: string
  hora: string
  motivo?: string | null
}

async function registrar(acao: RecusaAcao, input: RegistrarInput): Promise<void> {
  const sb = getSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  // Denormalizado de propósito, mesmo padrão de salasAuditoria.service.ts: se
  // o usuário for renomeado depois, a trilha continua mostrando o nome de
  // quem realmente clicou naquele momento.
  const usuarioNome = user?.id
    ? (await sb.from("usuarios").select("nome").eq("id", user.id).maybeSingle()).data?.nome ?? null
    : null
  const { error } = await sb.from(TABLE).insert({
    origem: input.origem,
    acao,
    paciente: input.paciente,
    profissional: input.profissional ?? null,
    especialidade: input.especialidade ?? null,
    unidade: input.unidade ?? null,
    dia: input.dia,
    hora: input.hora,
    slot_chave: buildSlotChave(input.paciente, input.profissional ?? "", input.dia, input.hora),
    motivo: input.motivo ?? null,
    usuario_id: user?.id ?? null,
    usuario_nome: usuarioNome,
  })
  // Auditoria não pode derrubar a ação principal (a recusa/reativação já foi
  // aplicada no estado real antes desta chamada) — só loga o erro.
  if (error) console.error(`Erro registrar${acao === "recusar" ? "Recusa" : "Reativacao"}:`, error)
}

export function registrarRecusa(input: RegistrarInput): Promise<void> {
  return registrar("recusar", input)
}

export function registrarReativacao(input: RegistrarInput): Promise<void> {
  return registrar("reativar", input)
}

export async function listarAuditoriaRecusas(): Promise<CronogramaRecusaAuditoria[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE).select("*").order("criado_em", { ascending: true })
  if (error) {
    console.error("Erro listarAuditoriaRecusas:", error)
    return []
  }
  return (data ?? []) as CronogramaRecusaAuditoria[]
}

/** Agrupa as linhas por slot_chave, em ordem cronológica — cada array é o
 * histórico completo (recusar → reativar → recusar...) daquele horário. */
export function agruparAuditoriaPorSlot(rows: CronogramaRecusaAuditoria[]): Map<string, CronogramaRecusaAuditoria[]> {
  const map = new Map<string, CronogramaRecusaAuditoria[]>()
  for (const row of rows) {
    const arr = map.get(row.slot_chave) ?? []
    arr.push(row)
    map.set(row.slot_chave, arr)
  }
  return map
}
