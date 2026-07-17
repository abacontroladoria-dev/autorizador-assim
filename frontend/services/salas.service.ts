import { getSupabaseClient } from "@/lib/supabase/client"
import { fixMojibake } from "@/lib/cronograma/gradeService"
import type { Sala, SalaInput, AgendaSalaRow, AlocacaoSala, AlocacaoInput } from "@/lib/cronograma/salasTypes"

const TABLE = "cronograma_salas"
const ALOCACOES_TABLE = "cronograma_salas_alocacoes"
const PAGE = 1000

export async function listarSalas(): Promise<Sala[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("unidade_nome")

  if (error) throw new Error(error.message)
  const salas = (data ?? []) as Sala[]
  return salas.sort((a, b) =>
    a.unidade_nome.localeCompare(b.unidade_nome)
    || a.numero_sala.localeCompare(b.numero_sala, undefined, { numeric: true, sensitivity: "base" }),
  )
}

export async function criarSala(input: SalaInput): Promise<Sala> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE)
    .insert({ ...input, status: input.status ?? "ativa" })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as Sala
}

export async function atualizarSala(id: string, input: Partial<SalaInput>): Promise<Sala> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as Sala
}

export async function arquivarSala(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function bloquearSala(id: string, bloquear: boolean): Promise<Sala> {
  return atualizarSala(id, { status: bloquear ? "bloqueada" : "ativa" })
}

/**
 * Terapias que um profissional específico de fato realiza, segundo o
 * histórico real de `csv_grades_profissionais` — usado para restringir a
 * lista de terapias do modal de alocação ao que essa pessoa realmente faz,
 * em vez de mostrar todas as terapias da clínica.
 */
export async function buscarTerapiasDoProfissional(profissionalNome: string): Promise<string[]> {
  const nome = profissionalNome.trim()
  if (!nome) return []
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("csv_grades_profissionais")
    .select("terapia_exibicao_nome, terapia_nome")
    .ilike("profissional_nome", nome)
    .limit(2000)
  if (error) throw new Error(error.message)
  const nomes = (data ?? [])
    .map(r => fixMojibake((r.terapia_exibicao_nome as string | null) || (r.terapia_nome as string | null)))
    .map(t => t.trim())
    .filter(Boolean)
  return [...new Set(nomes)].sort()
}

/** Núcleos distintos já cadastrados — usado como sugestão (datalist) no formulário de sala. */
export async function listarNucleosDistintos(): Promise<string[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE).select("nucleo").not("nucleo", "is", null)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map(r => (r.nucleo as string).trim()).filter(Boolean))].sort()
}

// ─── ALOCAÇÕES (planejamento de sala — não escreve na TiTa) ──────────────────

export async function listarAlocacoes(): Promise<AlocacaoSala[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(ALOCACOES_TABLE).select("*")
  if (error) throw new Error(error.message)
  return (data ?? []) as AlocacaoSala[]
}

export async function criarAlocacao(input: AlocacaoInput): Promise<AlocacaoSala> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(ALOCACOES_TABLE).insert(input).select("*").single()
  if (error) throw new Error(error.message)
  return data as AlocacaoSala
}

/** Atualiza uma alocação existente (usado tanto para "mover" — muda sala/dia/turno — quanto para editar profissional/terapia). */
export async function atualizarAlocacao(id: string, input: Partial<AlocacaoInput>): Promise<AlocacaoSala> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(ALOCACOES_TABLE).update(input).eq("id", id).select("*").single()
  if (error) throw new Error(error.message)
  return data as AlocacaoSala
}

export async function excluirAlocacao(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(ALOCACOES_TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
}

/**
 * Sugestões de profissional para o autocomplete de alocação — busca em
 * `csv_grades_profissionais` (mesma tabela usada no cruzamento de ocupação),
 * não em `agenda_tita_autorizacao_v2` (universo de profissionais diferente/
 * mais restrito, que já deixou nomes reais de fora).
 */
export async function buscarSugestoesProfissionaisSalas(query: string): Promise<string[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("csv_grades_profissionais")
    .select("profissional_nome")
    .ilike("profissional_nome", `%${q}%`)
    .not("profissional_nome", "is", null)
    .limit(500)

  if (error) throw new Error(error.message)
  const qNorm = q.toLocaleLowerCase()
  const unique = [...new Set((data ?? []).map(r => fixMojibake(r.profissional_nome as string).trim()).filter(Boolean))]
  // Prioriza nomes que COMEÇAM com o texto digitado antes dos que só contêm.
  unique.sort((a, b) => {
    const aStarts = a.toLocaleLowerCase().startsWith(qNorm)
    const bStarts = b.toLocaleLowerCase().startsWith(qNorm)
    if (aStarts !== bStarts) return aStarts ? -1 : 1
    return a.localeCompare(b)
  })
  return unique.slice(0, 15)
}

const AGENDA_FIELDS = [
  "paciente_nome", "convenio_nome", "unidade_nome", "sala_nome",
  "profissional_nome", "terapia_nome", "terapia_exibicao_nome",
  "dia_semana", "hora_inicial", "hora_final", "status_agendamento", "data",
].join(", ")

/** Busca linhas de agendamento (csv_grades_profissionais) do período, para cruzar com o cadastro de salas. */
export async function buscarLinhasAgendaParaSalas(dataInicio: string, dataFim: string): Promise<AgendaSalaRow[]> {
  const sb = getSupabaseClient()
  const all: AgendaSalaRow[] = []

  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("csv_grades_profissionais")
      .select(AGENDA_FIELDS)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data")
      .order("hora_inicial")
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as AgendaSalaRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  // A sincronização da grade (Edge Function sync-grade-csv) grava texto com
  // dupla codificação UTF-8 (mojibake) — reparado na leitura, mesmo tratamento
  // já usado em gradeService.ts.
  return all.map(r => ({
    ...r,
    paciente_nome: fixMojibake(r.paciente_nome),
    convenio_nome: fixMojibake(r.convenio_nome),
    unidade_nome: fixMojibake(r.unidade_nome),
    sala_nome: fixMojibake(r.sala_nome),
    profissional_nome: fixMojibake(r.profissional_nome),
    terapia_nome: fixMojibake(r.terapia_nome),
    terapia_exibicao_nome: fixMojibake(r.terapia_exibicao_nome),
  }))
}