import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JobLogger } from "../cco-shared/logger.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const engineLogs: string[] = []

function logEngine(msg: string) {
  const timestamp = new Date().toISOString().split("T")[1]
  const fullMsg = `[${timestamp}] ${msg}`
  console.error(fullMsg)
  engineLogs.push(fullMsg)
}

interface Candidate {
  tipo: string
  session_key: string
  severity: string
  titulo: string
  descricao?: string
  fingerprint: string
}

async function detectOccurrences(
  supabase: ReturnType<typeof createClient>,
): Promise<Candidate[]> {
  const candidates: Candidate[] = []

  // R1: AUTORIZACAO_PENDENTE
  const r1 = await supabase
    .schema("cco")
    .from("session_authorizations")
    .select("session_key")
    .eq("authorization_status", "PENDENTE")

  if (r1.error) {
    logEngine("R1 AUTORIZACAO_PENDENTE error: " + r1.error.message)
  } else {
    logEngine("R1 AUTORIZACAO_PENDENTE matches: " + (r1.data?.length || 0))
  }

  if (r1.data) {
    for (const row of r1.data) {
      candidates.push({
        tipo: "AUTORIZACAO_PENDENTE",
        session_key: row.session_key,
        severity: "WARNING",
        titulo: "Autorização pendente",
        fingerprint: `${row.session_key}:AUTORIZACAO_PENDENTE`,
      })
      logEngine("Candidate added - AUTORIZACAO_PENDENTE: " + row.session_key?.substring(0, 16))
    }
  }

  // R2: SESSAO_SEM_AUTORIZACAO (skip RPC, will add later)
  // const r2 = await supabase.rpc("detect_sessions_without_authorization")

  // R3: EVOLUCAO_ATRASADA - SKIPPED
  // TODO: Fix OR operator syntax in Supabase JS client
  // For now, searching only for FALTA_PACIENTE which we know exists

  // R4: FALTA_TERAPEUTA (absence without substitute)
  const r4 = await supabase
    .schema("cco")
    .from("session_substitutions")
    .select("session_key")
    .eq("status_ct", "falta")
    .is("profissional_substituto_id", null)

  if (r4.error) {
    logEngine("R4 FALTA_TERAPEUTA error: " + r4.error.message)
  } else {
    logEngine("R4 FALTA_TERAPEUTA matches: " + (r4.data?.length || 0))
  }

  if (r4.data) {
    for (const row of r4.data) {
      candidates.push({
        tipo: "FALTA_TERAPEUTA",
        session_key: row.session_key,
        severity: "CRITICAL",
        titulo: "Falta de terapeuta sem substituto",
        fingerprint: `${row.session_key}:FALTA_TERAPEUTA`,
      })
      logEngine("Candidate added - FALTA_TERAPEUTA: " + row.session_key?.substring(0, 16))
    }
  }

  // R5: SUBSTITUICAO (therapist substitution confirmed)
  const r5 = await supabase
    .schema("cco")
    .from("session_substitutions")
    .select("session_key")
    .not("profissional_substituto_id", "is", null)

  if (r5.error) {
    logEngine("R5 SUBSTITUICAO error: " + r5.error.message)
  } else {
    logEngine("R5 SUBSTITUICAO matches: " + (r5.data?.length || 0))
  }

  if (r5.data) {
    for (const row of r5.data) {
      candidates.push({
        tipo: "SUBSTITUICAO",
        session_key: row.session_key,
        severity: "INFO",
        titulo: "Substituição de terapeuta confirmada",
        fingerprint: `${row.session_key}:SUBSTITUICAO`,
      })
      logEngine("Candidate added - SUBSTITUICAO: " + row.session_key?.substring(0, 16))
    }
  }

  // R6: FALTA_PACIENTE
  const r6 = await supabase
    .schema("cco")
    .from("atendimentos")
    .select("session_key,justificativa")
    .eq("status_agendamento", "FALTA_PACIENTE")

  if (r6.error) {
    logEngine("R6 FALTA_PACIENTE error: " + r6.error.message)
  } else {
    logEngine("R6 FALTA_PACIENTE matches: " + (r6.data?.length || 0))
  }

  if (r6.data) {
    for (const row of r6.data) {
      candidates.push({
        tipo: "FALTA_PACIENTE",
        session_key: row.session_key,
        severity: "INFO",
        titulo: "Falta do paciente",
        descricao: row.justificativa || undefined,
        fingerprint: `${row.session_key}:FALTA_PACIENTE`,
      })
      logEngine("Candidate added - FALTA_PACIENTE: " + row.session_key?.substring(0, 16))
    }
  }

  // R7: GLOSA
  const r7 = await supabase
    .schema("cco")
    .from("session_authorizations")
    .select("session_key")
    .eq("authorization_status", "GLOSA")

  if (r7.error) {
    logEngine("R7 GLOSA error: " + r7.error.message)
  } else {
    logEngine("R7 GLOSA matches: " + (r7.data?.length || 0))
  }

  if (r7.data) {
    for (const row of r7.data) {
      candidates.push({
        tipo: "GLOSA",
        session_key: row.session_key,
        severity: "CRITICAL",
        titulo: "Autorização contestada (glosa)",
        fingerprint: `${row.session_key}:GLOSA`,
      })
      logEngine("Candidate added - GLOSA: " + row.session_key?.substring(0, 16))
    }
  }

  logEngine("Total candidates collected: " + candidates.length)
  return candidates
}

