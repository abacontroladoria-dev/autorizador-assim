import { getSupabaseClient } from "@/lib/supabase/client"
import { buscarGrade, fixMojibake } from "@/lib/grade/fonte"
import { isFakePatient } from "@/lib/remuneracao/pacientes"
import type { Sala, SalaInput, AgendaSalaRow, AlocacaoSala, AlocacaoInput, SalaStatus, SalaTerapiaExclusiva, SalaTerapiaExclusivaInput } from "@/lib/cronograma/salasTypes"
import { registrarAuditoriaSala } from "@/services/salasAuditoria.service"

const TABLE = "cronograma_salas"
const ALOCACOES_TABLE = "cronograma_salas_alocacoes"

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
  const sala = data as Sala
  await registrarAuditoriaSala({
    tabela: "sala", registroId: sala.id, acao: "criar",
    unidadeNome: sala.unidade_nome, salaNome: sala.nome_exibicao, depois: sala,
  })
  return sala
}

export async function atualizarSala(id: string, input: Partial<SalaInput>): Promise<Sala> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle()
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  const sala = data as Sala
  await registrarAuditoriaSala({
    tabela: "sala", registroId: sala.id, acao: "editar",
    unidadeNome: sala.unidade_nome, salaNome: sala.nome_exibicao, antes: antes ?? null, depois: sala,
  })
  return sala
}

export async function arquivarSala(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle()
  const { error } = await sb.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
  await registrarAuditoriaSala({
    tabela: "sala", registroId: id, acao: "excluir",
    unidadeNome: (antes as Sala | null)?.unidade_nome ?? null,
    salaNome: (antes as Sala | null)?.nome_exibicao ?? null,
    antes: antes ?? null,
  })
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
  const data = await buscarGrade<Record<string, unknown>>({
    campos: "terapia_exibicao_nome, terapia_nome, paciente_nome, paciente_id",
    fonte: "base",
    refinar: q => q.ilike("profissional_nome", nome),
    // Esta é a única consulta da grade sem recorte de data, e o teto de 2.000 só
    // não truncava porque a tabela cobria 3 meses. Com o histórico de Jan–Jun
    // semeado ela passa a truncar — e sem ORDER BY o corte seria arbitrário,
    // deixando a lista de terapias instável entre chamadas. Ordenar por data desc
    // torna o corte determinístico e mantém o recorte no que a pessoa faz mais
    // recentemente.
    //
    // `id` não é enfeite: o teto de 2.000 são DUAS páginas de 1.000, e `data`
    // sozinha não é única — 25 profissionais passam de 1.000 linhas (máx. 1.871),
    // então a fronteira entre as páginas cai no meio de um grupo de mesma data.
    // Sem desempate estável a segunda página pode repetir ou PULAR linha, e a
    // terapia pulada some do dropdown de alocação.
    ordem: [{ coluna: "data", desc: true }, { coluna: "id" }],
    limite: 2000,
  })
  const nomes = data
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
  const nucleo = data as NucleoCadastrado
  await registrarAuditoriaSala({ tabela: "nucleo", registroId: nucleo.id, acao: "criar", nucleoNome: nucleo.nome, depois: nucleo })
  return nucleo
}

/** Renomear propaga automaticamente pra todas as salas que usam esse núcleo (FK ON UPDATE CASCADE). */
export async function renomearNucleo(id: string, nome: string): Promise<NucleoCadastrado> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(NUCLEOS_TABLE).select("id, nome").eq("id", id).maybeSingle()
  const { data, error } = await sb.from(NUCLEOS_TABLE).update({ nome: nome.trim() }).eq("id", id).select("id, nome").single()
  if (error) throw new Error(error.message)
  const nucleo = data as NucleoCadastrado
  await registrarAuditoriaSala({ tabela: "nucleo", registroId: nucleo.id, acao: "editar", nucleoNome: nucleo.nome, antes: antes ?? null, depois: nucleo })
  return nucleo
}

