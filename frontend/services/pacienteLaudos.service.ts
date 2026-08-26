"use client"

import { getSupabaseClient } from "@/lib/supabase/client"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type {
  PacienteLaudo,
  LaudoEspecialidade,
  LaudoForm,
  LaudoEspecialidadeForm,
} from "@/types/laudos"

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Constrói o payload INSERT/UPDATE para paciente_laudos a partir do formulário. */
function formParaPayload(pacienteId: number, form: LaudoForm) {
  return {
    paciente_id: pacienteId,
    data_laudo: form.data_laudo,
    validade: form.validade || null,
    autorizado_em: form.autorizado_em || null,
    comp_agressivo: null,
    paciente_verbal: null,
    ambiente_natural: null,
    nivel_suporte: null,
    alta: false,
    data_alta: null,
    especialidade_alta: null,
    arquivo_path: form.arquivo_path,
    observacoes: form.observacoes || null,
    em_uso: form.em_uso ?? false,
  }
}

function espFormaParaPayload(laudoId: number, e: LaudoEspecialidadeForm) {
  return {
    laudo_id: laudoId,
    especialidade: e.especialidade,
    qt_laudo: e.qt_laudo ? Number(e.qt_laudo) : null,
    qt_autorizacao: e.qt_autorizacao ? Number(e.qt_autorizacao) : null,
  }
}

async function desmarcarOutrosLaudos(pacienteId: number, laudoId: number, pacienteNome: string) {
  const supabase = getSupabaseClient()
  const { data: outros } = await supabase
    .from("paciente_laudos")
    .select("id")
    .eq("paciente_id", pacienteId)
    .eq("em_uso", true)
    .neq("id", laudoId)

  if (outros && outros.length > 0) {
    for (const outro of outros) {
      await supabase.from("paciente_laudos").update({ em_uso: false }).eq("id", outro.id)
      void registrarAuditoria({
        tabela: "laudo",
        registroId: outro.id,
        acao: "editar",
        pacienteId,
        pacienteNome,
        antes: { em_uso: true },
        depois: { em_uso: false },
      })
    }
  }
}

// ─── READ ─────────────────────────────────────────────────────────────────────

