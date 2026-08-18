import { getSupabaseClient } from "@/lib/supabase/client"

// CRUD + trilha de auditoria da "Observações" por paciente na tela
// /cronograma/ocupacao-paciente. A tabela de auditoria (aumentar_ocupacao_paciente_auditoria)
// é compartilhada com o histórico de implantações na TiTa dessa mesma tela —
// ver migration 20260818180000_reestrutura_aumentar_ocupacao_paciente_auditoria.sql.
// Linhas de observação preenchem só paciente/texto/acao/usuario/email/data/hora
// e deixam terapia/profissional/dia_sessao/hora_sessao/status nulos.

const TABLE = "cronograma_paciente_observacoes"
const AUDITORIA_TABLE = "aumentar_ocupacao_paciente_auditoria"

export interface PacienteObservacao {
  id: string
  pac: string
  texto: string
  criado_por: string | null
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string
}

export type PacienteObservacaoAcao = "criar" | "editar" | "excluir"

/** DD/MM/YYYY e HH:MI:SS em horário de Brasília, mesmo formato da consulta original sobre acomp_pac_bundles. */
function dataHoraBrasilia(): { data: string; hora: string } {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const get = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ""
  return {
    data: `${get("day")}/${get("month")}/${get("year")}`,
    hora: `${get("hour")}:${get("minute")}:${get("second")}`,
  }
}

async function registrarAuditoriaObservacao(input: {
  pac: string
  acao: PacienteObservacaoAcao
  texto: string | null
}): Promise<void> {
  const sb = getSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  const usuarioNome = user?.id
    ? (await sb.from("usuarios").select("nome").eq("id", user.id).maybeSingle()).data?.nome ?? null
    : null
  const { data: hoje, hora } = dataHoraBrasilia()
  const { error } = await sb.from(AUDITORIA_TABLE).insert({
    paciente: input.pac,
    acao: input.acao,
    texto: input.texto,
    usuario: usuarioNome,
    email: user?.email ?? null,
    data: hoje,
    hora,
  })
  // Auditoria não pode derrubar a ação principal (salvar/excluir a observação) — só loga o erro.
  if (error) console.error("Erro registrarAuditoriaObservacao:", error)
}

export async function buscarObservacaoPaciente(pac: string): Promise<PacienteObservacao | null> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.from(TABLE).select("*").eq("pac", pac).maybeSingle()
  if (error) throw new Error(error.message)
  return data as PacienteObservacao | null
}

export async function salvarObservacaoPaciente(pac: string, texto: string): Promise<PacienteObservacao> {
  const sb = getSupabaseClient()
  const { data: { user } } = await sb.auth.getUser()
  const { data: antes } = await sb.from(TABLE).select("*").eq("pac", pac).maybeSingle()
  const textoLimpo = texto.trim()

  const { data, error } = await sb
    .from(TABLE)
    .upsert(
      {
        pac,
        texto: textoLimpo,
        atualizado_por: user?.id ?? null,
        ...(antes ? {} : { criado_por: user?.id ?? null }),
      },
      { onConflict: "pac" },
    )
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  const observacao = data as PacienteObservacao
  await registrarAuditoriaObservacao({
    pac,
    acao: antes ? "editar" : "criar",
    texto: textoLimpo,
  })
  return observacao
}

export async function excluirObservacaoPaciente(pac: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: antes } = await sb.from(TABLE).select("*").eq("pac", pac).maybeSingle()
  const { error } = await sb.from(TABLE).delete().eq("pac", pac)
  if (error) throw new Error(error.message)
  await registrarAuditoriaObservacao({
    pac,
    acao: "excluir",
    texto: (antes as PacienteObservacao | null)?.texto ?? null,
  })
}
