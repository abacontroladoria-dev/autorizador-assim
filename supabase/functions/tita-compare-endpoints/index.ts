import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TITA_TOKEN = Deno.env.get("TITA_TOKEN")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const PACIENTES_ALVO = ["isabella", "anny karoline", "phettrus", "heitor lemos"]

function matchesPaciente(texto: string): boolean {
  const lower = texto.toLowerCase()
  return PACIENTES_ALVO.some(p => lower.includes(p))
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let insideQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    if (char === '"') {
      if (insideQuotes && nextChar === '"') { current += '"'; i++ }
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as { data?: string }
  const data = body.data ?? "2026-06-10"

  // ── 1. Endpoint JSON ──────────────────────────────────────────────────────
  const jsonRes = await fetch(
    `https://apiv2.apptita.com.br/api/integracao/agendamento?date=${data}&unidade=280`,
    { headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN } }
  )
  const rawJson = await jsonRes.json() as any[]
  const agendas = rawJson.flatMap((g: any) => g.agenda_favorecido || [])

  const jsonHits = agendas.filter((a: any) =>
    matchesPaciente(a.favorecido?.nome ?? "")
  ).map((a: any) => ({
    id: a.id,
    paciente: a.favorecido?.nome,
    profissional: a.profissional?.name,
    hora: a.hora_inicial,
    terapia: a.terapia?.nome,
    status_raw: a.status ?? a.status_horario ?? a.statusHorario ?? "(sem campo status)",
  }))

  // ── 2. Endpoint CSV ───────────────────────────────────────────────────────
  const csvRes = await fetch(
    "https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
      body: JSON.stringify({ data_inicio: data, data_fim: data, unidade: 280 }),
    }
  )
  const csvText = await csvRes.text()

  const csvLines = csvText.trim().split("\n")
  const csvHeaders = parseCSVLine(csvLines[0]).map(h => h.toLowerCase().trim())
  console.log("[tita-compare] CSV headers:", csvHeaders.join(" | "))

  // Índices úteis
  const iId       = csvHeaders.indexOf("id agendamento") >= 0 ? csvHeaders.indexOf("id agendamento") : csvHeaders.indexOf("id")
  const iPaciente = csvHeaders.indexOf("nome favorecido")
  const iProf     = csvHeaders.indexOf("profissional")
  const iHora     = csvHeaders.indexOf("hora inicial")
  const iTerapia  = csvHeaders.findIndex(h => h.startsWith("terapia"))
  const iStatus   = csvHeaders.findIndex(h => h.includes("status"))
  const iStatusAg = csvHeaders.indexOf("status do agendamento")

  // Todos os valores únicos de status (para entender o vocabulário)
  const todosStatus = new Set<string>()
  const csvHits: any[] = []
  const csvAllStatusValues: any[] = []

  for (let i = 1; i < csvLines.length; i++) {
    const vals = parseCSVLine(csvLines[i])
    const statusVal = iStatusAg >= 0 ? (vals[iStatusAg] ?? "") : (iStatus >= 0 ? (vals[iStatus] ?? "") : "")
    todosStatus.add(statusVal)

    const pacienteNome = iPaciente >= 0 ? (vals[iPaciente] ?? "") : ""
    if (matchesPaciente(pacienteNome)) {
      // Capturar todos os campos para diagnóstico
      const row: Record<string, string> = {}
      csvHeaders.forEach((h, idx) => { row[h] = vals[idx] ?? "" })
      csvHits.push(row)
    }
  }

  // ── 3. Checar se existe endpoint de detalhe (tenta GET /agendamento/{id}) ──
  // Pega o primeiro id_agendamento do CSV dos pacientes afetados (se houver)
  let detalheTest: any = null
  if (csvHits.length > 0 && iId >= 0) {
    const primeiroId = csvHits[0][csvHeaders[iId] || "id agendamento"] ||
                       csvHits[0]["id agendamento"] ||
                       csvHits[0]["id"]
    if (primeiroId) {
      // Tenta GET /agendamento/{id}
      const detRes1 = await fetch(
        `https://apiv2.apptita.com.br/api/integracao/agendamento/${primeiroId}`,
        { headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN } }
      )
      const det1Status = detRes1.status
      const det1Body = await detRes1.text().catch(() => "")

      // Tenta GET /agendamento?id={id}
      const detRes2 = await fetch(
        `https://apiv2.apptita.com.br/api/integracao/agendamento?id=${primeiroId}&unidade=280`,
        { headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN } }
      )
      const det2Status = detRes2.status
      const det2Body = await detRes2.text().catch(() => "").then(t => t.slice(0, 500))

      detalheTest = {
        id_testado: primeiroId,
        "GET /agendamento/{id}": { status: det1Status, body_preview: det1Body.slice(0, 300) },
        "GET /agendamento?id=": { status: det2Status, body_preview: det2Body },
      }
    }
  }

  // ── 4. Montar resposta ────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      data_consultada: data,
      endpoint_json: {
        total_agendas: agendas.length,
        pacientes_afetados_encontrados: jsonHits.length,
        hits: jsonHits,
      },
      endpoint_csv: {
        total_linhas: csvLines.length - 1,
        headers: csvHeaders,
        status_values_unicos: Array.from(todosStatus).sort(),
        pacientes_afetados_encontrados: csvHits.length,
        hits: csvHits,
      },
      endpoint_detalhe_teste: detalheTest,
    }, null, 2),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  )
})
