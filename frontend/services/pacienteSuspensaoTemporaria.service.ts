"use client"

import { getSupabaseClient } from "@/lib/supabase/client"
import { getUsuarioAtual } from "@/lib/supabase/usuarioAtual"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type { PacienteSuspensaoTemporaria, PacienteSuspensaoTemporariaForm } from "@/types/laudos"

// Tabela cadastros_pacientes_suspensoes_temporarias (1:N — uma suspensão por
// especialidade). Ver supabase/migrations/20260902100000.
//
// Espelha pacienteAltaIndividualidade.service.ts (criarAlta/excluirAlta):
// mesmo padrão de soft delete e mesmo formato de trilha de auditoria. Fica em
// arquivo próprio porque o service de alta já documenta que cuida de exatamente
// duas tabelas com sequências de id e entidades de auditoria próprias — uma
// terceira ali quebraria esse contrato.

const TB_SUSPENSOES = "cadastros_pacientes_suspensoes_temporarias"

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Busca todas as suspensões temporárias de um paciente. */
export async function getSuspensoesDoPaciente(
  pacienteId: number
): Promise<{ data: PacienteSuspensaoTemporaria[]; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from(TB_SUSPENSOES)
    .select("*")
    // Suspensão "excluída" continua no banco (soft-delete) e CONTINUA na
    // lista — só marcada. A tela decide como mostrar, não a query.
    .eq("id_paciente_pulsar", pacienteId)
    .order("data_suspensao", { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: data as PacienteSuspensaoTemporaria[], error: null }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function criarSuspensao(
  pacienteId: number,
  pacienteNome: string,
  form: PacienteSuspensaoTemporariaForm
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()
  const usuario = await getUsuarioAtual()

  const payload = {
    id_paciente_pulsar: pacienteId,
    data_suspensao: form.data_suspensao,
    especialidade_suspensao: form.especialidade_suspensao,
    prazo_indefinido: form.prazo_indefinido,
    prazo_fim: form.prazo_indefinido ? null : form.prazo_fim,
    arquivo_suspensao_path: form.arquivo_suspensao_path,
    observacoes: form.observacoes,
    criado_por_usuario_id: usuario.id,
    criado_por_usuario_nome: usuario.nome,
  }

  const { data, error } = await supabase
    .from(TB_SUSPENSOES)
    .insert([payload])
    .select("id_suspensao")
    .single()

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "suspensao_temporaria",
    registroId: data.id_suspensao,
    acao: "criar",
    pacienteId,
    pacienteNome,
    antes: null,
    depois: payload,
  })

  return { error: null }
}

/**
 * "Exclui" a suspensão marcando ativo = false. A linha NUNCA é apagada — mesma
 * regra da alta (registro clínico), DELETE revogado no banco (20260902100100).
 */
export async function excluirSuspensao(
  pacienteId: number,
  pacienteNome: string,
  suspensao: PacienteSuspensaoTemporaria
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from(TB_SUSPENSOES)
    .update({ ativo: false })
    .eq("id_suspensao", suspensao.id_suspensao)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "suspensao_temporaria",
    registroId: suspensao.id_suspensao,
    acao: "excluir",
    pacienteId,
    pacienteNome,
    antes: { ...suspensao },
    depois: null,
  })

  return { error: null }
}

/**
 * Reverte a exclusão marcando ativo = true de novo. Não valida se já existe
 * outra suspensão ativa e vigente na mesma especialidade — mesma folga que já
 * existe hoje entre suspensões ativas (o combobox de "nova suspensão" filtra
 * pelo front, o banco não impede duas linhas ativas na mesma especialidade).
 */
export async function reativarSuspensao(
  pacienteId: number,
  pacienteNome: string,
  suspensao: PacienteSuspensaoTemporaria
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from(TB_SUSPENSOES)
    .update({ ativo: true })
    .eq("id_suspensao", suspensao.id_suspensao)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "suspensao_temporaria",
    registroId: suspensao.id_suspensao,
    acao: "reativar",
    pacienteId,
    pacienteNome,
    antes: { ...suspensao },
    depois: { ...suspensao, ativo: true },
  })

  return { error: null }
}

/**
 * Estende o prazo de uma suspensão com "prazo alcançado" (ativa, prazo definido
 * já vencido). Grava como `acao: "editar"` na trilha — antes/depois preservam o
 * prazo antigo e o novo, para "Histórico" mostrar a extensão em vez de só o
 * valor final (sobrescrever silenciosamente perderia o prazo 1).
 */
export async function estenderPrazoSuspensao(
  pacienteId: number,
  pacienteNome: string,
  suspensao: PacienteSuspensaoTemporaria,
  novoPrazoIndefinido: boolean,
  novoPrazoFim: string | null
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const payload = {
    prazo_indefinido: novoPrazoIndefinido,
    prazo_fim: novoPrazoIndefinido ? null : novoPrazoFim,
  }

  const { error } = await supabase
    .from(TB_SUSPENSOES)
    .update(payload)
    .eq("id_suspensao", suspensao.id_suspensao)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "suspensao_temporaria",
    registroId: suspensao.id_suspensao,
    acao: "editar",
    pacienteId,
    pacienteNome,
    antes: { prazo_indefinido: suspensao.prazo_indefinido, prazo_fim: suspensao.prazo_fim },
    depois: payload,
  })

  return { error: null }
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

/** Faz upload do anexo da suspensão e retorna o path no Storage. */
export async function uploadArquivoSuspensao(
  pacienteId: number,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const ext = file.name.split(".").pop() ?? "pdf"
  const path = `suspensoes/${pacienteId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from("laudos-pacientes")
    .upload(path, file, { upsert: false })

  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Gera URL assinada temporária para anexo da suspensão. */
export async function getUrlAssinadaSuspensao(path: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage
    .from("laudos-pacientes")
    .createSignedUrl(path, 900) // 15 minutos de validade

  if (error || !data?.signedUrl) {
    console.error("Erro ao gerar URL da suspensão:", error)
    return null
  }
  return data.signedUrl
}
