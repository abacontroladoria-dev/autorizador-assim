import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1];

  if (!token) return jsonResponse({ error: "not_authenticated" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "not_authenticated" }, 401);

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

  if (perfilError) return jsonResponse({ error: "profile_error", message: perfilError.message }, 500);
  if (!perfil) return jsonResponse({ error: "profile_not_found" }, 404);
  if (!perfil.ativo) return jsonResponse({ error: "user_inactive", message: "Usuário desativado" }, 403);

  return jsonResponse({ data: perfil });
});
