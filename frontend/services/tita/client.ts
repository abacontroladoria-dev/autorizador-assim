import "server-only"

import type {
  AgendaFavorecidoTita,
  AgendamentoTitaPayload,
  DisponibilidadeRequest,
  DisponibilidadeResponse,
  TitaApiResult,
} from "./types"

// Base URL e header confirmados em "Integração - Documentação API TITA.pdf" (seção
// "Configuração de Acesso") e usados de forma consistente em todas as Edge
// Functions do projeto que já integram com a TiTa.
const TITA_BASE_URL = process.env.TITA_API_URL || "https://apiv2.apptita.com.br/api"

function getTitaToken(): string {
  const token = process.env.TITA_TOKEN
  if (!token) throw new Error("Variável de ambiente TITA_TOKEN não configurada")
  return token
}

/**
 * Extrai só a mensagem textual (campo "message") de um corpo de erro da TiTa —
 * nunca repassa error_stack_trace, error_file, error_function ou params, que
 * contêm caminhos internos do servidor deles. Essa é a única parte da resposta
 * de erro que sai de postTita(); o corpo bruto completo só é logado no servidor
 * (console.error), nunca devolvido ao chamador.
 */
function extrairMensagemTita(data: unknown): string | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const msg = (data as Record<string, unknown>).message
    if (typeof msg === "string") return msg
  }
  return typeof data === "string" ? data : undefined
}

// Ponto único de saída para a API TiTa — instrumentado aqui para que payload
// enviado, resposta recebida e tempo de execução fiquem logados para as duas
// chamadas (get_disponibilidade e agendamento/create) sem duplicar código.
async function postTita<T>(path: string, body: unknown): Promise<TitaApiResult<T>> {
  const inicio = Date.now()
  console.log(`[tita:client] → POST ${path}`, JSON.stringify(body))

  const response = await fetch(`${TITA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-INTEGRACAO-TOKEN": getTitaToken(),
    },
    body: JSON.stringify(body),
  })

  let data: unknown = null
  try { data = await response.json() } catch { /* corpo vazio ou não-JSON */ }

  const duracaoMs = Date.now() - inicio

  if (!response.ok) {
    // Corpo bruto (pode conter stack trace/caminhos internos da TiTa) só vai para
    // o log do servidor — nunca é retornado ao chamador (ver extrairMensagemTita).
    console.error(
      `[tita:client] ← POST ${path} falhou (status ${response.status}, ${duracaoMs}ms)`,
      JSON.stringify(data),
    )
    return {
      ok: false,
      status: response.status,
      error: extrairMensagemTita(data) ?? `Erro HTTP ${response.status}`,
    }
  }

  console.log(`[tita:client] ← POST ${path} ok (status ${response.status}, ${duracaoMs}ms)`, JSON.stringify(data))
  return { ok: true, status: response.status, data: data as T }
}

/** POST /integracao/get_disponibilidade — verifica disponibilidade antes de criar o agendamento. */
export function verificarDisponibilidade(payload: DisponibilidadeRequest): Promise<TitaApiResult<DisponibilidadeResponse>> {
  return postTita("/integracao/get_disponibilidade", payload)
}

/** POST /integracao/agendamento/create — cria o agendamento recorrente na TiTa. */
export function criarAgendamento(payload: AgendamentoTitaPayload): Promise<TitaApiResult<AgendaFavorecidoTita[]>> {
  return postTita("/integracao/agendamento/create", payload)
}

