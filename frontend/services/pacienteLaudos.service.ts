"use client"

import { getSupabaseClient } from "@/lib/supabase/client"
import { registrarAuditoria } from "@/services/cadastrosAuditoria.service"
import type {
  PacienteLaudo,
  LaudoEspecialidade,
  LaudoForm,
  LaudoEspecialidadeForm,
} from "@/types/laudos"

// Tabelas cadastros_pacientes_laudos / _laudo_especialidades.
// Ver supabase/migrations/20260826140000 e o rename em 20260826140400.

const TB_LAUDOS = "cadastros_pacientes_laudos"
const TB_ESPECIALIDADES = "cadastros_pacientes_laudo_especialidades"

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Constrói o payload INSERT/UPDATE do laudo a partir do formulário. */
function formParaPayload(pacienteId: number, form: LaudoForm) {
  return {
    id_paciente_pulsar: pacienteId,
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
    id_laudo: laudoId,
    especialidade: e.especialidade,
    qt_laudo: e.qt_laudo ? Number(e.qt_laudo) : null,
    qt_autorizacao: e.qt_autorizacao ? Number(e.qt_autorizacao) : null,
  }
}

async function desmarcarOutrosLaudos(pacienteId: number, laudoId: number, pacienteNome: string) {
  const supabase = getSupabaseClient()
  const { data: outros } = await supabase
    .from(TB_LAUDOS)
    .select("id_laudo")
    .eq("id_paciente_pulsar", pacienteId)
    .eq("em_uso", true)
    .neq("id_laudo", laudoId)

  if (outros && outros.length > 0) {
    for (const outro of outros) {
      await supabase.from(TB_LAUDOS).update({ em_uso: false }).eq("id_laudo", outro.id_laudo)
      void registrarAuditoria({
        tabela: "laudo",
        registroId: outro.id_laudo,
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
    .from(TB_LAUDOS)
    .select("*")
    // Laudo "excluído" continua no banco (soft-delete, 20260827100000) e
    // CONTINUA na lista — só marcado. A tela é quem decide como mostrar
    // (badge "Excluído"), não a query.
    .eq("id_paciente_pulsar", pacienteId)
    .order("data_laudo", { ascending: false })

  if (error) return { data: [], error: error.message }

  // Busca especialidades de todos os laudos de uma vez
  const laudoIds = (laudos ?? []).map((l) => l.id_laudo as number)
  let especialidades: LaudoEspecialidade[] = []

  if (laudoIds.length > 0) {
    const { data: esps } = await supabase
      .from(TB_ESPECIALIDADES)
      .select("*")
      .in("id_laudo", laudoIds)
      .order("id_laudo_especialidade", { ascending: true })
    especialidades = (esps ?? []) as LaudoEspecialidade[]
  }

  const espPorLaudo = new Map<number, LaudoEspecialidade[]>()
  for (const e of especialidades) {
    const arr = espPorLaudo.get(e.id_laudo) ?? []
    arr.push(e)
    espPorLaudo.set(e.id_laudo, arr)
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
      especialidades: espPorLaudo.get(l.id_laudo as number) ?? [],
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
    .from(TB_LAUDOS)
    .insert(formParaPayload(pacienteId, form))
    .select("id_laudo")
    .single()

  if (error) return { id: null, error: error.message }

  const laudoId = (novo as { id_laudo: number }).id_laudo

  // Insere especialidades
  if (form.especialidades.length > 0) {
    const esps = form.especialidades
      .filter((e) => e.especialidade.trim())
      .map((e) => espFormaParaPayload(laudoId, e))

    if (esps.length > 0) {
      const { error: errEsp } = await supabase.from(TB_ESPECIALIDADES).insert(esps)
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

  const payload = formParaPayload(laudo.id_paciente_pulsar, form)

  const { error } = await supabase
    .from(TB_LAUDOS)
    .update(payload)
    .eq("id_laudo", laudo.id_laudo)

  if (error) return { error: error.message }

  // Recria especialidades: exclui as antigas e insere as novas
  await supabase.from(TB_ESPECIALIDADES).delete().eq("id_laudo", laudo.id_laudo)

  const esps = form.especialidades
    .filter((e) => e.especialidade.trim())
    .map((e) => espFormaParaPayload(laudo.id_laudo, e))

  if (esps.length > 0) {
    const { error: errEsp } = await supabase.from(TB_ESPECIALIDADES).insert(esps)
    if (errEsp) console.error("Erro ao atualizar especialidades do laudo:", errEsp)
  }

  if (form.em_uso) {
    await desmarcarOutrosLaudos(laudo.id_paciente_pulsar, laudo.id_laudo, pacienteNome)
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
    registroId: laudo.id_laudo,
    acao: "editar",
    pacienteId: laudo.id_paciente_pulsar,
    pacienteNome,
    antes,
    depois: payload,
  })

  return { error: null }
}

// ─── EXCLUSÃO (soft-delete) ───────────────────────────────────────────────────

/**
 * "Exclui" o laudo marcando ativo = false. A linha NUNCA é apagada.
 *
 * Laudo é registro clínico: decisão do usuário em 2026-08-27 de que nada de
 * laudo/alta sai do banco. O privilégio de DELETE está revogado no próprio
 * banco (20260827100000), então nem uma chamada direta à API consegue apagar —
 * isto aqui não é a única barreira, é a interface para ela.
 *
 * Um laudo "excluído" que estava em_uso deixa de estar: senão o paciente fica
 * com um laudo de referência que não aparece em lugar nenhum da tela.
 */
export async function excluirLaudo(
  laudo: PacienteLaudo,
  pacienteNome: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from(TB_LAUDOS)
    .update({ ativo: false, em_uso: false })
    .eq("id_laudo", laudo.id_laudo)

  if (error) return { error: error.message }

  void registrarAuditoria({
    tabela: "laudo",
    registroId: laudo.id_laudo,
    acao: "excluir",
    pacienteId: laudo.id_paciente_pulsar,
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

/** Gera URL assinada temporária para arquivo de laudo. */
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
