import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("[test_env] Function loaded")

serve(async (req: Request) => {
  console.log("[test_env] Request received")

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const titaToken = Deno.env.get("TITA_TOKEN")

  console.log("[test_env] SUPABASE_URL present:", !!supabaseUrl)
  console.log("[test_env] TITA_TOKEN present:", !!titaToken)

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      supabaseUrl: !!supabaseUrl,
      titaToken: !!titaToken
    }),
    { headers: { "Content-Type": "application/json" } }
  )
})
