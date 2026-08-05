import { getSupabaseClient } from "@/lib/supabase/client"
import { fixMojibake } from "@/lib/cronograma/gradeService"
import { isFakePatient } from "@/lib/remuneracao/pacientes"
import type { Sala, SalaInput, AgendaSalaRow, AlocacaoSala, AlocacaoInput, SalaStatus } from "@/lib/cronograma/salasTypes"

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
    .insert({ ...input, status: input.status ?? "operacional" })
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
  return atualizarSala(id, { status: bloquear ? "bloqueada" : "operacional" })
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
    .select("terapia_exibicao_nome, terapia_nome, paciente_nome, paciente_id")
    .ilike("profissional_nome", nome)
    // Versionamento: o sync marca a versão antiga com ativo=false em vez de apagar
    // (migration 20260805160000). Sem o filtro, terapia de sessão já remarcada
    // continuaria aparecendo na lista.
    .eq("ativo", true)
    // Esta é a única consulta da grade sem recorte de data, e o .limit(2000) só não
    // truncava porque a tabela cobria 3 meses. Com o histórico de Jan–Jun semeado ela
    // passa a truncar — e sem ORDER BY o corte seria arbitrário, deixando a lista de
    // terapias instável entre chamadas. Ordenar por data desc torna o corte
    // determinístico e mantém o recorte no que a pessoa faz mais recentemente.
    .order("data", { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  const nomes = (data ?? [])
    // Sessões de paciente fictício/administrativo (Ainda não selecionado,
    // Horário Administrativo, etc. — mesmo isFakePatient já usado em
    // buscarLinhasAgendaParaSalas) têm o mesmo texto placeholder no campo de
    // terapia — não é uma terapia real que o profissional realiza.
    .filter(r => !isFakePatient(r.paciente_nome as string | null, r.paciente_id !== null ? String(r.paciente_id) : null))
    .map(r => fixMojibake((r.terapia_exibicao_nome as string | null) || (r.terapia_nome as string | null)))
    .map(t => t.trim())
    .filter(Boolean)
  return [...new Set(nomes)].sort()
}

export interface NucleoCadastrado {
  id: string
  nome: string
}

const NUCLEOS_TABLE = "cronograma_nucleos"

/** Núcleos cadastrados (tabela própria, não mais derivado das salas existentes) — usado no select do formulário de sala e na tela de gerenciamento. */
export async function listarNucleos(): Promise<NucleoCadastrado[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(NUCLEOS_TABLE).select("id, nome").order("nome")
  if (error) throw new Error(error.message)
  return (data ?? []) as NucleoCadastrado[]
}

export async function criarNucleo(nome: string): Promise<NucleoCadastrado> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(NUCLEOS_TABLE).insert({ nome: nome.trim() }).select("id, nome").single()
  if (error) throw new Error(error.message)
  return data as NucleoCadastrado
}

/** Renomear propaga automaticamente pra todas as salas que usam esse núcleo (FK ON UPDATE CASCADE). */
export async function renomearNucleo(id: string, nome: string): Promise<NucleoCadastrado> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(NUCLEOS_TABLE).update({ nome: nome.trim() }).eq("id", id).select("id, nome").single()
  if (error) throw new Error(error.message)
  return data as NucleoCadastrado
}

