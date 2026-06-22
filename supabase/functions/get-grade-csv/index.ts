import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TITA_TOKEN = Deno.env.get("TITA_TOKEN")!

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
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

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let insideQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else insideQuotes = !insideQuotes
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim()); current = ""
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string }
  const { data_inicio, data_fim } = body

  if (!data_inicio || !data_fim) {
    return jsonResponse({ error: "data_inicio e data_fim são obrigatórios" }, 400, corsHeaders)
  }

  const resp = await fetch("https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
    body: JSON.stringify({ data_inicio, data_fim, unidade: 280 }),
  })

  if (!resp.ok) {
    return jsonResponse({ error: `TITA API retornou ${resp.status}` }, 502, corsHeaders)
  }

  const csvText = await resp.text()
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) {
    return jsonResponse({ rows: [] }, 200, corsHeaders)
  }

  // Remove BOM se presente
  const rawHeaders = parseCSVLine(lines[0])
  const headers = rawHeaders.map(h => h.replace(/^﻿/, "").trim())

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.every(v => !v)) continue
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j]?.trim() ?? ""
    }
    rows.push(row)
  }

  return jsonResponse({ rows }, 200, corsHeaders)
})
