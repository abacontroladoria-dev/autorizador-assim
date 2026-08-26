import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import { camposAlterados, resumoAlteracao } from "@/lib/cadastros/auditoriaFormat"
import type {
  EntidadeAuditada,
  EntradaAuditoria,
  RegistroAuditoria,
} from "@/types/auditoria"

// Ver supabase/migrations/20260826120000_create_cadastros_auditoria.sql.

const TABLE = "cadastros_auditoria"

const COLUNAS = [
  "id",
  "tabela",
  "registro_id",
  "acao",
  "paciente_id",
  "paciente_nome",
  "convenio_nome",
  "alvo_nome",
  "antes",
  "depois",
  "resumo",
  "motivo",
  "usuario_id",
  "usuario_nome",
  "criado_em",
  "criado_em_brasilia",
].join(",")

/**
 * Registra uma entrada na trilha.
 *
 * NUNCA lança e nunca devolve erro: auditoria não pode derrubar a ação
 * principal. Se o paciente foi salvo e a trilha falhou, o certo é o paciente
 * continuar salvo — o erro vai para o console, não para a cara do usuário.
 * Mesma decisão de salasAuditoria.service.ts.
 */
export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    // Edição que não mudou nada não é evento. O salvar do detalhe do paciente
    // chama upsertPaciente em TODO save — inclusive quando só a ficha médica ou
    // os vínculos mudaram —, então sem esta guarda o histórico enche de linhas
    // "Nenhum campo alterado." e a trilha fica ilegível.
    if (
      entrada.acao === "editar" &&
      camposAlterados(entrada.tabela, entrada.antes ?? null, entrada.depois ?? null).length === 0
    ) {
      return
    }

    const supabase = getSupabaseClient()
    const usuario = await getUsuarioAtual()

    const { error } = await supabase.from(TABLE).insert({
      tabela: entrada.tabela,
      registro_id: String(entrada.registroId),
      acao: entrada.acao,
      paciente_id: entrada.pacienteId ?? null,
      paciente_nome: entrada.pacienteNome ?? null,
      convenio_nome: entrada.convenioNome ?? null,
      alvo_nome: entrada.alvoNome ?? null,
      antes: entrada.antes ?? null,
      depois: entrada.depois ?? null,
      resumo: resumoAlteracao(entrada),
      motivo: entrada.motivo ?? null,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
    })

    if (error) console.error("Erro ao registrar auditoria de cadastro:", error)
  } catch (e) {
    console.error("Erro ao registrar auditoria de cadastro:", e)
  }
}

export type FiltrosAuditoria = {
  /** Restringe às entidades do módulo (Pacientes ou Convênios). */
  entidades?: EntidadeAuditada[]
  /** Trilha de um registro específico. */
  tabela?: EntidadeAuditada
  registroId?: string | number
  /** Cruza paciente + responsável + ficha médica de um paciente só. */
  pacienteId?: number
  pagina?: number
  limite?: number
}

export async function getAuditoria(filtros: FiltrosAuditoria = {}): Promise<{
  data: RegistroAuditoria[]
  total: number
  error: string | null
}> {
  const supabase = getSupabaseClient()
  const limite = filtros.limite ?? 30
  const pagina = filtros.pagina ?? 1

  let query = supabase
    .from(TABLE)
    .select(COLUNAS, { count: "exact" })
    .order("criado_em", { ascending: false })

  if (filtros.entidades?.length) query = query.in("tabela", filtros.entidades)
  if (filtros.tabela) query = query.eq("tabela", filtros.tabela)
  if (filtros.registroId !== undefined) {
    query = query.eq("registro_id", String(filtros.registroId))
  }
  if (filtros.pacienteId !== undefined) query = query.eq("paciente_id", filtros.pacienteId)

  const inicio = (pagina - 1) * limite
  query = query.range(inicio, inicio + limite - 1)

  const { data, error, count } = await query

  if (error) {
    console.error("Erro ao buscar auditoria de cadastros:", error)
    return { data: [], total: 0, error: error.message }
  }

  return {
    data: (data ?? []) as unknown as RegistroAuditoria[],
    total: count ?? 0,
    error: null,
  }
}
