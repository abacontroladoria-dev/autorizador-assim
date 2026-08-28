// ─── Utilitários HTTP e CORS — agendamento-terapia-tita ───────────────────────

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

export function getCorsHeaders(requestOrigin: string): Record<string, string> {
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

export function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

export function getEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}
