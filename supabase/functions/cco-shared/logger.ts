/**
 * Structured logging for CCO jobs
 * All logs written to cco.processing_logs
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface JobLogEntry {
  job_name: string
  started_at: string
  finished_at?: string
  status: "running" | "success" | "error"
  rows_processed?: number
  error_message?: string
}

export class JobLogger {
  private logEntry: JobLogEntry

  constructor(jobName: string) {
    this.logEntry = {
      job_name: jobName,
      started_at: new Date().toISOString(),
      status: "running",
    }
  }

  setRowsProcessed(count: number) {
    this.logEntry.rows_processed = count
  }

  async finishSuccess(supabase: SupabaseClient, rowsProcessed: number) {
    this.logEntry.status = "success"
    this.logEntry.finished_at = new Date().toISOString()
    this.logEntry.rows_processed = rowsProcessed

    const { error } = await supabase
      .from("cco.processing_logs")
      .insert([this.logEntry])

    if (error) {
      console.error(`[${this.logEntry.job_name}] Failed to log success:`, error)
    } else {
      console.log(`[${this.logEntry.job_name}] Logged success: ${rowsProcessed} rows`)
    }
  }

  async finishError(supabase: SupabaseClient, err: Error) {
    this.logEntry.status = "error"
    this.logEntry.finished_at = new Date().toISOString()
    this.logEntry.error_message = err.message

    const { error: logError } = await supabase
      .from("cco.processing_logs")
      .insert([this.logEntry])

    if (logError) {
      console.error(`[${this.logEntry.job_name}] Failed to log error:`, logError)
    } else {
      console.error(`[${this.logEntry.job_name}] Logged error: ${err.message}`)
    }
  }
}

/**
 * Normalize name for session_key computation
 * sha256(unaccent(lower(trim(paciente_nome))) || data_sessao || hora_inicio)
 */
export function normalizePatientName(name: string | null | undefined): string {
  if (!name) return ""
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacritics
}

/**
 * Convert time to HH:MM format for comparison
 */
export function normalizeTime(time: string | unknown): string | null {
  if (!time) return null
  const str = String(time).trim()
  const match = str.match(/^(\d{1,2}):(\d{2})/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)

    // Validate time ranges
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }
  return null
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD with validation
 */
export function normalizeDate(date: string | unknown): string | null {
  if (!date) return null
  const str = String(date).trim()

  // DD/MM/YYYY format
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    const day = parseInt(br[1], 10)
    const month = parseInt(br[2], 10)
    const year = parseInt(br[3], 10)

    // Validate date range
    if (month < 1 || month > 12) return null
    if (day < 1 || day > 31) return null

    // Validate actual date validity (rough check)
    const testDate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    if (isNaN(testDate.getTime())) return null

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  // YYYY-MM-DD format
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const year = parseInt(iso[1], 10)
    const month = parseInt(iso[2], 10)
    const day = parseInt(iso[3], 10)

    // Validate date range
    if (month < 1 || month > 12) return null
    if (day < 1 || day > 31) return null

    // Validate actual date validity
    const testDate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    if (isNaN(testDate.getTime())) return null

    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  return null
}

/**
 * Compute SHA-256 hash (requires crypto API or external library)
 * Using simple string hash for now (to be computed server-side in production)
 */
export async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const buffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(buffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}

/**
 * Build session_key for CCO
 */
export async function buildSessionKey(
  pacienteName: string,
  dataSessao: string,
  horaInicio: string,
): Promise<string> {
  const normalized = `${normalizePatientName(pacienteName)}${dataSessao}${horaInicio}`
  return computeSHA256(normalized)
}
