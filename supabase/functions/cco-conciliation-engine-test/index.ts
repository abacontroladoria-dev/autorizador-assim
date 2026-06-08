import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { JobLogger } from "../cco-shared/logger.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

async function testDetections(supabase: ReturnType<typeof createClient>) {
  const results: Record<string, number> = {}

  // R1
  console.error("[test] R1 START")
  let t = Date.now()
  const r1 = await supabase
    .schema("cco")
    .from("session_authorizations")
    .select("count")
    .eq("authorization_status", "PENDENTE")
    .limit(1)
  results["R1"] = Date.now() - t
  console.error(`[test] R1 END: ${results["R1"]}ms`)

  // R2
  console.error("[test] R2 START")
  t = Date.now()
  const r2 = await supabase.rpc("detect_sessions_without_authorization")
  results["R2"] = Date.now() - t
  console.error(`[test] R2 END: ${results["R2"]}ms`)

  // R3
  console.error("[test] R3 START")
  t = Date.now()
  const r3 = await supabase
    .schema("cco")
    .from("atendimentos")
    .select("session_key,data_sessao,paciente_nome")
    .eq("possui_tratativa", false)
    .lt("data_sessao", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
  results["R3"] = Date.now() - t
  console.error(`[test] R3 END: ${results["R3"]}ms`)

  // R4
  console.error("[test] R4 START")
  t = Date.now()
  const r4 = await supabase
    .schema("cco")
    .from("session_substitutions")
    .select("session_key,status_ct")
    .eq("status_ct", "falta")
    .is("profissional_substituto_id", null)
  results["R4"] = Date.now() - t
  console.error(`[test] R4 END: ${results["R4"]}ms`)

  // R5
  console.error("[test] R5 START")
  t = Date.now()
  const r5 = await supabase
    .schema("cco")
    .from("session_substitutions")
    .select("session_key,profissional_substituto_id")
    .not("profissional_substituto_id", "is", null)
  results["R5"] = Date.now() - t
  console.error(`[test] R5 END: ${results["R5"]}ms`)

  // R6
  console.error("[test] R6 START")
  t = Date.now()
  const r6 = await supabase
    .schema("cco")
    .from("atendimentos")
    .select("session_key,justificativa,status_agendamento")
    .eq("status_agendamento", "FALTA_PACIENTE")
  results["R6"] = Date.now() - t
  console.error(`[test] R6 END: ${results["R6"]}ms`)

  // R7
  console.error("[test] R7 START")
  t = Date.now()
  const r7 = await supabase
    .schema("cco")
    .from("session_authorizations")
    .select("session_key,status_assim")
    .eq("authorization_status", "GLOSA")
  results["R7"] = Date.now() - t
  console.error(`[test] R7 END: ${results["R7"]}ms`)

  return results
}

serve(async (req) => {
  console.error("[test-engine] HTTP handler START")

  const logger = new JobLogger("cco-conciliation-engine-test")
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    console.error("[test-engine] calling testDetections...")
    const results = await testDetections(supabase)
    console.error("[test-engine] testDetections complete:", JSON.stringify(results))

    await logger.finishSuccess(supabase, 0)

    return new Response(JSON.stringify({ ok: true, times: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("[test-engine] CATCH:", err instanceof Error ? err.message : String(err))
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 })
  }
})
