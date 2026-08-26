"use client"

import { getSupabaseClient } from "@/lib/supabase/client"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type { AltaIndividualidade, AltaIndividualidadeForm, PacienteAlta, PacienteAltaForm } from "@/types/laudos"

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Busca os dados de individualidades de um paciente (0 ou 1 registro). */
export async function getAltaIndividualidade(
  pacienteId: number
): Promise<{ data: AltaIndividualidade | null; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("paciente_altas_individualidades")
    .select("*")
    .eq("paciente_id", pacienteId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: data as AltaIndividualidade | null, error: null }
}

/** Busca todas as altas de um paciente. */
export async function getAltasDoPaciente(
  pacienteId: number
): Promise<{ data: PacienteAlta[]; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("paciente_altas")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("data_alta", { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: data as PacienteAlta[], error: null }
}

// ─── UPSERT INDIVIDUALIDADE ───────────────────────────────────────────────────

/** Salva (cria ou atualiza) as individualidades de um paciente. */
export async function salvarAltaIndividualidade(
  pacienteId: number,
  pacienteNome: string,
  form: AltaIndividualidadeForm,
  registroAnterior: AltaIndividualidade | null
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const payload = {
    paciente_id: pacienteId,
    comp_agressivo: form.comp_agressivo,
    paciente_verbal: form.paciente_verbal,
    ambiente_natural: form.ambiente_natural,
    nivel_suporte: form.nivel_suporte,
  }

  const { data: salvo, error } = await supabase
    .from("paciente_altas_individualidades")
    .upsert(payload, { onConflict: "paciente_id" })
    .select("id")
    .single()

  if (error) return { error: error.message }

  const registroId = (salvo as { id: number }).id

  const acao = registroAnterior ? "editar" : "criar"
  const antes = registroAnterior
    ? {
        comp_agressivo: registroAnterior.comp_agressivo,
        paciente_verbal: registroAnterior.paciente_verbal,
        ambiente_natural: registroAnterior.ambiente_natural,
        nivel_suporte: registroAnterior.nivel_suporte,
      }
    : null

  void registrarAuditoria({
    tabela: "alta_individualidade",
    registroId,
    acao,
    pacienteId,
    pacienteNome,
    antes,
    depois: payload,
  })

  return { error: null }
}

// ─── CRUD ALTAS ───────────────────────────────────────────────────────────────

export async function criarAlta(
  pacienteId: number,
  pacienteNome: string,
  form: PacienteAltaForm
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const payload = {
    paciente_id: pacienteId,
    data_alta: form.data_alta,
    especialidade_alta: form.especialidade_alta,
    arquivo_alta_path: form.arquivo_alta_path,
  }

  const { data, error } = await supabase
    .from("paciente_altas")
    .insert([payload])
    .select("id")
    .single()

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "alta_individualidade",
    registroId: data.id,
    acao: "criar",
    pacienteId,
    pacienteNome,
    antes: null,
    depois: payload,
  })

  return { error: null }
}

export async function excluirAlta(
  pacienteId: number,
  pacienteNome: string,
  alta: PacienteAlta
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from("paciente_altas")
    .delete()
    .eq("id", alta.id)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "alta_individualidade",
    registroId: alta.id,
    acao: "excluir",
    pacienteId,
    pacienteNome,
    antes: { ...alta },
    depois: null,
  })

  return { error: null }
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

/** Faz upload do anexo da alta e retorna o path no Storage. */
export async function uploadArquivoAlta(
  pacienteId: number,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const ext = file.name.split(".").pop() ?? "pdf"
  const path = `altas/${pacienteId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from("laudos-pacientes")
    .upload(path, file, { upsert: false })

  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Gera URL assinada temporária para anexo da alta. */
export async function getUrlAssinadaAlta(path: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage
    .from("laudos-pacientes")
    .createSignedUrl(path, 900) // 15 minutos de validade
    
  if (error || !data?.signedUrl) {
    console.error("Erro ao gerar URL da alta:", error)
    return null
  }
  return data.signedUrl
}
