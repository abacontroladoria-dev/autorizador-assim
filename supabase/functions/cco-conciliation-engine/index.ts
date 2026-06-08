/**
 * CCO Conciliation Engine — Fase 3
 * Detects business rule violations and generates occurrences
 * Triggered by sync jobs (fire-and-forget) or cron (fallback)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JobLogger } from "../cco-shared/logger.ts"

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

interface OccurrenceCandidate {
  session_key: string
  tipo: string
  severity: "CRITICAL" | "WARNING" | "INFO"
  titulo: string
  descricao: string
  fingerprint: string
  payload_json?: Record<string, unknown>
}

/**
 * Compute SHA-256 fingerprint for idempotency
 */
async function computeFingerprint(sessionKey: string, tipo: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${sessionKey}::${tipo}`)
  const buffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(buffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Detect all 7 occurrence types
 */
async function detectOccurrences(supabase: ReturnType<typeof createClient>): Promise<OccurrenceCandidate[]> {
  const candidates: OccurrenceCandidate[] = []

  console.log("[engine] Starting occurrence detection...")

  // R1: AUTORIZACAO_PENDENTE
  const pendentes = await supabase
    .from("cco.session_authorizations")
    .select("session_key,authorization_status,synced_at")
    .eq("authorization_status", "PENDENTE")

  if (pendentes.data && !pendentes.error) {
    for (const auth of pendentes.data) {
      const minutesWaiting = (Date.now() - new Date(auth.synced_at).getTime()) / 60000
      candidates.push({
        session_key: auth.session_key,
        tipo: "AUTORIZACAO_PENDENTE",
        severity: "CRITICAL",
        titulo: `Autorização pendente por ${Math.floor(minutesWaiting)}min`,
        descricao: `Aguardando aprovação desde ${new Date(auth.synced_at).toLocaleString()}`,
        fingerprint: await computeFingerprint(auth.session_key, "AUTORIZACAO_PENDENTE"),
        payload_json: { synced_at: auth.synced_at, minutes_waiting: Math.floor(minutesWaiting) },
      })
    }
  }

  // R2: SESSAO_SEM_AUTORIZACAO
  const semAuth = await supabase.rpc("detect_sessions_without_authorization")
  if (semAuth.data && !semAuth.error) {
    for (const session of semAuth.data) {
      candidates.push({
        session_key: session.session_key,
        tipo: "SESSAO_SEM_AUTORIZACAO",
        severity: "CRITICAL",
        titulo: `Sessão sem autorização registrada`,
        descricao: `Sessão em ${session.data_sessao} sem registro de solicitação de autorização`,
        fingerprint: await computeFingerprint(session.session_key, "SESSAO_SEM_AUTORIZACAO"),
        payload_json: { data_sessao: session.data_sessao },
      })
    }
  }

  // R3: EVOLUCAO_ATRASADA
  const atrasadas = await supabase
    .from("cco.atendimentos")
    .select("session_key,data_sessao,paciente_nome")
    .eq("possui_tratativa", false)
    .lt("data_sessao", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])

  if (atrasadas.data && !atrasadas.error) {
    for (const session of atrasadas.data) {
      candidates.push({
        session_key: session.session_key,
        tipo: "EVOLUCAO_ATRASADA",
        severity: "WARNING",
        titulo: `Evolução não registrada (${Math.floor((Date.now() - new Date(session.data_sessao).getTime()) / 86400000)} dias)`,
        descricao: `Sessão de ${session.data_sessao} sem registro de evolução`,
        fingerprint: await computeFingerprint(session.session_key, "EVOLUCAO_ATRASADA"),
        payload_json: { data_sessao: session.data_sessao },
      })
    }
  }

  // R4: FALTA_TERAPEUTA
  const faltasTherapist = await supabase
    .from("cco.session_substitutions")
    .select("session_key,status_ct")
    .eq("status_ct", "falta")
    .is("profissional_substituto_id", null)

  if (faltasTherapist.data && !faltasTherapist.error) {
    for (const sub of faltasTherapist.data) {
      candidates.push({
        session_key: sub.session_key,
        tipo: "FALTA_TERAPEUTA",
        severity: "CRITICAL",
        titulo: `Terapeuta faltando sem substituto`,
        descricao: `Sessão sem cobertura de profissional`,
        fingerprint: await computeFingerprint(sub.session_key, "FALTA_TERAPEUTA"),
        payload_json: { status_ct: sub.status_ct },
      })
    }
  }

  // R5: SUBSTITUICAO
  const substitucoes = await supabase
    .from("cco.session_substitutions")
    .select("session_key,profissional_substituto_id")
    .not("profissional_substituto_id", "is", null)

  if (substitucoes.data && !substitucoes.error) {
    for (const sub of substitucoes.data) {
      candidates.push({
        session_key: sub.session_key,
        tipo: "SUBSTITUICAO",
        severity: "INFO",
        titulo: `Terapeuta substituído`,
        descricao: `Profissional ID: ${sub.profissional_substituto_id}`,
        fingerprint: await computeFingerprint(sub.session_key, "SUBSTITUICAO"),
        payload_json: { profissional_substituto_id: sub.profissional_substituto_id },
      })
    }
  }

  // R6: FALTA_PACIENTE
  const faltasPatient = await supabase
    .from("cco.atendimentos")
    .select("session_key,justificativa,status_agendamento")
    .eq("status_agendamento", "FALTA_PACIENTE")

  if (faltasPatient.data && !faltasPatient.error) {
    for (const att of faltasPatient.data) {
      candidates.push({
        session_key: att.session_key,
        tipo: "FALTA_PACIENTE",
        severity: "INFO",
        titulo: `Paciente faltou`,
        descricao: att.justificativa || "Ausência não justificada",
        fingerprint: await computeFingerprint(att.session_key, "FALTA_PACIENTE"),
        payload_json: { justificativa: att.justificativa },
      })
    }
  }

  // R7: GLOSA
  const glosas = await supabase
    .from("cco.session_authorizations")
    .select("session_key,status_assim")
    .eq("authorization_status", "GLOSA")

  if (glosas.data && !glosas.error) {
    for (const glosa of glosas.data) {
      candidates.push({
        session_key: glosa.session_key,
        tipo: "GLOSA",
        severity: "CRITICAL",
        titulo: `Autorização com glosa`,
        descricao: `Status: ${glosa.status_assim || "GLOSA_REGISTRADA"}`,
        fingerprint: await computeFingerprint(glosa.session_key, "GLOSA"),
        payload_json: { status_assim: glosa.status_assim },
      })
    }
  }

  console.log(`[engine] Detected ${candidates.length} occurrence candidates`)
  return candidates
}

/**
 * Upsert occurrences with fingerprint idempotency
 */
async function upsertOccurrences(
  supabase: ReturnType<typeof createClient>,
  candidates: OccurrenceCandidate[],
): Promise<number> {
  let upsertedCount = 0

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("cco.occurrences")
      .upsert(
        {
          session_key: candidate.session_key,
          tipo: candidate.tipo,
          severity: candidate.severity,
          titulo: candidate.titulo,
          descricao: candidate.descricao,
          fingerprint: candidate.fingerprint,
          payload_json: candidate.payload_json,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fingerprint" },
      )
      .select("id")

    if (!error && data && data.length > 0) {
      upsertedCount++
    }
  }

  console.log(`[engine] Upserted ${upsertedCount} occurrences`)
  return upsertedCount
}

/**
 * Auto-resolve occurrences when conditions no longer exist
 */
async function autoResolveOccurrences(
  supabase: ReturnType<typeof createClient>,
  detectedTypes: Map<string, Set<string>>, // tipo -> Set of session_keys
): Promise<number> {
  let resolvedCount = 0

  // For each type, find active occurrences whose session_keys are NOT in the detected set
  const typesToAutoResolve = [
    "AUTORIZACAO_PENDENTE",
    "SESSAO_SEM_AUTORIZACAO",
    "EVOLUCAO_ATRASADA",
    "FALTA_TERAPEUTA",
  ]

  for (const tipo of typesToAutoResolve) {
    const activeSessionKeys = detectedTypes.get(tipo) || new Set()

    // Find occurrences of this type that are active but no longer in detection
    const { data: toResolve } = await supabase
      .from("cco.occurrences")
      .select("id,session_key")
      .eq("tipo", tipo)
      .is("resolved_at", null)
      .is("resolved_by", null)

    if (toResolve) {
      for (const occ of toResolve) {
        if (!activeSessionKeys.has(occ.session_key)) {
          const { error } = await supabase
            .from("cco.occurrences")
            .update({
              resolved_at: new Date().toISOString(),
              resolution_note: "auto: condição resolvida",
              updated_at: new Date().toISOString(),
            })
            .eq("id", occ.id)

          if (!error) {
            resolvedCount++
          }
        }
      }
    }
  }

  console.log(`[engine] Auto-resolved ${resolvedCount} occurrences`)
  return resolvedCount
}

/**
 * Update dashboard snapshot
 */
async function updateDashboard(supabase: ReturnType<typeof createClient>): Promise<void> {
  // Get counts by type
  const { data: counts } = await supabase
    .from("cco.occurrences")
    .select("tipo")
    .is("resolved_at", null)

  const countsByType: Record<string, number> = {}
  if (counts) {
    for (const occ of counts) {
      countsByType[occ.tipo] = (countsByType[occ.tipo] || 0) + 1
    }
  }

  const today = new Date().toISOString().split("T")[0]

  const { error } = await supabase
    .from("cco.dashboard_snapshot")
    .upsert({
      data_ref: today,
      calculated_at: new Date().toISOString(),
      autorizacoes_pendentes: countsByType["AUTORIZACAO_PENDENTE"] || 0,
      sessoes_sem_autorizacao: countsByType["SESSAO_SEM_AUTORIZACAO"] || 0,
      evolucoes_atrasadas: countsByType["EVOLUCAO_ATRASADA"] || 0,
      faltas_terapeuta: countsByType["FALTA_TERAPEUTA"] || 0,
      substituicoes: countsByType["SUBSTITUICAO"] || 0,
      faltas_paciente: countsByType["FALTA_PACIENTE"] || 0,
      glosas: countsByType["GLOSA"] || 0,
      receita_em_risco_count:
        (countsByType["SESSAO_SEM_AUTORIZACAO"] || 0) +
        (countsByType["AUTORIZACAO_PENDENTE"] || 0) +
        (countsByType["EVOLUCAO_ATRASADA"] || 0),
    })

  if (error) {
    console.warn(`[engine] Failed to update dashboard: ${error.message}`)
  } else {
    console.log(`[engine] Dashboard snapshot updated for ${today}`)
  }
}

/**
 * Main engine orchestration
 */
async function runEngine(supabase: ReturnType<typeof createClient>, logger: JobLogger) {
  // Detect occurrences
  const candidates = await detectOccurrences(supabase)

  // Build map of detected types for auto-resolve
  const detectedTypes = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    if (!detectedTypes.has(candidate.tipo)) {
      detectedTypes.set(candidate.tipo, new Set())
    }
    detectedTypes.get(candidate.tipo)!.add(candidate.session_key)
  }

  // Upsert occurrences
  const upsertedCount = await upsertOccurrences(supabase, candidates)

  // Auto-resolve
  const resolvedCount = await autoResolveOccurrences(supabase, detectedTypes)

  // Update dashboard
  await updateDashboard(supabase)

  // Log execution
  await logger.finishSuccess(supabase, upsertedCount + resolvedCount)

  return {
    ok: true,
    job: "cco-conciliation-engine",
    occurrences_generated: upsertedCount,
    occurrences_auto_resolved: resolvedCount,
    total_processed: upsertedCount + resolvedCount,
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const logger = new JobLogger("cco-conciliation-engine")

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const result = await runEngine(supabase, logger)
    return jsonResponse(result, 200)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error(`[engine] Error: ${error.message}`)

    const logger2 = new JobLogger("cco-conciliation-engine")
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    await logger2.finishError(supabase, error)

    return jsonResponse({ ok: false, error: error.message }, 500)
  }
})
