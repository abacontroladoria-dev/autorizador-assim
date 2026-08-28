// ─── Cliente HTTP TiTa — agendamento-terapia-tita ─────────────────────────────
// Stub de integração com a API TiTa.
// Endpoint alvo: POST https://apiv2.apptita.com.br/api/integracao/agendamento/create

import type { AgendamentoTitaPayload, TitaApiResult } from "./types.ts"

export const TITA_BASE_URL = "https://apiv2.apptita.com.br/api/integracao"

export async function criarAgendamentoTita(
  payload: AgendamentoTitaPayload,
  titaToken: string,
): Promise<TitaApiResult> {
  throw new Error("not_implemented")
}
