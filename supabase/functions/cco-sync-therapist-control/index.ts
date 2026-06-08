/**
 * CCO Sync Job 4: Therapist Control Materialization
 *
 * Source: controle_terapeutico (legacy table)
 * Destination: cco.session_substitutions
 * Pattern: UPSERT by session_key
 *
 * Reads therapist absences and substitutions from operational control.
 * Source of truth for FALTA_TERAPEUTA and SUBSTITUICAO occurrences.
 * Idempotent: safe for reprocessing.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  JobLogger,
  buildSessionKey,
} from "../cco-shared/logger.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

/**
 * Fetch controle_terapeutico records and materialize to cco.session_substitutions
 */
async function syncTherapistControl(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  console.log("[cco-sync-therapist-control] Fetching controle_terapeutico...")

  // Fetch all records from controle_terapeutico
  // This table tracks absences (falta) and substitutions (substituto confirmed)
  const { data: ctRecords, error: fetchError } = await supabase
    .from("controle_terapeutico")
    .select("*")
    .order("created_at", { ascending: false })

  if (fetchError) {
    throw new Error(`Failed to fetch controle_terapeutico: ${fetchError.message}`)
  }

  if (!ctRecords || ctRecords.length === 0) {
    console.log("[cco-sync-therapist-control] No controle_terapeutico records found")
    return 0
  }

  console.log(
    `[cco-sync-therapist-control] Found ${ctRecords.length} controle_terapeutico records`,
  )

  // Transform controle_terapeutico records to CCO format
  // Fetch corresponding sessions from cco.atendimentos to get session_key
  const { data: sessions } = await supabase
    .schema("cco")
    .from("atendimentos")
    .select("session_key, tita_agendamento_id")

  const sessionKeyMap = new Map(
    (sessions || []).map(s => [s.tita_agendamento_id, s.session_key])
  )

  const rows = []
  for (const record of ctRecords) {
    // Skip records without tita_agendamento_id
    if (!record.tita_agendamento_id) {
      continue
    }

    // Get session_key from materialized sessions
    const session_key = sessionKeyMap.get(record.tita_agendamento_id)
    if (!session_key) {
      console.warn(
        `[cco-sync-therapist-control] No matching session found for tita_agendamento_id ${record.tita_agendamento_id}`,
      )
      continue
    }

    // Only process records with falta (absence) or substituto status
    const status = String(record.status || "").toLowerCase().trim()
    if (!status.includes("falta") && !status.includes("substituto")) {
      continue
    }

    try {
      rows.push({
        session_key,
        tita_agendamento_id: record.tita_agendamento_id,
        status_ct: record.status || "presente",
        profissional_substituto_id: record.profissional_substituto_id,
        confirmado_em: record.confirmado_em,
        synced_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error(
        `[cco-sync-therapist-control] Failed to process record ${record.id}:`,
        err,
      )
      continue
    }
  }

  if (rows.length === 0) {
    console.log("[cco-sync-therapist-control] No valid rows to upsert")
    return 0
  }

  // Batch upsert by session_key
  let upsertedCount = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)

    // Use count() instead of .select("id") to avoid fetching unnecessary data
    const { count, error } = await supabase
      .schema("cco")
      .from("session_substitutions")
      .upsert(batch, { onConflict: "session_key" })
      .select("count", { count: "planned" })

    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }

    upsertedCount += count || 0
    console.log(
      `[cco-sync-therapist-control] Upserted batch ${i / 100 + 1}: ${count} rows`,
    )
  }

  return upsertedCount
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  const logger = new JobLogger("cco-sync-therapist-control")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const count = await syncTherapistControl(supabase, logger)
    await logger.finishSuccess(supabase, count)

    return jsonResponse({
      ok: true,
      job: "cco-sync-therapist-control",
      rows_processed: count,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await logger.finishError(supabase, error)

    console.error("[cco-sync-therapist-control] Error:", error)
    return jsonResponse({ error: error.message }, 500)
  }
})
