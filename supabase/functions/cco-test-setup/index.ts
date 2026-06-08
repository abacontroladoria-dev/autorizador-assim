import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const body = await req.json()

  const { action, data } = body

  try {
    if (action === "insert_atendimento") {
      const { error } = await supabase.from("cco.atendimentos").insert(data)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, action }), { status: 200 })
    }

    if (action === "insert_authorization") {
      const { error } = await supabase.from("cco.session_authorizations").insert(data)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, action }), { status: 200 })
    }

    if (action === "update_atendimento") {
      const { session_key, updates } = data
      const { error } = await supabase
        .from("cco.atendimentos")
        .update(updates)
        .eq("session_key", session_key)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, action }), { status: 200 })
    }

    if (action === "update_authorization") {
      const { session_key, source, updates } = data
      const { error } = await supabase
        .from("cco.session_authorizations")
        .update(updates)
        .eq("session_key", session_key)
        .eq("source", source)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, action }), { status: 200 })
    }

    if (action === "query_occurrences") {
      const { tipo, session_key } = data
      let query = supabase.from("occurrences").select("*")
      if (tipo) query = query.eq("tipo", tipo)
      if (session_key) query = query.eq("session_key", session_key)
      const { data: results, error } = await query
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, results }), { status: 200 })
    }

    if (action === "query_dashboard") {
      const { data: dashboard, error } = await supabase.from("cco.dashboard_snapshot").select("*")
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, dashboard }), { status: 200 })
    }

    if (action === "cleanup") {
      // Delete all test occurrences
      const { data: testOccs } = await supabase
        .from("occurrences")
        .select("id")
        .like("session_key", "TEST_%")

      if (testOccs && testOccs.length > 0) {
        for (const occ of testOccs) {
          await supabase.from("occurrences").delete().eq("id", occ.id)
        }
      }

      // Delete test atendimentos and authorizations (via RPC for safety)
      await supabase.rpc("cleanup_test_data")

      return new Response(JSON.stringify({ ok: true, cleaned: testOccs?.length || 0 }), {
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 })
  } catch (err) {
    console.error("Error:", err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500 }
    )
  }
})
