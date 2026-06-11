/**
 * CCO Sync Job 3: Authorization Queue Materialization
 *
 * Source: fila_autorizacoes (legacy table)
 * Destination: cco.session_authorizations
 * Pattern: UPSERT by (session_key, source='fila')
 *
 * Reads authorization requests from queue and materializes into CCO.
 * Tracks pending, processing, and completed requests.
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

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

function getCorsHeaders(requestOrigin: string) {
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin)
  return isAllowed
    ? {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

/**
 * Map fila_autorizacoes status to CCO authorization_status
 */
function mapFilaStatus(status: string | null): string {
  if (!status) return "SEM_SOLICITACAO"
  const s = String(status).toUpperCase().trim()

  if (s.includes("PENDENTE") || s.includes("PROCESSANDO")) return "PENDENTE"
  if (s.includes("CONCLUIDO") || s.includes("CONCLUÍDA")) return "LIBERADA"
  if (s.includes("CANCELADA")) return "CANCELADA"
  if (s.includes("REJEITADA") || s.includes("REJEIÇÃO")) return "GLOSA"

  return "PENDENTE" // default to pending if status unknown
}

/**
 * Fetch fila_autorizacoes queue and materialize to cco.session_authorizations
 */
async function syncAuthorizationQueue(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  console.log("[cco-sync-authorization-queue] Fetching fila_autorizacoes...")

  // Fetch all records from queue (active and inactive)
  const { data: filaRecords, error: fetchError } = await supabase
    .from("fila_autorizacoes")
    .select("*")
    .order("created_at", { ascending: false })

  if (fetchError) {
    throw new Error(`Failed to fetch fila_autorizacoes: ${fetchError.message}`)
  }

  if (!filaRecords || filaRecords.length === 0) {
    console.log("[cco-sync-authorization-queue] No fila records found")
    return 0
  }

  console.log(`[cco-sync-authorization-queue] Found ${filaRecords.length} fila records`)

  // Transform fila records to CCO format
  const rows = []
  for (const record of filaRecords) {
    // Build session_key from fila data
    const pacienteNome = record.paciente_nome || ""
    const dataSessao = record.data_sessao || ""
    const horaInicio = record.hora_sessao || ""

    if (!pacienteNome || !dataSessao || !horaInicio) {
      console.warn(
        `[cco-sync-authorization-queue] Skipping record ${record.id}: missing required fields`,
      )
      continue
    }

    try {
      const session_key = await buildSessionKey(pacienteNome, dataSessao, horaInicio)

      const authorization_status = mapFilaStatus(record.status)

      rows.push({
        session_key,
        source: "fila",
        fila_id: record.id,
        status_fila: record.status,
        forma_autorizacao: record.forma_autorizacao,
        numero_autorizacao: record.numero_autorizacao,
        authorization_status,
        synced_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error(
        `[cco-sync-authorization-queue] Failed to process record ${record.id}:`,
        err,
      )
      continue
    }
  }

  if (rows.length === 0) {
    console.log("[cco-sync-authorization-queue] No valid rows to upsert")
    return 0
  }

  // Batch upsert by (session_key, source)
  let upsertedCount = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)

    // Use count() instead of .select("id") to avoid fetching unnecessary data
    const { count, error } = await supabase
      .schema("cco")
      .from("session_authorizations")
      .upsert(batch, { onConflict: "session_key,source" })
      .select("count", { count: "planned" })

    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }

    upsertedCount += count || 0
    console.log(
      `[cco-sync-authorization-queue] Upserted batch ${i / 100 + 1}: ${count} rows`,
    )
  }

  return upsertedCount
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const logger = new JobLogger("cco-sync-authorization-queue")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const count = await syncAuthorizationQueue(supabase, logger)
    await logger.finishSuccess(supabase, count)

    return jsonResponse({
      ok: true,
      job: "cco-sync-authorization-queue",
      rows_processed: count,
    }, 200, corsHeaders)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await logger.finishError(supabase, error)

    console.error("[cco-sync-authorization-queue] Error:", error)
    return jsonResponse({ error: error.message }, 500, corsHeaders)
  }
})