async function upsertOccurrences(
  supabase: ReturnType<typeof createClient>,
  candidates: Candidate[],
): Promise<number> {
  if (!candidates.length) return 0

  const rows = candidates.map((c) => ({
    session_key: c.session_key,
    tipo: c.tipo,
    severity: c.severity,
    titulo: c.titulo,
    descricao: c.descricao || null,
    fingerprint: c.fingerprint,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  const { count, error } = await supabase
    .schema("cco")
    .from("occurrences")
    .upsert(rows, { onConflict: "fingerprint" })
    .select("count", { count: "planned" })

  if (error) {
    console.error("[engine] upsert error:", error.message)
    throw error
  }

  return count || 0
}

async function updateDashboard(supabase: ReturnType<typeof createClient>): Promise<void> {
  const today = new Date().toISOString().split("T")[0]

  const { data: occurrencesByType } = await supabase
    .schema("cco")
    .from("occurrences")
    .select("tipo")
    .is("resolved_at", null)

  const counts: Record<string, number> = {}
  if (occurrencesByType) {
    for (const row of occurrencesByType) {
      counts[row.tipo] = (counts[row.tipo] || 0) + 1
    }
  }

  const snapshot = {
    data_ref: today,
    autorizacoes_pendentes: counts["AUTORIZACAO_PENDENTE"] || 0,
    sessoes_sem_autorizacao: counts["SESSAO_SEM_AUTORIZACAO"] || 0,
    evolucoes_atrasadas: counts["EVOLUCAO_ATRASADA"] || 0,
    faltas_terapeuta: counts["FALTA_TERAPEUTA"] || 0,
    substituicoes: counts["SUBSTITUICAO"] || 0,
    faltas_paciente: counts["FALTA_PACIENTE"] || 0,
    glosas: counts["GLOSA"] || 0,
    receita_em_risco_count:
      (counts["AUTORIZACAO_PENDENTE"] || 0) +
      (counts["SESSAO_SEM_AUTORIZACAO"] || 0) +
      (counts["EVOLUCAO_ATRASADA"] || 0),
    calculated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .schema("cco")
    .from("dashboard_snapshot")
    .upsert(snapshot, { onConflict: "data_ref" })

  if (error) {
    console.error("[engine] dashboard error:", error.message)
    throw error
  }
}

serve(async (req) => {
  console.error("[engine] === HANDLER INVOKED ===")
  const logger = new JobLogger("cco-conciliation-engine")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  engineLogs.length = 0 // Clear logs for this invocation

  try {
    logEngine("========== START ==========")
    const t0 = Date.now()

    // Get counts for debug
    logEngine("STEP 0 - Getting CCO counts...")
    const { data: counts } = await supabase.rpc("count_cco_records")
    logEngine("CCO record counts: " + JSON.stringify(counts))

    // Get samples for debug
    logEngine("STEP 1 - Getting data samples...")
    const sampleResult = await supabase.rpc("sample_cco_data")
    logEngine("sample_cco_data result: " + JSON.stringify(sampleResult))

    logEngine("STEP 2 - Detecting occurrences...")
    const t1 = Date.now()
    const candidates = await detectOccurrences(supabase)
    const t2 = Date.now()
    logEngine(`STEP 2 COMPLETE - ${candidates.length} candidates detected (${t2 - t1}ms)`)

    logEngine("STEP 3 - Upserting occurrences...")
    const t3 = Date.now()
    const upserted = await upsertOccurrences(supabase, candidates)
    const t4 = Date.now()
    logEngine(`STEP 3 COMPLETE - ${upserted} upserted (${t4 - t3}ms)`)

    logEngine("STEP 4 - Updating dashboard...")
    const t5 = Date.now()
    try {
      await updateDashboard(supabase)
      const t6 = Date.now()
      logEngine(`STEP 4 COMPLETE - dashboard updated (${t6 - t5}ms)`)
    } catch (dashErr) {
      logEngine("STEP 4 ERROR (non-fatal): " + (dashErr instanceof Error ? dashErr.message : String(dashErr)))
    }

    const totalTime = Date.now() - t0
    logEngine(`========== COMPLETE in ${totalTime}ms ==========`)

    await logger.finishSuccess(supabase, candidates.length)

    const countMap: Record<string, number> = {}
    if (counts && Array.isArray(counts)) {
      for (const row of counts) {
        countMap[row.table_name] = row.record_count
      }
    }

    const result = {
      ok: true,
      candidates_detected: candidates.length,
      occurrences_generated: upserted,
      dashboard_updated: true,
      test_flag: "FILE_UPDATED_" + new Date().toISOString(),
      engine_logs: engineLogs,
      debug: {
        cco_record_counts: countMap,
        data_samples: sampleResult.data || sampleResult.error || "no data",
      },
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    logEngine("ERROR: " + (err instanceof Error ? err.message : String(err)))
    await logger.finishError(supabase, err instanceof Error ? err : new Error(String(err)))

    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        engine_logs: engineLogs,
      }),
      { status: 500 },
    )
  }
})
