import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);

  const authHeader = req.headers.get("authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1];

  if (!token) return jsonResponse({ error: "not_authenticated" }, 401, corsHeaders);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "not_authenticated" }, 401, corsHeaders);

  let { data: perfil, error: perfilError } = await supabase
    .from("usuarios")
    .select("role, ativo")
    .eq("id", user.id)
    .single();

  if (!perfil && user.email) {
    const fallback = await supabase
      .from("usuarios")
      .select("role, ativo")
      .eq("email", user.email)
      .single();
    perfil = fallback.data;
    perfilError = fallback.error;
  }

  if (perfilError) return jsonResponse({ error: "profile_error", message: perfilError.message }, 500, corsHeaders);
  if (!perfil) return jsonResponse({ error: "profile_not_found" }, 404, corsHeaders);
  if (!perfil.ativo) return jsonResponse({ error: "user_inactive", message: "Usuário desativado" }, 403, corsHeaders);

  return jsonResponse({ data: perfil }, 200, corsHeaders);
});
