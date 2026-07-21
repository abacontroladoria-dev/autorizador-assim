import { getSupabaseClient } from "@/lib/supabase/client"
import { fixMojibake } from "@/lib/cronograma/gradeService"
import type { ConvenioValor, ConvenioValorInput, ConvenioValorPaciente, ConvenioValorPacienteInput } from "@/lib/cronograma/convenioValoresTypes"

const TABLE = "cronograma_convenio_valores"
const TABLE_PACIENTE = "cronograma_convenio_valores_paciente"
const AGENDA_TABLE = "csv_grades_profissionais"
const PAGE = 1000

export interface OpcaoTerapia { id: number | null; nome: string }
export interface OpcaoPaciente { id: number | null; nome: string }

// ─── OPÇÕES REAIS DA AGENDA (csv_grades_profissionais) ───────────────────────
// Convênio, terapia e paciente são sempre escolhidos a partir do que já existe
// de fato na agenda sincronizada do TITA — nunca texto livre — pra nunca
// cadastrar uma regra de valor pra um convênio/terapia/paciente que não bate
// com nada real. A tabela acumula meses de sincronização (bem mais que 1
// página), então é preciso paginar por TODAS as linhas — um .limit() fixo
// cortaria no meio e esconderia pacientes/terapias que só aparecem depois
// desse ponto, mesmo eles existindo de verdade na agenda.

/** Busca todas as linhas de `coluna` (paginando por PAGE) — usado para derivar as 3 listas de opções abaixo. */
async function buscarColunaCompleta<T extends string>(coluna: T): Promise<Record<T, unknown>[]> {
  const sb = getSupabaseClient()
  const all: Record<T, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from(AGENDA_TABLE)
      .select(coluna)
      .not(coluna, "is", null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Record<T, unknown>[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return all
}

/** Convênios distintos já vistos na agenda real. Não existe convenio_id na fonte — só nome. */
export async function listarConveniosAgenda(): Promise<string[]> {
  const rows = await buscarColunaCompleta("convenio_nome")
  const nomes = rows.map(r => fixMojibake(r.convenio_nome as string).trim()).filter(Boolean)
  return [...new Set(nomes)].sort()
}

/** Terapias (ação) distintas já vistas na agenda real, com terapia_id — pra desambiguar nomes parecidos. */
export async function listarTerapiasAgenda(): Promise<OpcaoTerapia[]> {
  const sb = getSupabaseClient()
  const porNome = new Map<string, OpcaoTerapia>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from(AGENDA_TABLE)
      .select("terapia_id, terapia_nome")
      .not("terapia_nome", "is", null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    rows.forEach(r => {
      const nome = fixMojibake(r.terapia_nome as string).trim()
      if (nome && !porNome.has(nome)) porNome.set(nome, { id: (r.terapia_id as number | null) ?? null, nome })
    })
    if (rows.length < PAGE) break
    from += PAGE
  }
  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

/** Pacientes distintos já vistos na agenda real, com paciente_id — pra desambiguar nomes iguais/parecidos. */
export async function listarPacientesAgenda(): Promise<OpcaoPaciente[]> {
  const sb = getSupabaseClient()
  const porChave = new Map<string, OpcaoPaciente>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from(AGENDA_TABLE)
      .select("paciente_id, paciente_nome")
      .not("paciente_nome", "is", null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    rows.forEach(r => {
      const nome = fixMojibake(r.paciente_nome as string).trim()
      const id = (r.paciente_id as number | null) ?? null
      const chave = id !== null ? String(id) : nome
      if (nome && !porChave.has(chave)) porChave.set(chave, { id, nome })
    })
    if (rows.length < PAGE) break
    from += PAGE
  }
  return [...porChave.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

// ─── REGRAS GERAIS/POR TERAPIA DO CONVÊNIO ───────────────────────────────────

export async function listarConvenioValores(): Promise<ConvenioValor[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE).select("*").order("convenio_nome")
  if (error) throw new Error(error.message)
  return (data ?? []) as ConvenioValor[]
}

export async function criarConvenioValor(input: ConvenioValorInput): Promise<ConvenioValor> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE)
    .insert(input)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioValor
}

export async function atualizarConvenioValor(id: string, input: Partial<ConvenioValorInput>): Promise<ConvenioValor> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioValor
}

export async function excluirConvenioValor(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ─── EXCEÇÕES POR PACIENTE ────────────────────────────────────────────────────

export async function listarConvenioValoresPaciente(): Promise<ConvenioValorPaciente[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE_PACIENTE).select("*").order("convenio_nome")
  if (error) throw new Error(error.message)
  return (data ?? []) as ConvenioValorPaciente[]
}

export async function criarConvenioValorPaciente(input: ConvenioValorPacienteInput): Promise<ConvenioValorPaciente> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE_PACIENTE)
    .insert(input)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioValorPaciente
}

export async function atualizarConvenioValorPaciente(id: string, input: Partial<ConvenioValorPacienteInput>): Promise<ConvenioValorPaciente> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE_PACIENTE)
    .update(input)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioValorPaciente
}

export async function excluirConvenioValorPaciente(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(TABLE_PACIENTE).delete().eq("id", id)
  if (error) throw new Error(error.message)
}
