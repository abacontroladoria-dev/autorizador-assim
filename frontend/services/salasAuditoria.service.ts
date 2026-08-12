import { getSupabaseClient } from "@/lib/supabase/client"
import { resumoAlteracao } from "@/lib/cronograma/auditoriaFormat"

export type CronogramaTrilhaTabela = "sala" | "alocacao" | "nucleo" | "status_label" | "exclusividade_terapia"
export type CronogramaTrilhaAcao = "criar" | "editar" | "excluir"

export type CronogramaTrilhaAuditoria = {
  id: string
  tabela: CronogramaTrilhaTabela
  registro_id: string
  acao: CronogramaTrilhaAcao
  unidade_nome: string | null
  sala_nome: string | null
  nucleo_nome: string | null
  profissional_nome: string | null
  terapia_nome: string | null
  dia_semana: number | null
  turno: string | null
  antes: unknown
  depois: unknown
  motivo: string | null
  usuario_id: string | null
  usuario_nome: string | null
  criado_em: string
  /** Já formatado como DD/MM/AAAA HH:MM, horário de Brasília — preenchido por trigger no banco. */
  criado_em_brasilia: string | null
  /** Resumo em uma linha ("Núcleo: X → Y · Capacidade: A → B") — pra ler direto na planilha do Supabase, sem abrir o JSON. */
  resumo: string | null
}

const TABLE = "cronograma_salas_auditoria"

// Mesmo padrão de frontend/services/pepAuditoria.service.ts — chamado pelos
// próprios serviços de escrita (salas.service.ts), nunca direto pela tela.
export async function registrarAuditoriaSala(input: {
  tabela: CronogramaTrilhaTabela
  registroId: string
  acao: CronogramaTrilhaAcao
  unidadeNome?: string | null
  salaNome?: string | null
  nucleoNome?: string | null
  profissionalNome?: string | null
  terapiaNome?: string | null
  diaSemana?: number | null
  turno?: string | null
  antes?: unknown
  depois?: unknown
  motivo?: string | null
}): Promise<void> {
  const sb = getSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  // Denormalizado de propósito: se o usuário for renomeado depois, a trilha
  // continua mostrando o nome de quem realmente fez a ação naquele momento.
  const usuarioNome = user?.id
    ? (await sb.from("usuarios").select("nome").eq("id", user.id).maybeSingle()).data?.nome ?? null
    : null
  const { error } = await sb.from(TABLE).insert({
    tabela: input.tabela,
    registro_id: input.registroId,
    acao: input.acao,
    unidade_nome: input.unidadeNome ?? null,
    sala_nome: input.salaNome ?? null,
    nucleo_nome: input.nucleoNome ?? null,
    profissional_nome: input.profissionalNome ?? null,
    terapia_nome: input.terapiaNome ?? null,
    dia_semana: input.diaSemana ?? null,
    turno: input.turno ?? null,
    antes: input.antes ?? null,
    depois: input.depois ?? null,
    motivo: input.motivo ?? null,
    usuario_id: user?.id ?? null,
    usuario_nome: usuarioNome,
    resumo: resumoAlteracao(input),
  })
  // Auditoria não pode derrubar a ação principal (salvar/excluir o registro
  // real) — só loga o erro.
  if (error) console.error("Erro registrarAuditoriaSala:", error)
}

export async function getTrilhaAuditoriaSala(filtros?: {
  tabela?: CronogramaTrilhaTabela
  registroId?: string
  limite?: number
  pagina?: number
}): Promise<{ data: CronogramaTrilhaAuditoria[]; total: number; error: unknown }> {
  const sb = getSupabaseClient()
  let query = sb.from(TABLE).select("*", { count: "exact" }).order("criado_em", { ascending: false })
  if (filtros?.tabela) query = query.eq("tabela", filtros.tabela)
  if (filtros?.registroId) query = query.eq("registro_id", filtros.registroId)
  const limite = filtros?.limite ?? 200
  const pagina = filtros?.pagina ?? 1
  const inicio = (pagina - 1) * limite
  query = query.range(inicio, inicio + limite - 1)
  const { data, error, count } = await query
  if (error) {
    console.error("Erro getTrilhaAuditoriaSala:", error)
    return { data: [], total: 0, error }
  }
  return { data: (data ?? []) as CronogramaTrilhaAuditoria[], total: count ?? 0, error: null }
}
