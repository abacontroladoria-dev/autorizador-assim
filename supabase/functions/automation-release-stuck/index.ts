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

async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("role, ativo")
    .eq("id", userId)
    .single();
  return data?.role === "admin" && data?.ativo === true;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);

  const user = await getCurrentUser(req);
  if (!user) return jsonResponse({ error: "not_authenticated" }, 401, corsHeaders);
  if (!(await isAdmin(user.id))) return jsonResponse({ error: "forbidden" }, 403, corsHeaders);

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Data de HOJE em São Paulo. `en-CA` porque devolve YYYY-MM-DD, que é o formato
  // que data_atendimento (date) espera.
  const hojeSP = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  // Os dois filtros abaixo não existiam, e a falta deles transformava um clique
  // em incidente (2026-08-14): a função devolvia para 'pendente' TODA linha órfã
  // em 'processando' de qualquer dia da história, cada uma voltando para a fila
  // da estação gravada no machine_id. A recepção via "solicitações aparecendo
  // sozinhas" — eram sessões velhas ressuscitadas.
  //
  //   data_atendimento = hoje  → sessão de ontem não pode ser autorizada hoje. A
  //     ASSIM carimba data_execucao no INSTANTE da autorização, não na data do
  //     atendimento, e isso quebra todo o casamento por data depois.
  //
  //   numero_autorizacao IS NULL → linha que já tem guia está autorizada. Mandar
  //     de volta para o robô produz "1601-REINCIDENCIA NO ATEN" na ASSIM.
  //
  // O que sobra fora desses filtros continua em 'processando' e aparece no
  // diagnóstico — travado é melhor que autorizado errado.
  const { data, error } = await supabaseAdmin
    .from("fila_autorizacoes")
    .update({
      status: "pendente",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processando")
    .lt("updated_at", twoHoursAgo)
    .eq("data_atendimento", hojeSP)
    .is("numero_autorizacao", null)
    .select("id");

  if (error) return jsonResponse({ error: error.message }, 500, corsHeaders);

  // Quantas ficaram de fora, para o clique não parecer um no-op quando havia
  // travadas que a função deliberadamente não tocou.
  const { count: retidas } = await supabaseAdmin
    .from("fila_autorizacoes")
    .select("id", { count: "exact", head: true })
    .eq("status", "processando")
    .lt("updated_at", twoHoursAgo);

  return jsonResponse(
    { success: true, liberados: data?.length ?? 0, retidas: retidas ?? 0 },
    200,
    corsHeaders,
  );
});
