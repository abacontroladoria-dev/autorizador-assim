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
  // Mutation detection will be implemented in Fase 4
  return []
}

/**
 * Process detected mutations: mark orphaned, inherit authorizations
 */
export async function processMutations(
  supabase: SupabaseClient,
  mutations: SessionMutation[],
): Promise<number> {
  console.log(`[mutation-detector] Processing ${mutations.length} mutations...`)
  // Mutation processing will be implemented in Fase 4
  return 0
}
