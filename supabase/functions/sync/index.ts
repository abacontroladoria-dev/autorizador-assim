import { serve } from "https://deno.land/std@0.203.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment")
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function parseBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || ""
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

async function verifyUser(token: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: "not_authenticated", status: 401 }
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("usuarios")
    .select("role, ativo")
    .eq("id", user.id)
    .single()

  if (perfilError) {
    return { error: "profile_error", status: 500, message: perfilError.message }
  }

  if (!perfil) {
    return { error: "profile_not_found", status: 404 }
  }

  if (!perfil.ativo) {
    return { error: "user_inactive", status: 403, message: "Usuário desativado" }
  }

  return { supabase, perfil }
}

async function fetchJson(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha no fetch: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405)
  }

  const token = parseBearerToken(req)
  if (!token) {
    return jsonResponse({ error: "not_authenticated" }, 401)
  }

  const authResult = await verifyUser(token)
  if (authResult.error) {
    return jsonResponse({ error: authResult.error, message: authResult.message }, authResult.status)
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10)
    const pacientes = await fetchJson(
      "https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=pacientes"
    )

    if (!Array.isArray(pacientes)) {
      throw new Error("Resposta de pacientes inválida")
    }

    const resultados: Array<Record<string, unknown>> = []

    for (let i = 0; i < pacientes.length; i += 20) {
      const lote = pacientes.slice(i, i + 20)
      const promessas = lote.map(async (paciente: any) => {
        const url = `https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=agenda/detalhe&paciente_id=${paciente.id}&data=${hoje}`

        try {
          const agendas = await fetchJson(url)
          if (!Array.isArray(agendas)) return []

          return agendas.map((a: any) => ({
            paciente_id: paciente.id,
            paciente_nome: a.nome,
            empresa: a.empresa,
            matricula: typeof a.matricula === "string" ? a.matricula.slice(0, 7) : a.matricula,
            dep: a.dep,
            crm: typeof a.crm === "string" ? a.crm.replace(/\D/g, "") : a.crm,
            nome_medico: a.nome_medico,
            tuss: a.tuss1,
            data_atendimento: a.data,
            horario: a.horario,
            terapia: a.terapia,
            updated_at: new Date().toISOString(),
          }))
        } catch {
          return []
        }
      })

      const resultadosLote = (await Promise.all(promessas)).flat()
      resultados.push(...resultadosLote)
    }

    if (resultados.length === 0) {
      return jsonResponse({ message: "Nenhum dado encontrado" }, 200)
    }

    for (let i = 0; i < resultados.length; i += 100) {
      const lote = resultados.slice(i, i + 100)
      const unicos = Array.from(
        new Map(
          lote.map((item) => [
            `${item.matricula}_${item.data_atendimento}_${item.horario}_${item.terapia}`,
            item,
          ])
        ).values()
      )

      const { error } = await authResult.supabase
        .from("agenda_orbita")
        .upsert(unicos, {
          onConflict: "matricula,data_atendimento,horario,terapia",
        })

      if (error) {
        throw error
      }
    }

    return jsonResponse({ message: "Sincronização concluída", processed: resultados.length })
  } catch (error) {
    console.error("Erro na sincronização:", error)
    return jsonResponse({ error: "sync_failed", message: String(error) }, 500)
  }
})
