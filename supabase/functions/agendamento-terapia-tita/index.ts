// ─── agendamento-terapia-tita ──────────────────────────────────────────────────
// Edge function responsável por implantar, na agenda oficial via API TiTa
// (POST /integracao/agendamento/create), sessões aceitas no fluxo de Ocupação de
// Paciente (frontend: cronograma/ocupacao-paciente).
//
// Estado atual: recebe paciente_id + csv_grade_profissional_id (UUID da linha em
// csv_grades_profissionais), valida os parâmetros e busca o registro
// correspondente, retornando-o em JSON. A chamada à API TiTa (payload.ts /
// tita-api.ts) ainda não está conectada a este fluxo.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders, jsonResponse, getEnv } from "./utils.ts"
import type { BuscarGradeRequestBody, BuscarGradeResponseBody, GradeProfissionalRow } from "./types.ts"

const SUPABASE_URL              = getEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY")

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Aceita number ou string numérica (corpo JSON pode enviar qualquer um dos dois)
// e valida que o resultado é um inteiro positivo.
function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

function parseUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST")    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders)

  const body = await req.json().catch(() => null) as Partial<BuscarGradeRequestBody> | null

  const pacienteId            = parsePositiveInt(body?.paciente_id)
  const csvGradeProfissionalId = parseUuid(body?.csv_grade_profissional_id)

  if (pacienteId === null || csvGradeProfissionalId === null) {
    const response: BuscarGradeResponseBody = {
      ok: false,
      error: "invalid_params: paciente_id (inteiro positivo) e csv_grade_profissional_id (UUID) são obrigatórios",
    }
    return jsonResponse(response, 400, corsHeaders)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    // O UUID (coluna id) identifica o registro de forma única e inequívoca —
    // não é preciso combiná-lo com outra coluna para desambiguar.
    //
    // EXCEÇÃO deliberada ao ponto único de leitura (vw_grade_base, migration
    // 20260806110000), gêmea de buscarGradePorId em services/tita/mappings.ts:
    // precisa de `sala_id`, que a view não projeta, e busca UMA linha por chave
    // primária — nada aqui se beneficia da view. Continua na tabela crua.
    const { data, error } = await supabase
      .from("csv_grades_profissionais")
      .select("*")
      .eq("id", csvGradeProfissionalId)
      // Trava de versionamento (migration 20260805160000): o sync não apaga mais, ele
      // marca a versão antiga com ativo=false. Se a TiTa alterou ou removeu este slot
      // depois que a tela foi montada, cair no "grade_not_found" abaixo é o certo —
      // agendar sobre um slot que já não existe criaria atendimento fantasma.
      .eq("ativo", true)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const response: BuscarGradeResponseBody = { ok: false, error: "grade_not_found" }
      return jsonResponse(response, 404, corsHeaders)
    }

    const grade = data as GradeProfissionalRow

    // paciente_id é validado contra o registro encontrado para evitar que um
    // csv_grade_profissional_id correto retorne dados de outro paciente.
    // Tratado como "não encontrado" para não revelar a existência do registro.
    if (grade.paciente_id !== pacienteId) {
      const response: BuscarGradeResponseBody = { ok: false, error: "grade_not_found" }
      return jsonResponse(response, 404, corsHeaders)
    }

    const response: BuscarGradeResponseBody = { ok: true, grade }
    return jsonResponse(response, 200, corsHeaders)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("[agendamento-terapia-tita] Erro ao buscar grade:", errMsg)
    return jsonResponse({ ok: false, error: errMsg }, 500, corsHeaders)
  }
})