/** Falha (FK ON DELETE RESTRICT) se alguma sala ainda usa esse núcleo. */
export async function excluirNucleo(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(NUCLEOS_TABLE).select("id, nome").eq("id", id).maybeSingle()
  const { error } = await sb.from(NUCLEOS_TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
  await registrarAuditoriaSala({
    tabela: "nucleo", registroId: id, acao: "excluir",
    nucleoNome: (antes as NucleoCadastrado | null)?.nome ?? null, antes: antes ?? null,
  })
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
  const { data: antes } = await sb.from(STATUS_LABELS_TABLE).select("codigo, label, label_curto, tone").eq("codigo", codigo).maybeSingle()
  const { data, error } = await sb
    .from(STATUS_LABELS_TABLE)
    .update({ label: input.label.trim(), label_curto: input.label_curto.trim(), tone: input.tone })
    .eq("codigo", codigo)
    .select("codigo, label, label_curto, tone")
    .single()
  if (error) throw new Error(error.message)
  const statusLabel = data as StatusLabel
  await registrarAuditoriaSala({ tabela: "status_label", registroId: codigo, acao: "editar", antes: antes ?? null, depois: statusLabel })
  return statusLabel
}

// ─── ALOCAÇÕES (planejamento de sala — não escreve na TiTa) ──────────────────

export async function listarAlocacoes(): Promise<AlocacaoSala[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(ALOCACOES_TABLE).select("*")
  if (error) throw new Error(error.message)
  return (data ?? []) as AlocacaoSala[]
}

/** Nome de exibição da sala, pra denormalizar na trilha de auditoria sem exigir join na leitura do histórico. */
async function nomeDaSala(salaId: string): Promise<string | null> {
  const sb = getSupabaseClient()
  const { data } = await sb.from(TABLE).select("nome_exibicao").eq("id", salaId).maybeSingle()
  return (data as { nome_exibicao: string } | null)?.nome_exibicao ?? null
}

export async function criarAlocacao(input: AlocacaoInput): Promise<AlocacaoSala> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(ALOCACOES_TABLE).insert(input).select("*").single()
  if (error) throw new Error(error.message)
  const alocacao = data as AlocacaoSala
  await registrarAuditoriaSala({
    tabela: "alocacao", registroId: alocacao.id, acao: "criar",
    salaNome: await nomeDaSala(alocacao.sala_id), profissionalNome: alocacao.profissional_nome,
    terapiaNome: alocacao.terapia_nome, diaSemana: alocacao.dow, turno: alocacao.turno, depois: alocacao,
  })
  return alocacao
}

/** Atualiza uma alocação existente (usado tanto para "mover" — muda sala/dia/turno — quanto para editar profissional/terapia). */
export async function atualizarAlocacao(id: string, input: Partial<AlocacaoInput>): Promise<AlocacaoSala> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(ALOCACOES_TABLE).select("*").eq("id", id).maybeSingle()
  const { data, error } = await sb.from(ALOCACOES_TABLE).update(input).eq("id", id).select("*").single()
  if (error) throw new Error(error.message)
  const alocacao = data as AlocacaoSala
  await registrarAuditoriaSala({
    tabela: "alocacao", registroId: alocacao.id, acao: "editar",
    salaNome: await nomeDaSala(alocacao.sala_id), profissionalNome: alocacao.profissional_nome,
    terapiaNome: alocacao.terapia_nome, diaSemana: alocacao.dow, turno: alocacao.turno,
    antes: antes ?? null, depois: alocacao,
  })
  return alocacao
}

