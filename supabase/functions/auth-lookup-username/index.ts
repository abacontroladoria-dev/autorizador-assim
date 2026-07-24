import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
];

function getCorsHeaders(requestOrigin: string) {
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin);
  return isAllowed
    ? {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      };
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Sem autenticação (necessário pra funcionar antes do login), então limita
// por IP pra dificultar enumeração de username/email por força bruta.
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

async function checkRateLimit(bucket: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("edge_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .gte("created_at", windowStart);

  // Se a checagem falhar (ex: tabela indisponível), não bloqueia o login —
  // rate limiting é defesa extra, não pode virar ponto único de falha do auth.
  if (error) return true;
  if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) return false;

  await supabaseAdmin.from("edge_rate_limits").insert({ bucket });
  return true;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(`auth-lookup-username:${ip}`);
  if (!allowed) return jsonResponse({ error: "too_many_requests" }, 429, corsHeaders);

  const body = await req.json();
  const { username } = body as { username?: string };

  if (!username || typeof username !== "string") {
    return jsonResponse({ error: "invalid_username" }, 400, corsHeaders);
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("email")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (error || !data) return jsonResponse({ error: "not_found" }, 404, corsHeaders);

  return jsonResponse({ email: data.email }, 200, corsHeaders);
});
