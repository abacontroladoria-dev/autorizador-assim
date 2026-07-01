import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

function getCorsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
  return allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  })
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === "," && !inQuotes) {
      result.push(current.trim()); current = ""
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function toInt(s: string): number | null {
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

function toTime(s: string): string | null {
  if (!s) return null
  // "08:00" ou "08:00:00"
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:00` : null
}

function getDefaultRange(): { dataInicio: string; dataFim: string } {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0)
  return {
    dataInicio: hoje.toISOString().slice(0, 10),
    dataFim:    fim.toISOString().slice(0, 10),
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const cors   = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405, cors)

  const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string }
  const { dataInicio, dataFim } = body.data_inicio && body.data_fim
    ? { dataInicio: body.data_inicio, dataFim: body.data_fim }
    : getDefaultRange()

  // 1. Busca CSV na API TITA
  const resp = await fetch("https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
    body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim, unidade: 280 }),
  })

  if (!resp.ok) return json({ error: `TITA API retornou ${resp.status}` }, 502, cors)

  const csvText = await resp.text()
  const lines   = csvText.trim().split("\n")
  if (lines.length < 2) return json({ ok: true, total: 0 }, 200, cors)

  // 2. Parseia cabeçalhos (remove BOM)
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿/, "").trim().toLowerCase())
  const col     = (name: string) => headers.indexOf(name)

  const iAgId    = col("id agendamento")
  const iPacId   = col("id favorecido")
  const iPacNome = col("nome favorecido")
  const iData    = col("data")
  const iDiaSem  = col("dia da semana")
  const iHoraIni = col("hora inicial")
  const iHoraFim = col("hora final")
  const iProfId  = col("id profissional")
  const iProfNom = col("profissional")
  const iProfCpf = col("cpf do profissional")
  const iTerID   = col("id terapia")
  const iTerNom  = col("terapia")
  const iTerExId = col("id terapia exibição")
  const iTerExNm = col("terapia exibição")
  const iSalaId  = col("id sala")
  const iSalaNom = col("sala")
  const iSalaObs = col("observações da sala")
  const iUniId   = col("id unidade")
  const iUniNom  = col("nome unidade")
  const iConv    = col("convênio")
  const iStatus  = col("status do agendamento") >= 0 ? col("status do agendamento") : col("status")

  const v = (vals: string[], i: number) => (i >= 0 ? vals[i]?.trim() ?? "" : "")

  // 3. Monta registros
  const registros = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.every(x => !x)) continue
    registros.push({
      tita_agendamento_id:   toInt(v(vals, iAgId)),
      paciente_id:           toInt(v(vals, iPacId)),
      paciente_nome:         v(vals, iPacNome) || null,
      data:                  v(vals, iData)    || null,
      dia_semana:            v(vals, iDiaSem)  || null,
      hora_inicial:          toTime(v(vals, iHoraIni)),
      hora_final:            toTime(v(vals, iHoraFim)),
      profissional_id:       toInt(v(vals, iProfId)),
      profissional_nome:     v(vals, iProfNom) || null,
      profissional_cpf:      v(vals, iProfCpf) || null,
      terapia_id:            toInt(v(vals, iTerID)),
      terapia_nome:          v(vals, iTerNom)  || null,
      terapia_exibicao_id:   toInt(v(vals, iTerExId)),
      terapia_exibicao_nome: v(vals, iTerExNm) || null,
      sala_id:               toInt(v(vals, iSalaId)),
      sala_nome:             v(vals, iSalaNom) || null,
      sala_observacoes:      v(vals, iSalaObs) || null,
      unidade_id:            toInt(v(vals, iUniId)),
      unidade_nome:          v(vals, iUniNom)  || null,
      convenio_nome:         v(vals, iConv)    || null,
      status_agendamento:    v(vals, iStatus)  || null,
      updated_at:            new Date().toISOString(),
    })
  }

  // 4. Persiste no banco: limpa o período e reinsere
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { error: delError } = await sb
    .from("csv_grades_profissionais")
    .delete()
    .gte("data", dataInicio)
    .lte("data", dataFim)

  if (delError) return json({ error: delError.message }, 500, cors)

  for (let i = 0; i < registros.length; i += 500) {
    const { error } = await sb
      .from("csv_grades_profissionais")
      .insert(registros.slice(i, i + 500))
    if (error) return json({ error: error.message }, 500, cors)
  }

  console.log(`[sync-grade-csv] ${dataInicio}–${dataFim}: ${registros.length} registros`)
  return json({ ok: true, total: registros.length, dataInicio, dataFim }, 200, cors)
})
