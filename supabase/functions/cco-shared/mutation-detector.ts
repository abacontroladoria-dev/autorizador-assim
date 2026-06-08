/**
 * CCO Shared Utilities — Session Mutation Detection & Consolidation
 *
 * Detecta quando uma sessão é remarcada/deletada em TITA (session_key muda)
 * Consolida histórico de autorizações da sessão antiga para a nova
 * Marca sessão antiga como órfã (soft delete)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface SessionMutationRecord {
  tita_agendamento_id: bigint
  session_key_old: string
  session_key_new: string
  mutation_type: "RESCHEDULED" | "DELETED"
  data_sessao_old: string
  data_sessao_new: string
  hora_inicio_old: string
  hora_inicio_new: string
  paciente_nome: string
}

/**
 * Detecta mutações comparando session_keys antigos com novos
 * Lê cco.atendimentos dos últimos 30 dias e identifica IDs TITA
 * que mudaram de data/hora
 */
export async function detectSessionMutations(
  supabase: SupabaseClient,
  newSessions: Array<{
    tita_agendamento_id: bigint
    session_key: string
    data_sessao: string
    hora_inicio: string
    paciente_nome: string
  }>,
): Promise<SessionMutationRecord[]> {
  // Buscar sessões antigas (últimos 30 dias) com tita_agendamento_id
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const dateThreshold = thirtyDaysAgo.toISOString().split("T")[0]

  const { data: oldSessions, error: fetchError } = await supabase
    .from("cco.atendimentos")
    .select("tita_agendamento_id, session_key, data_sessao, hora_inicio, paciente_nome")
    .gte("data_sessao", dateThreshold)
    .not("tita_agendamento_id", "is", null)

  if (fetchError) {
    throw new Error(`Failed to fetch old sessions: ${fetchError.message}`)
  }

  if (!oldSessions || oldSessions.length === 0) {
    return []
  }

  // Build map: tita_agendamento_id → old session_key
  const oldMap = new Map(
    oldSessions.map((s) => [s.tita_agendamento_id, s]),
  )

  const mutations: SessionMutationRecord[] = []

  // Identify mutated sessions (same TITA ID, different date/time)
  for (const newSession of newSessions) {
    const old = oldMap.get(newSession.tita_agendamento_id)

    if (!old) continue // Nova sessão, não é mutação

    const dateChanged = old.data_sessao !== newSession.data_sessao
    const timeChanged = old.hora_inicio !== newSession.hora_inicio

    if (dateChanged || timeChanged) {
      mutations.push({
        tita_agendamento_id: newSession.tita_agendamento_id,
        session_key_old: old.session_key,
        session_key_new: newSession.session_key,
        mutation_type: "RESCHEDULED",
        data_sessao_old: old.data_sessao,
        data_sessao_new: newSession.data_sessao,
        hora_inicio_old: old.hora_inicio,
        hora_inicio_new: newSession.hora_inicio,
        paciente_nome: newSession.paciente_nome,
      })
    }
  }

  return mutations
}

/**
 * Consolida histórico de autorizações de session_key_old → session_key_new
 * Se não houver autorizações na nova, copia as da antiga (com marked as inherited)
 * Marca a sessão antiga como órfã
 */
export async function consolidateSessionHistory(
  supabase: SupabaseClient,
  mutation: SessionMutationRecord,
): Promise<void> {
  const { session_key_old, session_key_new } = mutation

  // 1. Buscar autorizações da sessão antiga
  const { data: oldAuths, error: oldAuthsError } = await supabase
    .from("cco.session_authorizations")
    .select("*")
    .eq("session_key", session_key_old)

  if (oldAuthsError) {
    throw new Error(
      `Failed to fetch old authorizations: ${oldAuthsError.message}`,
    )
  }

  // 2. Buscar autorizações da sessão nova
  const { data: newAuths, error: newAuthsError } = await supabase
    .from("cco.session_authorizations")
    .select("*")
    .eq("session_key", session_key_new)

  if (newAuthsError) {
    throw new Error(
      `Failed to fetch new authorizations: ${newAuthsError.message}`,
    )
  }

  // 3. Se não houver autorizações novas, copiar das antigas
  if ((!newAuths || newAuths.length === 0) && oldAuths && oldAuths.length > 0) {
    const now = new Date().toISOString()

    for (const auth of oldAuths) {
      await supabase
        .from("cco.session_authorizations")
        .upsert(
          {
            ...auth,
            session_key: session_key_new,
            synced_at: now,
            inherited_from: session_key_old,
          },
          { onConflict: "session_key,source" },
        )
    }
  }

  // 4. Marcar sessão antiga como órfã
  const { error: orphanError } = await supabase
    .from("cco.atendimentos")
    .update({
      orphaned_at: new Date().toISOString(),
      orphan_reason: `RESCHEDULED → ${session_key_new}`,
    })
    .eq("session_key", session_key_old)

  if (orphanError) {
    throw new Error(`Failed to mark orphan: ${orphanError.message}`)
  }

  // 5. Registrar mutação em cco.session_mutations
  const { error: mutationError } = await supabase
    .from("cco.session_mutations")
    .insert({
      tita_agendamento_id: mutation.tita_agendamento_id,
      session_key_old,
      session_key_new,
      mutation_type: mutation.mutation_type,
      data_sessao_old: mutation.data_sessao_old,
      data_sessao_new: mutation.data_sessao_new,
      hora_inicio_old: mutation.hora_inicio_old,
      hora_inicio_new: mutation.hora_inicio_new,
      paciente_nome: mutation.paciente_nome,
      detected_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      consolidation_note: "Autorizations consolidated from old session",
    })

  if (mutationError) {
    throw new Error(`Failed to record mutation: ${mutationError.message}`)
  }
}

/**
 * Processa todas as mutações detectadas
 * Consolida histórico e marca órfãos
 */
export async function processMutations(
  supabase: SupabaseClient,
  mutations: SessionMutationRecord[],
): Promise<number> {
  let processed = 0

  for (const mutation of mutations) {
    try {
      await consolidateSessionHistory(supabase, mutation)
      processed++
      console.log(
        `[mutation-detector] Consolidated mutation: ${mutation.session_key_old} → ${mutation.session_key_new}`,
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error(
        `[mutation-detector] Failed to consolidate ${mutation.session_key_old}: ${error.message}`,
      )
      // Continue processing other mutations even if one fails
    }
  }

  return processed
}
