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

// Retorna Seg–Sex da semana corrente no fuso de São Paulo
function getWeekDates(): string[] {
  const agora  = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const dow    = agora.getDay()
  const difSeg = dow === 0 ? -6 : 1 - dow
  const seg    = new Date(agora)
  seg.setDate(agora.getDate() + difSeg)
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(seg)
    d.setDate(seg.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function normalizarDataNascimento(valor: unknown): string | null {
  if (!valor) return null
  const texto = String(valor).trim()
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}`).toISOString().slice(0, 10)
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).toISOString().slice(0, 10)
  return null
}

async function sincronizarData(
  data: string,
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const response = await fetch(
    `https://apiv2.apptita.com.br/api/integracao/agendamento?date=${data}&unidade=280`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-INTEGRACAO-TOKEN": TITA_TOKEN,
      },
    },
  )

  if (!response.ok) {
    const erro = await response.text()
    throw new Error(`TITA API error for ${data}: ${erro}`)
  }

  const rawData = await response.json()

  // Desativa registros anteriores desta data antes do upsert
  await supabase
    .from("agenda_tita")
    .update({ ativo: false })
    .eq("data_atendimento", data)

  const agendas = (rawData as any[]).flatMap((grupo: any) => grupo.agenda_favorecido || [])

  const registros = agendas.map((a: any) => {
    const familiar = a.favorecido?.familiares?.[0]
    const vinculo  = a.favorecido?.vinc_fav_clinica?.[0]
    return {
      tita_agendamento_id:   a.id,
      origem:                a.origem,
      data_atendimento:      a.data?.split("/")?.reverse()?.join("-"),
      hora_inicial:          a.hora_inicial,
      hora_final:            a.hora_final,
      paciente_id:           a.favorecido?.id           ?? null,
      paciente_nome:         a.favorecido?.nome         ?? null,
      cpf:                   a.favorecido?.cpf          ?? null,
      data_nascimento:       normalizarDataNascimento(a.favorecido?.data_nascimento),
      profissional_id:       a.profissional?.id         ?? null,
      profissional_nome:     a.profissional?.name       ?? null,
      profissional_cpf:      a.profissional?.cpf        ?? null,
      terapia_id:            a.terapia?.id              ?? null,
      terapia_nome:          a.terapia?.nome            ?? null,
      terapia_exibicao_id:   a.terapiaExibicao?.id      ?? null,
      terapia_exibicao_nome: a.terapiaExibicao?.nome    ?? null,
      sala_id:               a.sala?.id                 ?? null,
      sala_nome:             a.sala?.nome_sala          ?? null,
      sala_observacoes:      a.sala?.observacoes        ?? null,
      clinica_id:            a.clinica?.id              ?? null,
      clinica_nome:          a.clinica?.nome            ?? null,
      convenio_id:           vinculo?.plano?.id         ?? null,
      convenio_nome:         vinculo?.plano?.nome       ?? null,
      numero_carteirinha:    vinculo?.numero_carteirinha ?? null,
      responsavel_nome:      familiar?.nome             ?? null,
      responsavel_telefone:  familiar?.celular          ?? null,
      responsavel_email:     familiar?.email            ?? null,
      atividade:             a.atividade                ?? null,
      ativo:                 true,
      raw_json:              a,
      updated_at:            new Date().toISOString(),
    }
  })

  for (let i = 0; i < registros.length; i += 100) {
    const { error } = await supabase
      .from("agenda_tita")
      .upsert(registros.slice(i, i + 100), { onConflict: "tita_agendamento_id" })
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
    // body: {} → sincroniza a semana inteira (Seg–Sex corrente)
    // body: { "data": "YYYY-MM-DD" } → sincroniza só aquela data
    const body = await req.json().catch(() => ({})) as { data?: string }
    const datas: string[] = body.data ? [body.data] : getWeekDates()

    const resultados: Record<string, number> = {}
    for (const data of datas) {
      resultados[data] = await sincronizarData(data, supabase)
      console.log(`[sync_tita_agenda] ${data}: ${resultados[data]} registros`)
    }

    console.log("[sync_tita_agenda] Concluído:", resultados)
    return jsonResponse({ ok: true, datas, resultados })
  } catch (err) {
    console.error("[sync_tita_agenda] Erro:", err)
    return jsonResponse({ error: String(err) }, 500)
  }
})
