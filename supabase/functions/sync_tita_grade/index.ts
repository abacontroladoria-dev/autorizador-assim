import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

// Retorna Seg e Sex da semana corrente no fuso de São Paulo
function getWeekRange(): { dataInicio: string; dataFim: string } {
  const agora  = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const dow    = agora.getDay()
  const difSeg = dow === 0 ? -6 : 1 - dow
  const seg    = new Date(agora)
  seg.setDate(agora.getDate() + difSeg)
  const sex = new Date(seg)
  sex.setDate(seg.getDate() + 4)
  return {
    dataInicio: seg.toISOString().slice(0, 10),
    dataFim:    sex.toISOString().slice(0, 10),
  }
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
  const response = await fetch(
    "https://apiv2.apptita.com.br/api/integracao/grade_profissionais",
    {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-INTEGRACAO-TOKEN": TITA_TOKEN,
      },
      body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim }),
    },
  )

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
    grade_terapeuta_id:         g.grade_terapeuta_id   ?? null,
    grade_clinica_id:           g.grade_clinica_id     ?? null,
    profissional_id:            g.profissional_id      ?? g.id_profissional    ?? null,
    nome_profissional:          g.nome_profissional    ?? null,
    cpf_profissional:           g.cpf_profissional     ?? null,
    numero_telefone:            g.numero_telefone      ?? null,
    cbo_profissional:           g.cbo_profissional     ?? null,
    registro_profissional:      g.registro_profissional ?? null,
    tipo_registro_profissional: g.tipo_registro_profissional ?? null,
    uf_registro_profissional:   g.uf_registro_profissional   ?? null,
    id_unidade:                 g.id_unidade           ?? null,
    nome_unidade:               g.nome_unidade         ?? null,
    dia_semana:                 g.dia_semana           ?? null,
    data:                       parseTitaDate(g.data),
    hora_inicial:               g.hora_inicial         ?? null,
    hora_final:                 g.hora_final           ?? null,
    status_agendamento:         g.status_agendamento   ?? null,
    terapia_id:                 g.terapia_id           ?? null,
    nome_terapia:               g.nome_terapia         ?? null,
    terapia_exibicao_id:        g.terapia_exibicao_id  ?? null,
    terapia_exibicao:           g.terapia_exibicao     ?? null,
    id_sala:                    g.id_sala              ?? null,
    sala:                       g.sala                 ?? null,
    observacoes_sala:           g.observacoes_sala     ?? null,
    raw_json:                   g,
    updated_at:                 new Date().toISOString(),
  }))

  for (let i = 0; i < registros.length; i += 100) {
    const { error } = await supabase
      .from("grade_profissionais_tita")
      .insert(registros.slice(i, i + 100))
    if (error) throw error
  }

  return registros.length
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST")    return jsonResponse({ error: "method_not_allowed" }, 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    // body: {} → sincroniza Seg–Sex da semana corrente
    // body: { "data_inicio": "YYYY-MM-DD", "data_fim": "YYYY-MM-DD" } → período específico
    const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string }
    const { dataInicio, dataFim } = body.data_inicio && body.data_fim
      ? { dataInicio: body.data_inicio, dataFim: body.data_fim }
      : getWeekRange()

    const total = await sincronizarGrade(dataInicio, dataFim, supabase)
    console.log(`[sync_tita_grade] ${dataInicio}–${dataFim}: ${total} registros`)
    return jsonResponse({ ok: true, dataInicio, dataFim, total })
  } catch (err) {
    console.error("[sync_tita_grade] Erro:", err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
