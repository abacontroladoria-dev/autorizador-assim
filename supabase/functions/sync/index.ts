import { serve } from "https://deno.land/std@0.203.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment")
}

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

function getCorsHeaders(requestOrigin: string) {
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin)
  return isAllowed
    ? {
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : {
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
}

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
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

// Canoniza o CRM vindo do Órbita.
// A fonte às vezes injeta um "0" logo após o prefixo "52", gerando um CRM de
// 10 dígitos (ex.: 5201146424) no lugar do correto de 9 (521146424). O padrão
// é estável em toda a base: TODO CRM de 10 dígitos começa com "520" e o valor
// certo é a mesma sequência sem esse "0" da 3ª posição ("520…" -> "52…").
// Transformação por-valor, determinística, sem I/O extra.
function canonizarCrm(raw: unknown): string | null {
  if (typeof raw !== "string") return (raw ?? null) as string | null
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10 && digits.startsWith("520")) {
    return "52" + digits.slice(3)
  }
  return digits
}

// A UF do médico vem embutida no crm do Órbita como "<numero>/<UF>"
// (ex.: "52949442/RJ"). O robô precisa dela para selecionar o estado do CRM
// solicitante no portal ASSIM (senão fica no default e a guia é rejeitada).
function extrairCrmUf(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const parte = raw.split("/")[1]
  const uf = (parte ?? "").trim().toUpperCase()
  return uf || null
}

// Extrai a role do JWT (sem verificar assinatura — a plataforma já verifica o JWT
// antes da função rodar). Usado só para distinguir chamada de cron (service_role)
// de chamada de usuário do frontend.
function getTokenRole(token: string): string | null {
  try {
    let b64 = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")
    b64 += "=".repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(b64))
    return typeof payload?.role === "string" ? payload.role : null
  } catch {
    return null
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)
  }

  const token = parseBearerToken(req)
  if (!token) {
    return jsonResponse({ error: "not_authenticated" }, 401, corsHeaders)
  }

  // Duas formas de invocação:
  //  - Cron/servidor: bearer com role "service_role" → pula a checagem de usuário
  //  - Frontend: JWT de usuário autenticado → mantém a validação em usuarios
  let db: ReturnType<typeof createClient>
  if (getTokenRole(token) === "service_role") {
    db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  } else {
    const authResult = await verifyUser(token)
    if (authResult.error) {
      return jsonResponse({ error: authResult.error, message: authResult.message }, authResult.status, corsHeaders)
    }
    db = authResult.supabase!
  }

  try {
    // Alvos = pacientes com atendimento ativo a partir de hoje + a data mais
    // próxima de cada um. Buscamos cada paciente na SUA próxima data (não só
    // "hoje"): antes, quem não tinha atendimento hoje ficava fora de
    // agenda_orbita → CRM null → robô travava. O CRM é por paciente, então 1
    // linha em qualquer data já resolve a view.
    const { data: alvos, error: alvosError } = await db.rpc("fn_orbita_sync_targets")
    if (alvosError) throw alvosError

    if (!Array.isArray(alvos) || alvos.length === 0) {
      return jsonResponse({ message: "Nenhum paciente com atendimento futuro" }, 200, corsHeaders)
    }

    const resultados: Array<Record<string, unknown>> = []

    for (let i = 0; i < alvos.length; i += 20) {
      const lote = alvos.slice(i, i + 20)
      const promessas = lote.map(async (alvo: any) => {
        const pid = alvo.paciente_id
        const data = alvo.prox_data
        const url = `https://cronogramauniversoaba.com.br/api_api_automacao/?endpoint=agenda/detalhe&paciente_id=${pid}&data=${data}`

        try {
          const agendas = await fetchJson(url)
          if (!Array.isArray(agendas)) return []

          return agendas.map((a: any) => ({
            paciente_id: pid,
            paciente_nome: a.nome,
            empresa: a.empresa,
            matricula: typeof a.matricula === "string" ? a.matricula.slice(0, 7) : a.matricula,
            dep: a.dep,
            crm: canonizarCrm(a.crm),
            crm_uf: extrairCrmUf(a.crm),
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
      return jsonResponse({ message: "Nenhum dado encontrado" }, 200, corsHeaders)
    }

    for (let i = 0; i < resultados.length; i += 100) {
      const lote = resultados.slice(i, i + 100)
      const unicos = Array.from(
        new Map(
          lote.map((item) => [
            `${item.paciente_id}_${item.data_atendimento}_${item.horario}_${item.terapia}`,
            item,
          ])
        ).values()
      )

      // onConflict alinhado ao constraint real agenda_orbita_unique
      // (paciente_id, data_atendimento, horario, terapia). Usar `matricula`
      // dava 42P10 (nenhum constraint casava) e congelava a tabela.
      const { error } = await db
        .from("agenda_orbita")
        .upsert(unicos, {
          onConflict: "paciente_id,data_atendimento,horario,terapia",
        })

      if (error) {
        throw error
      }
    }

    return jsonResponse({ message: "Sincronização concluída", processed: resultados.length }, 200, corsHeaders)
  } catch (error) {
    console.error("Erro na sincronização:", error)
    return jsonResponse({ error: "sync_failed", message: String(error) }, 500, corsHeaders)
  }
})
