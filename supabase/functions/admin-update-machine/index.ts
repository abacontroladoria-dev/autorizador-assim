import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment");
}

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

async function getCurrentUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1];
  if (!token) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function isAdmin(user: any) {
  if (!user) return false;

  const { data: perfil, error } = await supabaseAdmin
    .from("usuarios")
    .select("role, ativo")
    .eq("id", user.id)
    .single();

  if (error) return false;
  if (!perfil && user.email) {
    const fallback = await supabaseAdmin
      .from("usuarios")
      .select("role, ativo")
      .eq("email", user.email)
      .single();
    return fallback.data?.role === "admin" && fallback.data?.ativo;
  }

  return perfil?.role === "admin" && perfil?.ativo;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  const user = await getCurrentUser(req);
  if (!user) return jsonResponse({ error: "not_authenticated" }, 401, corsHeaders);
  if (!(await isAdmin(user))) return jsonResponse({ error: "forbidden" }, 403, corsHeaders);

  const body = await req.json();
  const { machineId, ativa } = body as { machineId?: string; ativa?: boolean };
  if (!machineId || typeof ativa !== "boolean") {
    return jsonResponse({ error: "invalid_payload" }, 400, corsHeaders);
  }

  const { error } = await supabaseAdmin
    .from("maquinas")
    .update({ ativa })
    .eq("id", machineId);

  if (error) {
    return jsonResponse({ error: "update_failed", message: error.message }, 500, corsHeaders);
  }

  return jsonResponse({ success: true }, 200, corsHeaders);
});