/** Falha (FK ON DELETE RESTRICT) se alguma sala ainda usa esse núcleo. */
export async function excluirNucleo(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(NUCLEOS_TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
}

/** Paleta fixa de cores do módulo Cronograma (ver components/cronograma/ui/tones.ts) — status usa só essas 6, nunca cor livre. */
export type StatusTone = "green" | "amber" | "blue" | "purple" | "red" | "slate"

export interface StatusLabel {
  codigo: SalaStatus
  label: string
  label_curto: string
  tone: StatusTone
}

const STATUS_LABELS_TABLE = "cronograma_status_labels"

/**
 * Rótulos + cor editáveis dos status fixos de sala (operacional/bloqueada/
 * adm/nti). A lista de CÓDIGOS possíveis continua fixa (check constraint em
 * cronograma_salas.status) — o cálculo de ocupação (capacidadeProjetadaSala,
 * statusDoSlot) trata "qualquer status != operacional" de forma genérica,
 * então adicionar um novo código fixo (ex.: nti) exige migration, não é uma
 * opção livre criável aqui.
 */
export async function listarStatusLabels(): Promise<StatusLabel[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(STATUS_LABELS_TABLE).select("codigo, label, label_curto, tone")
  if (error) throw new Error(error.message)
  return (data ?? []) as StatusLabel[]
}

export async function atualizarStatusLabel(codigo: SalaStatus, input: { label: string; label_curto: string; tone: StatusTone }): Promise<StatusLabel> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(STATUS_LABELS_TABLE)
    .update({ label: input.label.trim(), label_curto: input.label_curto.trim(), tone: input.tone })
    .eq("codigo", codigo)
    .select("codigo, label, label_curto, tone")
    .single()
  if (error) throw new Error(error.message)
  return data as StatusLabel
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

export interface ProfissionalOpcao {
  id: number | null
  nome: string
}

/**
 * Lista TODOS os profissionais distintos de csv_grades_profissionais — carregada
 * uma vez ao abrir o modal de alocação, pra a lista já vir disponível antes de
 * digitar (filtro é feito no cliente conforme o usuário digita, sem round-trip
 * ao banco por tecla — ver AlocarSessaoModal). Inclui o `profissional_id` (chave
 * estável, não muda se o nome for editado na TiTa) — usado para gravar a
 * alocação com o ID, não só o nome, e viabilizar o cruzamento por ID na aba
 * Regularizações.
 */
/**
 * Usa vw_cronograma_profissionais_salas (DISTINCT já feito no banco) em vez
 * de paginar csv_grades_profissionais inteira (54 mil+ linhas para ~120
 * profissionais distintos) — ver comentário na migration que criou a view.
 */
export async function listarTodosProfissionaisSalas(): Promise<ProfissionalOpcao[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from("vw_cronograma_profissionais_salas")
    .select("profissional_id, profissional_nome")

  if (error) throw new Error(error.message)
  const porNome = new Map<string, ProfissionalOpcao>()
  ;(data ?? []).forEach(r => {
    const nome = fixMojibake(r.profissional_nome as string).trim()
    if (!nome) return
    if (!porNome.has(nome)) porNome.set(nome, { id: (r.profissional_id as number | null) ?? null, nome })
  })
  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

const AGENDA_FIELDS = [
  "tita_agendamento_id", "paciente_id", "paciente_nome", "convenio_nome", "unidade_nome", "sala_nome",
  "profissional_nome", "profissional_id", "terapia_id", "terapia_nome", "terapia_exibicao_id", "terapia_exibicao_nome",
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
      .eq("ativo", true)    // versionamento — ver nota em buscarTerapiasDoProfissional
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
  return all
    .map(r => ({
      ...r,
      paciente_nome: fixMojibake(r.paciente_nome),
      convenio_nome: fixMojibake(r.convenio_nome),
      unidade_nome: fixMojibake(r.unidade_nome),
      sala_nome: fixMojibake(r.sala_nome),
      profissional_nome: fixMojibake(r.profissional_nome),
      terapia_nome: fixMojibake(r.terapia_nome),
      terapia_exibicao_nome: fixMojibake(r.terapia_exibicao_nome),
    }))
    // Pacientes fictícios/administrativos (Horário Administrativo, Notificação
    // Prévia, Ainda não selecionado, Supervisor(a), etc. — ver isFakePatient em
    // lib/remuneracao/pacientes.ts) não são atendimento real e não devem contar
    // como ocupação de sala nem aparecer em "Terapias mais frequentes".
    .filter(r => !isFakePatient(r.paciente_nome, r.paciente_id !== null ? String(r.paciente_id) : null))
}