export async function excluirAlocacao(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(ALOCACOES_TABLE).select("*").eq("id", id).maybeSingle()
  const { error } = await sb.from(ALOCACOES_TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
  const alocacaoAntes = antes as AlocacaoSala | null
  await registrarAuditoriaSala({
    tabela: "alocacao", registroId: id, acao: "excluir",
    salaNome: alocacaoAntes ? await nomeDaSala(alocacaoAntes.sala_id) : null,
    profissionalNome: alocacaoAntes?.profissional_nome ?? null, terapiaNome: alocacaoAntes?.terapia_nome ?? null,
    diaSemana: alocacaoAntes?.dow ?? null, turno: alocacaoAntes?.turno ?? null, antes: antes ?? null,
  })
}

// ─── EXCLUSIVIDADE DE SALAS POR TERAPIA ──────────────────────────────────────

const EXCLUSIVIDADE_TERAPIA_TABLE = "cronograma_salas_terapias_exclusivas"

export async function listarExclusividadesTerapia(): Promise<SalaTerapiaExclusiva[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).select("*").order("terapia_nome")
  if (error) throw new Error(error.message)
  return (data ?? []) as SalaTerapiaExclusiva[]
}

export async function criarExclusividadeTerapia(input: SalaTerapiaExclusivaInput): Promise<SalaTerapiaExclusiva> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).insert(input).select("*").single()
  if (error) throw new Error(error.message)
  const exclusividade = data as SalaTerapiaExclusiva
  await registrarAuditoriaSala({
    tabela: "exclusividade_terapia", registroId: exclusividade.id, acao: "criar",
    salaNome: await nomeDaSala(exclusividade.sala_id), terapiaNome: exclusividade.terapia_nome, depois: exclusividade,
  })
  return exclusividade
}

/** Só o `modo` é editável — sala e terapia definem a identidade da linha (trocar exige excluir e criar outra). */
export async function atualizarModoExclusividadeTerapia(id: string, modo: SalaTerapiaExclusivaInput["modo"]): Promise<SalaTerapiaExclusiva> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).select("*").eq("id", id).maybeSingle()
  const { data, error } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).update({ modo }).eq("id", id).select("*").single()
  if (error) throw new Error(error.message)
  const exclusividade = data as SalaTerapiaExclusiva
  await registrarAuditoriaSala({
    tabela: "exclusividade_terapia", registroId: exclusividade.id, acao: "editar",
    salaNome: await nomeDaSala(exclusividade.sala_id), terapiaNome: exclusividade.terapia_nome,
    antes: antes ?? null, depois: exclusividade,
  })
  return exclusividade
}

export async function excluirExclusividadeTerapia(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).select("*").eq("id", id).maybeSingle()
  const { error } = await sb.from(EXCLUSIVIDADE_TERAPIA_TABLE).delete().eq("id", id)
  if (error) throw new Error(error.message)
  const exclusividadeAntes = antes as SalaTerapiaExclusiva | null
  await registrarAuditoriaSala({
    tabela: "exclusividade_terapia", registroId: id, acao: "excluir",
    salaNome: exclusividadeAntes ? await nomeDaSala(exclusividadeAntes.sala_id) : null,
    terapiaNome: exclusividadeAntes?.terapia_nome ?? null, antes: antes ?? null,
  })
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

/** Busca linhas de agendamento do período, para cruzar com o cadastro de salas. */
export async function buscarLinhasAgendaParaSalas(dataInicio: string, dataFim: string): Promise<AgendaSalaRow[]> {
  // Fonte "base" sem recorte: a ocupação de salas conta tanto o horário
  // ocupado quanto o slot 'Livre', e não se restringe à unidade 280.
  const all = await buscarGrade<AgendaSalaRow>({
    campos: AGENDA_FIELDS,
    fonte: "base",
    de: dataInicio,
    ate: dataFim,
    // `id` fecha a ordenação: um mês inteiro passa de 1.000 linhas e portanto
    // pagina, e (data, hora_inicial) tem empate de sobra — sem desempate único
    // a paginação pode repetir ou pular sessão.
    ordem: [{ coluna: "data" }, { coluna: "hora_inicial" }, { coluna: "id" }],
  })

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