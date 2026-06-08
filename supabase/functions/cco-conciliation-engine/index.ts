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

interface RuleConfig {
  tipo: string
  severity: string
  titulo: string
  descricao?: string | ((row: any) => string | undefined)
}

const RULE_CONFIGS: Record<string, RuleConfig> = {
  R1: {
    tipo: "AUTORIZACAO_PENDENTE",
    severity: "WARNING",
    titulo: "Autorização pendente",
  },
  R2: {
    tipo: "SESSAO_SEM_AUTORIZACAO",
    severity: "WARNING",
    titulo: "Sessão sem autorização encontrada",
    descricao: "A sessão não possui autorização vinculada.",
  },
  R3: {
    tipo: "EVOLUCAO_ATRASADA",
    severity: "WARNING",
    titulo: "Evolução pendente",
    descricao: "Atendimento sem tratativa/evolução registrada.",
  },
  R4: {
    tipo: "FALTA_TERAPEUTA",
    severity: "CRITICAL",
    titulo: "Falta de terapeuta sem substituto",
  },
  R5: {
    tipo: "SUBSTITUICAO",
    severity: "INFO",
    titulo: "Substituição de terapeuta confirmada",
  },
  R6: {
    tipo: "FALTA_PACIENTE",
    severity: "INFO",
    titulo: "Falta do paciente",
    descricao: (row: any) => row.justificativa || undefined,
  },
  R7: {
    tipo: "GLOSA",
    severity: "CRITICAL",
    titulo: "Autorização contestada (glosa)",
  },
}

function processRuleResults(
  candidates: Candidate[],
  ruleKey: string,
  results: any[] | null,
): void {
  if (!results) return

  const config = RULE_CONFIGS[ruleKey]
  if (!config) return

  logEngine(`${ruleKey} ${config.tipo} matches: ${results.length}`)

  for (const row of results) {
    const descricao = typeof config.descricao === "function" ? config.descricao(row) : config.descricao

    candidates.push({
      tipo: config.tipo,
      session_key: row.session_key,
      severity: config.severity,
      titulo: config.titulo,
      descricao,
      fingerprint: `${row.session_key}:${config.tipo}`,
    })
  }
}

async function detectOccurrences(
  supabase: ReturnType<typeof createClient>,
): Promise<Candidate[]> {
  const candidates: Candidate[] = []

  // Helper to safely execute detection RPC
  async function safeDetect(ruleName: string, rpcName: string) {
    try {
      const result = await supabase.rpc(rpcName)
      if (result.error) {
        logEngine(`${ruleName} error: ${result.error.message}`)
        return null
      }
      return result.data
    } catch (err) {
      logEngine(`${ruleName} exception: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  // Execute all detection RPCs in parallel
  const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
    safeDetect("R1 AUTORIZACAO_PENDENTE", "detect_r1_autorizacao_pendente"),
    safeDetect("R2 SESSAO_SEM_AUTORIZACAO", "detect_r2_sessao_sem_autorizacao"),
    safeDetect("R3 EVOLUCAO_ATRASADA", "detect_r3_evolucao_atrasada"),
    safeDetect("R4 FALTA_TERAPEUTA", "detect_r4_falta_terapeuta"),
    safeDetect("R5 SUBSTITUICAO", "detect_r5_substituicao"),
    safeDetect("R6 FALTA_PACIENTE", "detect_r6_falta_paciente"),
    safeDetect("R7 GLOSA", "detect_r7_glosa"),
  ])

  // Process results for all rules
  processRuleResults(candidates, "R1", r1)
  processRuleResults(candidates, "R2", r2)
  processRuleResults(candidates, "R3", r3)
  processRuleResults(candidates, "R4", r4)
  processRuleResults(candidates, "R5", r5)
  processRuleResults(candidates, "R6", r6)
  processRuleResults(candidates, "R7", r7)

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

  const { data, error } = await supabase.rpc("upsert_occurrences", {
    p_rows: rows,
  })

  if (error) {
    logEngine("upsert RPC error: " + error.message)
    throw error
  }

  return (typeof data === "number" ? data : 0) || 0
}

async function updateDashboard(supabase: ReturnType<typeof createClient>): Promise<void> {
  const { error } = await supabase.rpc("update_dashboard_snapshot")

  if (error) {
    logEngine("dashboard error: " + error.message)
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
    let dashboardSuccess = false
    try {
      await updateDashboard(supabase)
      dashboardSuccess = true
      const t6 = Date.now()
      logEngine(`STEP 4 COMPLETE - dashboard updated (${t6 - t5}ms)`)
    } catch (dashErr) {
      logEngine("STEP 4 FAILED: " + (dashErr instanceof Error ? dashErr.message : String(dashErr)))
      logEngine("WARNING: Dashboard snapshot is stale. Next engine run will retry.")
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
      dashboard_updated: dashboardSuccess,
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
