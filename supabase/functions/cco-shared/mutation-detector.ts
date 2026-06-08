/**
 * Session Mutation Detection
 * Detects when sessions are rescheduled (session_key changes)
 * and tracks the old → new mapping for authorization inheritance
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface SessionMutation {
  tita_agendamento_id: bigint
  session_key_old: string
  session_key_new: string
  mutation_type: "RESCHEDULED" | "DELETED" | "CONSOLIDATED"
}

/**
 * Detect if a session with same TITA ID has different session_key (mutation)
 */
export async function detectSessionMutations(
  supabase: SupabaseClient,
  newSessions: any[],
): Promise<SessionMutation[]> {
  console.log("[mutation-detector] Checking for session mutations...")

  const mutations: SessionMutation[] = []
  const titaIds = newSessions.map((s) => s.tita_agendamento_id).filter(Boolean)

  if (titaIds.length === 0) return mutations

  // Find existing sessions with same TITA ID
  const { data: existingSessions } = await supabase
    .from("cco.atendimentos")
    .select("tita_agendamento_id, session_key")
    .in("tita_agendamento_id", titaIds)

  if (!existingSessions) return mutations

  // Check for session_key changes (rescheduling)
  for (const newSess of newSessions) {
    const existing = existingSessions.find(
      (e) => e.tita_agendamento_id === newSess.tita_agendamento_id,
    )

    if (existing && existing.session_key !== newSess.session_key) {
      mutations.push({
        tita_agendamento_id: newSess.tita_agendamento_id,
        session_key_old: existing.session_key,
        session_key_new: newSess.session_key,
        mutation_type: "RESCHEDULED",
      })
    }
  }

  console.log(`[mutation-detector] Detected ${mutations.length} mutations`)
  return mutations
}

/**
 * Process detected mutations: mark orphaned, inherit authorizations
 */
export async function processMutations(
  supabase: SupabaseClient,
  mutations: SessionMutation[],
): Promise<number> {
  console.log(`[mutation-detector] Processing ${mutations.length} mutations...`)

  if (mutations.length === 0) return 0

  let processed = 0

  for (const mutation of mutations) {
    // Mark old session as orphaned
    await supabase
      .from("cco.atendimentos")
      .update({
        orphaned_at: new Date().toISOString(),
        orphaned_reason: `RESCHEDULED → ${mutation.session_key_new}`,
      })
      .eq("session_key", mutation.session_key_old)

    // Copy authorizations from old to new session
    const { data: oldAuths } = await supabase
      .from("cco.session_authorizations")
      .select("source, authorization_status")
      .eq("session_key", mutation.session_key_old)

    if (oldAuths && oldAuths.length > 0) {
      const newAuths = oldAuths.map((auth) => ({
        session_key: mutation.session_key_new,
        source: auth.source,
        authorization_status: auth.authorization_status,
        inherited_from: mutation.session_key_old,
        inherited_at: new Date().toISOString(),
      }))

      await supabase.from("cco.session_authorizations").upsert(newAuths, {
        onConflict: "session_key,source",
      })

      console.log(
        `[mutation-detector] Inherited ${newAuths.length} authorizations: ${mutation.session_key_old} → ${mutation.session_key_new}`,
      )
      processed++
    }
  }

  return processed
}
