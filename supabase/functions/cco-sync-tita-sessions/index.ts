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
import {
  detectSessionMutations,
  processMutations,
} from "../cco-shared/mutation-detector.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN = Deno.env.get("TITA_TOKEN")!

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

interface TITASession {
  id?: number
  tita_agendamento_id?: number
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
  id_profissional_tratativa?: number
  origem_tratativa?: string
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
 * Maps fields from csv_grade_profissionais API to TITASession
 *
 * API returns: id, nome_profissional, cpf, status_agendamento, terapia, sala, data, dia, hora
 * Plus (v2.11.0): id_favorecido, nome_favorecido, convenio
 */
async function parseTITAResponse(
  csvText: string,
): Promise<TITASession[]> {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) {
    console.warn("[cco-sync-tita-sessions] CSV response has no data rows")
    return []
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const sessions: TITASession[] = []

  console.log(`[cco-sync-tita-sessions] CSV headers detected: ${headers.join(", ")}`)

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0 || (values.length === 1 && !values[0])) continue

    const session: TITASession = {}

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]
      const value = values[j]?.trim() ?? ""

      // Map csv_grade_profissionais fields to TITASession
      // NOTE: API returns headers in Portuguese with spaces, not underscores!
      if (header === "id agendamento" || header === "id") session.tita_agendamento_id = value ? parseInt(value) : undefined

      // Favorecido (paciente) info - new in v2.11.0
      if (header === "nome favorecido") session.paciente_nome = value || null
      if (header === "id favorecido") {
        if (!session.tita_agendamento_id && value) session.tita_agendamento_id = parseInt(value)
      }

      // Date/time fields - API uses "data", "hora inicial", "hora final"
      if (header === "data") session.data_sessao = normalizeDate(value)
      if (header === "hora inicial") session.hora_inicio = normalizeTime(value)
      if (header === "hora final") session.hora_fim = normalizeTime(value)

      // Professional info
      if (header === "profissional") session.profissional_agendado = value || null

      // Therapy info
      if (header === "terapia exibição" || header === "terapia") session.terapia = value || null

      // Unit/room info
      if (header === "convênio") session.convenio = value || null
      if (header === "nome unidade") session.unidade = value || null
      if (header === "sala") session.unidade = session.unidade || value || null

      // Status
      if (header === "status do agendamento") session.status_agendamento = value || null
      if (header === "observações da sala") session.justificativa = value || null

      // Tratativa info (CCO-010: headers confirmados pelo TITA csv_grade_profissionais)
      if (header === "possui tratativa") session.possui_tratativa = value.toLowerCase() === "sim"
      if (header === "nome profissional tratativa") session.profissional_tratativa = value || null
      if (header === "criação tratativa") session.data_tratativa = normalizeDate(value)
      if (header === "id profissional tratativa") session.id_profissional_tratativa = value ? parseInt(value) : undefined
      if (header === "origem tratativa") session.origem_tratativa = value || null
    }

    // Only add if has required fields for session_key
    // Note: For profissional grades, we need favorecido_nome for session_key
    if (session.paciente_nome && session.data_sessao && session.hora_inicio) {
      sessions.push(session)
    } else {
      const missing = []
      if (!session.paciente_nome) missing.push("paciente_nome (nome_favorecido)")
      if (!session.data_sessao) missing.push("data_sessao (data)")
      if (!session.hora_inicio) missing.push("hora_inicio (hora)")
      if (missing.length > 0) {
        console.warn(`[cco-sync-tita-sessions] Skipping row ${i} - missing: ${missing.join(", ")}`)
      }
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

  // Get today's date - optimized to fetch only today's sessions
  // This reduces API load and ensures faster response times
  const today = new Date()
  const dateFormat = (d: Date) => d.toISOString().split("T")[0]
  const dataInicio = dateFormat(today)
  const dataFim = dateFormat(today)
  const unidade = 280

  console.log(`[cco-sync-tita-sessions] Fetching TITA data from ${dataInicio} to ${dataFim}`)
  console.log(`[cco-sync-tita-sessions] Requesting UNIT FILTER: unidade=${unidade}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 50000) // 50s timeout

  let response: Response
  try {
    const titaPayload = {
      data_inicio: dataInicio,
      data_fim: dataFim,
      unidade: unidade,
    }

    console.log(`[cco-sync-tita-sessions] TITA request payload: ${JSON.stringify(titaPayload)}`)

    response = await fetch(
      "https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-INTEGRACAO-TOKEN": TITA_TOKEN,
        },
        body: JSON.stringify(titaPayload),
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`TITA API returned ${response.status}: ${errorText}`)
    }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("TITA API request timeout after 50s")
    }
    throw err
  }

  const csvText = await response.text()

  // DEBUG: Log raw response
  console.log(`[cco-sync-tita-sessions] Raw CSV response length: ${csvText.length} bytes`)
  console.log(`[cco-sync-tita-sessions] First 500 chars: ${csvText.substring(0, 500)}`)

  const sessions = await parseTITAResponse(csvText)

  console.log(`[cco-sync-tita-sessions] Parsed ${sessions.length} sessions from TITA`)

  // AUDIT: Count sessions by unit
  const sessionsByUnit = new Map<string, number>()
  for (const session of sessions) {
    const unitKey = session.unidade || "undefined"
    sessionsByUnit.set(unitKey, (sessionsByUnit.get(unitKey) || 0) + 1)
  }

  console.log(`[cco-sync-tita-sessions] AUDIT - Sessions by unit:`)
  for (const [unit, count] of sessionsByUnit.entries()) {
    console.log(`  - Unit "${unit}": ${count} sessions`)
  }
  console.log(`[cco-sync-tita-sessions] AUDIT - Expected unit 280: ${sessionsByUnit.get("280") || 0} sessions`)
  console.log(`[cco-sync-tita-sessions] AUDIT - Other units total: ${
    Array.from(sessionsByUnit.entries())
      .filter(([unit]) => unit !== "280" && unit !== "undefined")
      .reduce((sum, [, count]) => sum + count, 0)
  } sessions`)

  if (sessions.length > 0) {
    console.log(`[cco-sync-tita-sessions] Sample: ${JSON.stringify(sessions[0])}`)
  }

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
      tita_agendamento_id: session.tita_agendamento_id,
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
      id_profissional_tratativa: session.id_profissional_tratativa,
      origem_tratativa: session.origem_tratativa,
      sync_hash,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (rows.length === 0) {
    console.log("[cco-sync-tita-sessions] No rows to upsert")
    return 0
  }

  // Batch upsert via RPC (workaround for schema access in Edge Functions)
  let upsertedCount = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)

    // Call RPC function to upsert into cco.atendimentos
    const { data, error } = await supabase
      .rpc("upsert_atendimentos", {
        p_rows: batch,
      })

    if (error) {
      throw new Error(`Upsert failed: ${error.message}`)
    }

    const batchCount = data?.[0]?.upserted_count || batch.length
    upsertedCount += batchCount
    console.log(`[cco-sync-tita-sessions] Upserted batch ${i / 100 + 1}: ${batchCount} rows`)
  }

  // Detect session mutations (remarcations/deletions)
  console.log("[cco-sync-tita-sessions] Detecting session mutations...")
  const mutations = await detectSessionMutations(
    supabase,
    rows
      .filter((r) => r.tita_agendamento_id)
      .map((r) => ({
        tita_agendamento_id: r.tita_agendamento_id as number,
        session_key: r.session_key,
        data_sessao: r.data_sessao,
        hora_inicio: r.hora_inicio,
        paciente_nome: r.paciente_nome,
      })),
  )

  if (mutations.length > 0) {
    console.log(
      `[cco-sync-tita-sessions] Found ${mutations.length} mutations, consolidating...`,
    )
    const consolidated = await processMutations(supabase, mutations)
    console.log(
      `[cco-sync-tita-sessions] Consolidated ${consolidated}/${mutations.length} mutations`,
    )
  }

  return upsertedCount
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

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
    }, 200, corsHeaders)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    await logger.finishError(supabase, error)

    console.error("[cco-sync-tita-sessions] Error:", error)
    return jsonResponse({ error: error.message }, 500, corsHeaders)
  }
})
