import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

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

// Retorna hoje → último dia útil do mês seguinte no fuso de São Paulo.
function getRangeUntilEndOfNextMonth(): { dataInicio: string; dataFim: string } {
  const agora   = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const lastDay = new Date(agora.getFullYear(), agora.getMonth() + 2, 0)
  const dow     = lastDay.getDay()
  if (dow === 0) lastDay.setDate(lastDay.getDate() - 2)
  else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1)
  return {
    dataInicio: agora.toISOString().slice(0, 10),
    dataFim:    lastDay.toISOString().slice(0, 10),
  }
}

// TiTa pode enviar campos bigint como "1993, 2200, 1898" — pega só o primeiro valor
function toInt(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const first = String(val).split(",")[0].trim()
  const n = parseInt(first, 10)
  return isNaN(n) ? null : n
}

function parseTitaDate(valor: unknown): string | null {
  if (!valor) return null
  const s = String(valor).trim()
  // DD/MM/YYYY → YYYY-MM-DD
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

async function sincronizarGrade(
  dataInicio: string,
  dataFim: string,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const gradeUrl = new URL("https://apiv2.apptita.com.br/api/integracao/grade_profissionais")
  gradeUrl.searchParams.set("data_inicio", dataInicio)
  gradeUrl.searchParams.set("data_fim", dataFim)
  const response = await fetch(gradeUrl.toString(), {
    method: "GET",
    headers: {
      "X-INTEGRACAO-TOKEN": TITA_TOKEN,
    },
  })

  if (!response.ok) {
    const erro = await response.text()
    throw new Error(`TITA grade API error (${dataInicio}–${dataFim}): ${erro}`)
  }

  const rawData = await response.json() as any[]

  if (!Array.isArray(rawData) || rawData.length === 0) {
    console.log(`[sync_tita_grade] Nenhum registro retornado para ${dataInicio}–${dataFim}`)
    return 0
  }

  // Limpa os registros do período antes de reinserir
  const { error: deleteError } = await supabase
    .from("grade_profissionais_tita")
    .delete()
    .gte("data", dataInicio)
    .lte("data", dataFim)

  if (deleteError) throw deleteError

  const registros = rawData.map((g: any) => ({
    grade_terapeuta_id:         toInt(g.grade_terapeuta_id),
    grade_clinica_id:           toInt(g.grade_clinica_id),
    profissional_id:            toInt(g.profissional_id ?? g.id_profissional),
    nome_profissional:          g.nome_profissional    ?? null,
    cpf_profissional:           g.cpf_profissional     ?? null,
    numero_telefone:            g.numero_telefone      ?? null,
    cbo_profissional:           g.cbo_profissional     ?? null,
    registro_profissional:      g.registro_profissional ?? null,
    tipo_registro_profissional: g.tipo_registro_profissional ?? null,
    uf_registro_profissional:   g.uf_registro_profissional   ?? null,
    id_unidade:                 toInt(g.id_unidade),
    nome_unidade:               g.nome_unidade         ?? null,
    dia_semana:                 g.dia_semana           ?? null,
    data:                       parseTitaDate(g.data),
    hora_inicial:               g.hora_inicial         ?? null,
    hora_final:                 g.hora_final           ?? null,
    status_agendamento:         g.status_agendamento   ?? null,
    terapia_id:                 toInt(g.terapia_id),
    nome_terapia:               g.nome_terapia         ?? null,
    terapia_exibicao_id:        toInt(g.terapia_exibicao_id),
    terapia_exibicao:           g.terapia_exibicao     ?? null,
    id_sala:                    toInt(g.id_sala),
    sala:                       g.sala                 ?? null,
    observacoes_sala:           g.observacoes_sala     ?? null,
    raw_json:                   g,
    updated_at:                 new Date().toISOString(),
  }))

  // TiTa pode retornar o mesmo slot mais de uma vez — deduplicar antes do upsert
  const seen = new Map<string, (typeof registros)[0]>()
  for (const r of registros) {
    const key = `${r.grade_terapeuta_id}|${r.data}|${r.hora_inicial}`
    seen.set(key, r)
  }
  const deduped = Array.from(seen.values())

  for (let i = 0; i < deduped.length; i += 100) {
    const { error } = await supabase
      .from("grade_profissionais_tita")
      .upsert(deduped.slice(i, i + 100), {
        onConflict: "grade_terapeuta_id,data,hora_inicial",
      })
    if (error) throw error
  }

  return registros.length
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST")    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    // body: {} → sincroniza hoje até o último dia útil do mês seguinte
    // body: { "data_inicio": "YYYY-MM-DD", "data_fim": "YYYY-MM-DD" } → período específico
    const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string }
    const { dataInicio, dataFim } = body.data_inicio && body.data_fim
      ? { dataInicio: body.data_inicio, dataFim: body.data_fim }
      : getRangeUntilEndOfNextMonth()

    const total = await sincronizarGrade(dataInicio, dataFim, supabase)
    console.log(`[sync_tita_grade] ${dataInicio}–${dataFim}: ${total} registros`)
    return jsonResponse({ ok: true, dataInicio, dataFim, total }, 200, corsHeaders)
  } catch (err) {
    console.error("[sync_tita_grade] Erro:", err)
    return jsonResponse({ error: String(err) }, 500, corsHeaders)
  }
})
