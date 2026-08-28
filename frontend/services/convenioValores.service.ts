import { getSupabaseClient } from "@/lib/supabase/client"
import { buscarOpcoesGrade } from "@/lib/grade/fonte"
import { isFakePatient } from "@/lib/remuneracao/pacientes"
import type {
  ConvenioValor, ConvenioValorInput, ConvenioValorPaciente, ConvenioValorPacienteInput,
  ConvenioPacoteAvaliacao, ConvenioPacoteAvaliacaoInput,
} from "@/lib/cronograma/convenioValoresTypes"

const TABLE = "cronograma_convenio_valores"
const TABLE_PACIENTE = "cronograma_convenio_valores_paciente"
const TABLE_PACOTE_AVALIACAO = "cronograma_convenio_pacote_avaliacao"

export interface OpcaoTerapia { id: number | null; nome: string }
export interface OpcaoPaciente { id: number | null; nome: string }

export interface OpcoesAgenda {
  /** Não existe convenio_id na fonte — só nome. */
  convenios: string[]
  terapias: OpcaoTerapia[]
  pacientes: OpcaoPaciente[]
}

// ─── OPÇÕES REAIS DA AGENDA ──────────────────────────────────────────────────
// Convênio, terapia e paciente são sempre escolhidos a partir do que já existe
// de fato na agenda sincronizada do TITA — nunca texto livre — pra nunca
// cadastrar uma regra de valor pra um convênio/terapia/paciente que não bate
// com nada real.
//
// Eram três funções, cada uma paginando a grade inteira sem recorte de data —
// as consultas mais caras do sistema. Em produção davam ~148 requisições por
// lista, 444 no total, e cada página refazia um seq scan completo (OFFSET não
// pula leitura). Hoje é UMA requisição a vw_grade_opcoes, que o banco já
// devolve deduplicada: ~500 linhas no lugar de ~148 mil, três vezes.
//
// A view também garante `ativo`, que faltava aqui — e só aqui — antes da
// migração: uma sessão remarcada ainda oferecia o convênio antigo.

/** Convênios, terapias e pacientes distintos já vistos na agenda real, em uma requisição. */
export async function listarOpcoesAgenda(): Promise<OpcoesAgenda> {
  const { convenios, terapias, pacientes } = await buscarOpcoesGrade()
  return {
    // "Ainda não selecionado" e afins são placeholders de agendamento
    // administrativo/fictício (ver isFakePatient) — vazam no campo convênio
    // desses registros, mas não são convênio nenhum de verdade.
    convenios: convenios.map(c => c.nome).filter(nome => !isFakePatient(nome)),
    terapias,
    pacientes: pacientes.filter(p => !isFakePatient(p.nome, p.id !== null ? String(p.id) : null)),
  }
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

// ─── PACOTE DE AVALIAÇÃO NEUROPSICOLÓGICA ─────────────────────────────────────
// Valor fixo por convênio, cobrado uma vez por paciente (não por sessão) — ver
// cronograma_convenio_pacote_avaliacao e ConvenioPacoteAvaliacao.

export async function listarConvenioPacoteAvaliacao(): Promise<ConvenioPacoteAvaliacao[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE_PACOTE_AVALIACAO).select("*").order("convenio_nome")
  if (error) throw new Error(error.message)
  return (data ?? []) as ConvenioPacoteAvaliacao[]
}

export async function criarConvenioPacoteAvaliacao(input: ConvenioPacoteAvaliacaoInput): Promise<ConvenioPacoteAvaliacao> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE_PACOTE_AVALIACAO)
    .insert(input)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioPacoteAvaliacao
}

export async function atualizarConvenioPacoteAvaliacao(id: string, input: Partial<ConvenioPacoteAvaliacaoInput>): Promise<ConvenioPacoteAvaliacao> {
  const sb = getSupabaseClient()
  const { data, error } = await sb
    .from(TABLE_PACOTE_AVALIACAO)
    .update(input)
    .eq("id", id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as ConvenioPacoteAvaliacao
}

export async function excluirConvenioPacoteAvaliacao(id: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from(TABLE_PACOTE_AVALIACAO).delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ─── LEITURA PARA CÁLCULO (sem exigir acesso a Cadastro de Valores) ──────────
// As 3 funções acima (listarConvenioValores/ValoresPaciente/PacoteAvaliacao)
// leem as tabelas cruas, com RLS restrita a admin/diretoria (ver
// 20260724200000) — correto para a tela de cadastro, mas Simulação e Previsão
// de Receitas usam esses mesmos valores só para CALCULAR uma projeção, sem
// exigir acesso à tela de cadastro. As 3 funções abaixo chamam RPCs
// SECURITY DEFINER (migration 20260824160000) que devolvem só os campos que
// resolverValorSessao/faturamentoProjecao.ts consomem — sem observações nem
// timestamps de auditoria — liberadas para quem acessa Simulação
// (cronograma_solicitacoes) ou Previsão de Receitas
// (indicadores_previsao_receitas). Os campos omitidos são preenchidos com
// placeholders (nunca lidos por quem só calcula valor de sessão).

export async function listarConvenioValoresCalculo(): Promise<ConvenioValor[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc("valores_calculo_convenio")
  if (error) throw new Error(error.message)
  return ((data ?? []) as Omit<ConvenioValor, "observacoes" | "created_at" | "updated_at">[])
    .map(r => ({ ...r, observacoes: null, created_at: "", updated_at: "" }))
}

export async function listarConvenioValoresPacienteCalculo(): Promise<ConvenioValorPaciente[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc("valores_calculo_convenio_paciente")
  if (error) throw new Error(error.message)
  return ((data ?? []) as Omit<ConvenioValorPaciente, "observacoes" | "created_at" | "updated_at">[])
    .map(r => ({ ...r, observacoes: null, created_at: "", updated_at: "" }))
}

export async function listarConvenioPacoteAvaliacaoCalculo(): Promise<ConvenioPacoteAvaliacao[]> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc("valores_calculo_pacote_avaliacao")
  if (error) throw new Error(error.message)
  return ((data ?? []) as { convenio_nome: string; terapia_id: number; valor_a_vista: number }[])
    .map(r => ({
      id: "", convenio_nome: r.convenio_nome, terapia_id: r.terapia_id, terapia_nome: "",
      valor_a_vista: r.valor_a_vista, valor_parcelado: null, observacoes: null, created_at: "", updated_at: "",
    }))
}