/** Busca todos os laudos de um paciente com suas especialidades. */
export async function getLaudosDoPaciente(
  pacienteId: number
): Promise<{ data: PacienteLaudo[]; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data: laudos, error } = await supabase
    .from("paciente_laudos")
    .select("*")
    .eq("paciente_id", pacienteId)
    .order("data_laudo", { ascending: false })

  if (error) return { data: [], error: error.message }

  // Busca especialidades de todos os laudos de uma vez
  const laudoIds = (laudos ?? []).map((l) => l.id as number)
  let especialidades: LaudoEspecialidade[] = []

  if (laudoIds.length > 0) {
    const { data: esps } = await supabase
      .from("paciente_laudo_especialidades")
      .select("*")
      .in("laudo_id", laudoIds)
      .order("id", { ascending: true })
    especialidades = (esps ?? []) as LaudoEspecialidade[]
  }

  const espPorLaudo = new Map<number, LaudoEspecialidade[]>()
  for (const e of especialidades) {
    const arr = espPorLaudo.get(e.laudo_id) ?? []
    arr.push(e)
    espPorLaudo.set(e.laudo_id, arr)
  }

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const resultado: PacienteLaudo[] = (laudos ?? []).map((l) => {
    // Calcula a situação localmente (Vigente / Vencido)
    const dataBase = l.validade
      ? new Date(l.validade + "T12:00:00")
      : new Date(l.data_laudo + "T12:00:00")
    
    if (!l.validade) {
      dataBase.setMonth(dataBase.getMonth() + 6)
    }
    dataBase.setHours(0, 0, 0, 0)

    const situacao: PacienteLaudo["situacao"] = dataBase >= hoje ? "Vigente" : "Vencido"

    return {
      ...(l as Omit<PacienteLaudo, "especialidades" | "situacao">),
      situacao,
      especialidades: espPorLaudo.get(l.id as number) ?? [],
    }
  })

  return { data: resultado, error: null }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function criarLaudo(
  pacienteId: number,
  pacienteNome: string,
  form: LaudoForm
): Promise<{ id: number | null; error: string | null }> {
  const supabase = getSupabaseClient()

  const { data: novo, error } = await supabase
    .from("paciente_laudos")
    .insert(formParaPayload(pacienteId, form))
    .select("id")
    .single()

  if (error) return { id: null, error: error.message }

  const laudoId = (novo as { id: number }).id

  // Insere especialidades
  if (form.especialidades.length > 0) {
    const esps = form.especialidades
      .filter((e) => e.especialidade.trim())
      .map((e) => espFormaParaPayload(laudoId, e))

    if (esps.length > 0) {
      const { error: errEsp } = await supabase
        .from("paciente_laudo_especialidades")
        .insert(esps)
      if (errEsp) console.error("Erro ao inserir especialidades do laudo:", errEsp)
    }
  }

  if (form.em_uso) {
    await desmarcarOutrosLaudos(pacienteId, laudoId, pacienteNome)
  }

  void registrarAuditoria({
    tabela: "laudo",
    registroId: laudoId,
    acao: "criar",
    pacienteId,
    pacienteNome,
    depois: { ...formParaPayload(pacienteId, form), especialidades: form.especialidades },
  })

  return { id: laudoId, error: null }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function editarLaudo(
  laudo: PacienteLaudo,
  pacienteNome: string,
  form: LaudoForm
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const payload = formParaPayload(laudo.paciente_id, form)

  const { error } = await supabase
    .from("paciente_laudos")
    .update(payload)
    .eq("id", laudo.id)

  if (error) return { error: error.message }

  // Recria especialidades: exclui as antigas e insere as novas
  await supabase
    .from("paciente_laudo_especialidades")
    .delete()
    .eq("laudo_id", laudo.id)

  const esps = form.especialidades
    .filter((e) => e.especialidade.trim())
    .map((e) => espFormaParaPayload(laudo.id, e))

  if (esps.length > 0) {
    const { error: errEsp } = await supabase
      .from("paciente_laudo_especialidades")
      .insert(esps)
    if (errEsp) console.error("Erro ao atualizar especialidades do laudo:", errEsp)
  }

  if (form.em_uso) {
    await desmarcarOutrosLaudos(laudo.paciente_id, laudo.id, pacienteNome)
  }

  // Captura snapshot "antes" sem especialidades para o diff do histórico
  const antes: Record<string, unknown> = {
    data_laudo: laudo.data_laudo,
    validade: laudo.validade,
    autorizado_em: laudo.autorizado_em,
    arquivo_path: laudo.arquivo_path,
    observacoes: laudo.observacoes,
    em_uso: laudo.em_uso,
  }

  void registrarAuditoria({
    tabela: "laudo",
    registroId: laudo.id,
    acao: "editar",
    pacienteId: laudo.paciente_id,
    pacienteNome,
    antes,
    depois: payload,
  })

  return { error: null }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function excluirLaudo(
  laudo: PacienteLaudo,
  pacienteNome: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from("paciente_laudos")
    .delete()
    .eq("id", laudo.id)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "laudo",
    registroId: laudo.id,
    acao: "excluir",
    pacienteId: laudo.paciente_id,
    pacienteNome,
    antes: {
      data_laudo: laudo.data_laudo,
      validade: laudo.validade,
      arquivo_path: laudo.arquivo_path,
    },
  })

  return { error: null }
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

/** Faz upload de um arquivo de laudo para o Storage e retorna o path. */
export async function uploadArquivoLaudo(
  pacienteId: number,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseClient()
  const ext = file.name.split(".").pop() ?? "pdf"
  const path = `${pacienteId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from("laudos-pacientes")
    .upload(path, file, { upsert: false })

  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Gera URL assinada temporária (1h) para arquivo de laudo. */
export async function getUrlAssinadaLaudo(path: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage
    .from("laudos-pacientes")
    .createSignedUrl(path, 900) // 15 minutos de validade
  
  if (error || !data?.signedUrl) {
    console.error("Erro ao gerar URL do laudo:", error)
    return null
  }
  return data.signedUrl
}
