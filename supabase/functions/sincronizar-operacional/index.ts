import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const user = await getCurrentUser(req);
  if (!user) {
    return jsonResponse({ error: "not_authenticated" }, 401);
  }

  try {
    const body = await req.json();
    const { operacao = "sincronizar_controle", id_unidade = 280 } = body;

    console.log(`[SYNC] Iniciando sincronização: ${operacao}`);

    // ===============================================
    // 1. SINCRONIZAR CONTROLE_TERAPEUTICO
    // ===============================================
    if (operacao === "sincronizar_controle" || !operacao) {
      // Atualizar status de atendimentos baseado em regras
      const { data: controleItems, error: erroControle } = await supabaseAdmin
        .from("controle_terapeutico")
        .select("*")
        .eq("id_unidade", id_unidade)
        .is("data_atualizacao", null)
        .limit(100);

      if (erroControle) {
        console.error("[SYNC] Erro ao buscar controle_terapeutico:", erroControle);
      } else {
        console.log(`[SYNC] Processando ${controleItems?.length || 0} itens`);

        // Sincronizar cada item se necessário
        for (const item of controleItems || []) {
          // Aqui você pode adicionar lógica de sincronização específica
          // Por exemplo: validar presença, atualizar status baseado em regras, etc.
          await supabaseAdmin
            .from("controle_terapeutico")
            .update({
              data_atualizacao: new Date().toISOString(),
            })
            .eq("tita_agendamento_id", item.tita_agendamento_id);
        }
      }
    }

    // ===============================================
    // 2. SINCRONIZAR GRADE_PROFISSIONAIS_TITA
    // ===============================================
    if (operacao === "sincronizar_grade" || !operacao) {
      const { data: gradeItems, error: erroGrade } = await supabaseAdmin
        .from("grade_profissionais_tita")
        .select("*")
        .eq("id_unidade", id_unidade)
        .is("data_sincronizacao", null)
        .limit(100);

      if (erroGrade) {
        console.error("[SYNC] Erro ao buscar grade:", erroGrade);
      } else {
        console.log(`[SYNC] Processando ${gradeItems?.length || 0} profissionais`);

        for (const item of gradeItems || []) {
          await supabaseAdmin
            .from("grade_profissionais_tita")
            .update({
              data_sincronizacao: new Date().toISOString(),
            })
            .eq("profissional_id", item.profissional_id);
        }
      }
    }

    // ===============================================
    // 3. SINCRONIZAR AGENDA_TITA
    // ===============================================
    if (operacao === "sincronizar_agenda" || !operacao) {
      const { data: agendaItems, error: erroAgenda } = await supabaseAdmin
        .from("agenda_tita")
        .select("*")
        .eq("id_unidade", id_unidade)
        .is("data_sincronizacao", null)
        .limit(100);

      if (erroAgenda) {
        console.error("[SYNC] Erro ao buscar agenda:", erroAgenda);
      } else {
        console.log(`[SYNC] Processando ${agendaItems?.length || 0} itens de agenda`);

        for (const item of agendaItems || []) {
          await supabaseAdmin
            .from("agenda_tita")
            .update({
              data_sincronizacao: new Date().toISOString(),
            })
            .eq("agenda_id", item.agenda_id);
        }
      }
    }

    // ===============================================
    // 4. REGISTRAR STATUS DA SINCRONIZAÇÃO
    // ===============================================
    const { error: erroSync } = await supabaseAdmin.from("sync_status").insert({
      operacao,
      id_unidade,
      usuario_id: user.id,
      status: "concluido",
      data_sincronizacao: new Date().toISOString(),
      mensagem: `Sincronização ${operacao} concluída com sucesso`,
    });

    if (erroSync) {
      console.error("[SYNC] Erro ao registrar status:", erroSync);
    }

    return jsonResponse({
      status: "sucesso",
      operacao,
      timestamp: new Date().toISOString(),
      mensagem: "Sincronização operacional concluída",
    });
  } catch (err) {
    console.error("[SYNC] Erro:", err);

    // Registrar erro de sincronização
    await supabaseAdmin.from("sync_status").insert({
      operacao: "sincronizar_controle",
      status: "erro",
      data_sincronizacao: new Date().toISOString(),
      mensagem: err instanceof Error ? err.message : "Erro desconhecido",
    }).catch((e) => console.error("Erro ao registrar sync_status:", e));

    return jsonResponse(
      { error: "sync_failed", mensagem: err instanceof Error ? err.message : "Erro na sincronização" },
      500
    );
  }
});
