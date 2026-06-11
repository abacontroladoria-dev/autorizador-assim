/**
 * CCO Sync Job 2: ASSIM Authorizations Materialization
 *
 * Source: autorizacoes_assim (legacy table)
 * Destination: cco.session_authorizations
 * Pattern: UPSERT by (session_key, source='assim')
 *
 * Reads final authorization status from ASSIM and materializes into CCO.
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
 * Map ASSIM status to CCO authorization_status
 */
function mapASSIMStatus(status: string | null): string {
  if (!status) return "SEM_SOLICITACAO"
  const s = String(status).toUpperCase().trim()

  if (s.includes("LIBERADA")) return "LIBERADA"
  if (s.includes("GLOSA")) return "GLOSA"
  if (s.includes("CANCELADA")) return "CANCELADA"
  if (s.includes("PENDENTE")) return "PENDENTE"

  return "SEM_SOLICITACAO"
}

/**
 * Fetch ASSIM authorizations and materialize to cco.session_authorizations
 */
async function syncASSIMAuthorizations(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  console.log("[cco-sync-assim-authorizations] Fetching ASSIM data...")

  // Fetch all active ASSIM records with required fields
  const { data: assimRecords, error: fetchError } = await supabase
    .from("autorizacoes_assim")
    .select("*")
    .order("data_autorizacao", { ascending: false })

  if (fetchError) {
    throw new Error(`Failed to fetch autorizacoes_assim: ${fetchError.message}`)
  }

  if (!assimRecords || assimRecords.length === 0) {
    console.log("[cco-sync-assim-authorizations] No ASSIM records found")
    return 0
  }

  console.log(`[cco-sync-assim-authorizations] Found ${assimRecords.length} ASSIM records`)

  // Transform ASSIM records to CCO format
  const rows = []
  for (const record of assimRecords) {
    // Build session_key from ASSIM data
    // ASSIM has: paciente_nome, data_sessao, hora_sessao
    const pacienteNome = record.paciente_nome || ""
    const dataSessao = record.data_sessao || ""
    const horaInicio = record.hora_sessao || ""

    if (!pacienteNome || !dataSessao || !horaInicio) {
      console.warn(
        `[cco-sync-assim-authorizations] Skipping record ${record.guia}: missing required fields`,
      )
      continue
    }

    try {
      const session_key = await buildSessionKey(pacienteNome, dataSessao, horaInicio)

      const authorization_status = mapASSIMStatus(record.status)

      rows.push({
        session_key,
        source: "assim",
        guia: record.guia,
        status_assim: record.status,
        status_tratado: record.status_tratado,
        data_autorizacao: record.data_autorizacao,
        authorization_status,
        synced_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error(
        `[cco-sync-assim-authorizations] Failed to process record ${record.guia}:`,
        err,
      )
      continue
    }
  }

  if (rows.length === 0) {
    console.log("[cco-sync-assim-authorizations] No valid rows to upsert")
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
      `[cco-sync-assim-authorizations] Upserted batch ${i / 100 + 1}: ${count} rows`,
    )
  }

  return upsertedCount
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const logger = new JobLogger("cco-sync-assim-authorizations")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const count = await syncASSIMAuthorizations(supabase, logger)
    await logger.finishSuccess(supabase, count)

    return jsonResponse({
      ok: true,
      job: "cco-sync-assim-authorizations",
      rows_processed: count,
    }, 200, corsHeaders)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await logger.finishError(supabase, error)

    console.error("[cco-sync-assim-authorizations] Error:", error)
    return jsonResponse({ error: error.message }, 500, corsHeaders)
  }
})
