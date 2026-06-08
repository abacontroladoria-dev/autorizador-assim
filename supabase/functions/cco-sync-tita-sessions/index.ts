/**
 * CCO Sync Job 1: TITA Sessions Materialization
 *
 * Source: API TITA (csv_grade_profissionais)
 * Destination: cco.atendimentos
 * Pattern: UPSERT by session_key
 *
 * Reads TITA schedule and materializes sessions into CCO for conciliation.
 * Idempotent: safe for reprocessing.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  JobLogger,
  normalizePatientName,
  normalizeTime,
  normalizeDate,
  buildSessionKey,
  computeSHA256,
} from "../cco-shared/logger.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN = Deno.env.get("TITA_TOKEN")!

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

interface TITASession {
  id?: number
  paciente_nome?: string
  data_sessao?: string
  hora_inicio?: string
  hora_fim?: string
  profissional_agendado?: string
  terapia?: string
  convenio?: string
  unidade?: string
  status_agendamento?: string
  justificativa?: string
  possui_tratativa?: boolean
  profissional_tratativa?: string
  data_tratativa?: string
}

/**
 * Parse CSV line respecting quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote: ""
        current += '"'
        i++ // skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes
      }
    } else if (char === "," && !insideQuotes) {
      // Field separator (outside quotes)
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  // Add final field
  result.push(current.trim())
  return result
}

/**
 * Parse TITA CSV response and normalize fields
 */
async function parseTITAResponse(
  csvText: string,
): Promise<TITASession[]> {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
  const sessions: TITASession[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const session: TITASession = {}

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]
      const value = values[j] ?? "" // Handle missing columns (fewer values than headers)

      if (header === "paciente_nome") session.paciente_nome = value || null
      if (header === "data_sessao") session.data_sessao = normalizeDate(value)
      if (header === "hora_inicio") session.hora_inicio = normalizeTime(value)
      if (header === "hora_fim") session.hora_fim = normalizeTime(value)
      if (header === "profissional_agendado") session.profissional_agendado = value || null
      if (header === "terapia") session.terapia = value || null
      if (header === "convenio") session.convenio = value || null
      if (header === "unidade") session.unidade = value || null
      if (header === "status_agendamento") session.status_agendamento = value || null
      if (header === "justificativa") session.justificativa = value || null
      if (header === "possui_tratativa") session.possui_tratativa = value?.toLowerCase() === "sim"
      if (header === "profissional_tratativa") session.profissional_tratativa = value || null
      if (header === "data_tratativa") session.data_tratativa = normalizeDate(value)
    }

    // Only add if has required fields
    if (session.paciente_nome && session.data_sessao && session.hora_inicio) {
      sessions.push(session)
    }
  }

  return sessions
}

/**
 * Fetch TITA CSV grade and materialize to cco.atendimentos
 */
async function syncTITASessions(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  console.log("[cco-sync-tita-sessions] Fetching TITA CSV...")

  // Get today's date and calculate date range for this month
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

  const dateFormat = (d: Date) => d.toISOString().split("T")[0]
  const dataInicio = dateFormat(startOfMonth)
  const dataFim = dateFormat(endOfMonth)

  console.log(`[cco-sync-tita-sessions] Fetching TITA data from ${dataInicio} to ${dataFim}`)

  const response = await fetch(
    "https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRACAO-TOKEN": TITA_TOKEN,
      },
      body: JSON.stringify({
        data_inicio: dataInicio,
        data_fim: dataFim,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`TITA API returned ${response.status}: ${await response.text()}`)
  }

  const csvText = await response.text()
  const sessions = await parseTITAResponse(csvText)

  console.log(`[cco-sync-tita-sessions] Parsed ${sessions.length} sessions from TITA`)

  // Prepare UPSERT rows
  const rows = []
  for (const session of sessions) {
    const session_key = await buildSessionKey(
      session.paciente_nome!,
      session.data_sessao!,
      session.hora_inicio!,
    )

    const sync_hash = await computeSHA256(
      `${session.profissional_agendado ?? ""}|${session.terapia ?? ""}|${session.convenio ?? ""}|${session.unidade ?? ""}|${session.status_agendamento ?? ""}`,
    )

    rows.push({
      session_key,
      paciente_nome: session.paciente_nome,
      data_sessao: session.data_sessao,
      hora_inicio: session.hora_inicio,
      hora_fim: session.hora_fim,
      profissional_agendado: session.profissional_agendado,
      terapia: session.terapia,
      convenio: session.convenio,
      unidade: session.unidade,
      status_agendamento: session.status_agendamento,
      justificativa: session.justificativa,
      possui_tratativa: session.possui_tratativa,
      profissional_tratativa: session.profissional_tratativa,
      data_tratativa: session.data_tratativa,
      sync_hash,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (rows.length === 0) {
    console.log("[cco-sync-tita-sessions] No rows to upsert")
    return 0
  }

  // Batch upsert (PostgreSQL handles duplicate key via UNIQUE constraint)
  let upsertedCount = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)

    // Use count() instead of .select("id") to avoid fetching unnecessary data
    const { count, error } = await supabase
      .from("cco.atendimentos")
      .upsert(batch, { onConflict: "session_key" })
      .select("count", { count: "planned" })

    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }

    upsertedCount += count || 0
    console.log(`[cco-sync-tita-sessions] Upserted batch ${i / 100 + 1}: ${count} rows`)
  }

  return upsertedCount
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405)

  const logger = new JobLogger("cco-sync-tita-sessions")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const count = await syncTITASessions(supabase, logger)
    await logger.finishSuccess(supabase, count)

    return jsonResponse({
      ok: true,
      job: "cco-sync-tita-sessions",
      rows_processed: count,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await logger.finishError(supabase, error)

    console.error("[cco-sync-tita-sessions] Error:", error)
    return jsonResponse({ error: error.message }, 500)
  }
})
