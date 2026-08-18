import type { StatusSolicitacaoCompra } from "@/lib/insumos/tipos"

// Acesso do cliente à API de insumos.
//
// Vai por `fetch` nas rotas de `app/api/insumos/`, e NÃO direto ao Supabase como
// os outros services do projeto. O motivo: as escritas passam pelas RPCs de
// 20260818090000 e por validação de DTO no servidor — se a tela chamasse o
// Supabase direto, ela pularia essa validação e a auditoria.
//
// Leitura poderia ir direto (a RLS protege), mas ficaria com dois caminhos para o
// mesmo dado e dois formatos de resposta. Um caminho só.

const BASE = "/api/insumos"

/**
 * Header que diz em qual empresa a escrita acontece. O servidor (extrairAtor)
 * só aceita empresa em que o usuário tem vínculo ativo, então isto é escolha,
 * não autorização — a fronteira é a RLS.
 */
export const HEADER_EMPRESA = "x-empresa-id"

function cabecalhoEmpresa(empresaId?: string): Record<string, string> {
  return empresaId ? { [HEADER_EMPRESA]: empresaId } : {}
}

export type EmpresaVinculada = {
  id: string
  nomeFantasia: string
  padrao: boolean
}

export async function listarEmpresas(): Promise<EmpresaVinculada[]> {
  return pedir<EmpresaVinculada[]>(`${BASE}/empresas`)
}

export type ErroApi = { code: string; message: string }

/**
 * As rotas respondem `{ data }` no sucesso e `{ error: { code, message } }` no
 * erro (helpers de lib/central/response). Este envelope desempacota e transforma
 * erro em exceção, para a tela usar try/catch em vez de checar shape.
 */
async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (resposta.status === 204) return undefined as T

  const corpo = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    const erro = (corpo as { error?: ErroApi } | null)?.error
    throw new Error(erro?.message ?? `Falha na requisição (${resposta.status})`)
  }

  return (corpo as { data: T }).data
}

export type SolicitacaoLista = {
  id: string
  empresa_id: string
  setor: string
  categoria: string
  categoria_outro: string | null
  prioridade: string
  status: StatusSolicitacaoCompra
  nome_item: string
  descricao_detalhada: string
  quantidade: string | number
  unidade_medida: string
  valor_maximo_estimado: string | number | null
  prazo_maximo_entrega_dias: number | null
  solicitante_id: string
  solicitante_externo_nome: string | null
  data_solicitacao: string
  criado_em: string
  atualizado_em: string
  solicitante: { nome: string } | null
  empresa: { nome_fantasia: string } | null
  item_padrao: { nome: string } | null
}

export async function listarSolicitacoes(params?: {
  status?: StatusSolicitacaoCompra
  limit?: number
  offset?: number
}): Promise<SolicitacaoLista[]> {
  const query = new URLSearchParams()
  if (params?.status) query.set("status", params.status)
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  if (params?.offset !== undefined) query.set("offset", String(params.offset))

  const sufixo = query.toString() ? `?${query}` : ""
  return pedir<SolicitacaoLista[]>(`${BASE}/solicitacoes${sufixo}`)
}

export async function buscarSolicitacao(id: string): Promise<Record<string, unknown>> {
  return pedir<Record<string, unknown>>(`${BASE}/solicitacoes/${id}`)
}

export async function criarSolicitacao(
  corpo: unknown,
  empresaId?: string
): Promise<{ id: string }> {
  return pedir<{ id: string }>(`${BASE}/solicitacoes`, {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: cabecalhoEmpresa(empresaId),
  })
}

export async function atualizarSolicitacao(id: string, corpo: unknown): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}`, { method: "PATCH", body: JSON.stringify(corpo) })
}

export async function excluirSolicitacao(id: string): Promise<void> {
  await pedir<void>(`${BASE}/solicitacoes/${id}`, { method: "DELETE" })
}

// ── Ações do fluxo ──────────────────────────────────────────────────────────
// Todas devolvem a solicitação já com o status novo, então a tela não precisa
// refazer o GET para saber onde parou.

export async function pausarSolicitacao(id: string, motivo?: string): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/pausar`, {
    method: "POST",
    body: JSON.stringify({ motivo: motivo ?? null }),
  })
}

export async function retomarSolicitacao(id: string): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/retomar`, { method: "POST" })
}

export async function reenviarParaCotacao(id: string): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/reprocessar-cotacao`, { method: "POST" })
}

export async function decidirAprovacao(id: string, corpo: unknown): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/aprovacao`, {
    method: "POST",
    body: JSON.stringify(corpo),
  })
}

export async function criarCotacaoManual(id: string, corpo: unknown): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/cotacoes`, {
    method: "POST",
    body: JSON.stringify(corpo),
  })
}

export async function registrarCompra(id: string, corpo: unknown): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/compra`, {
    method: "POST",
    body: JSON.stringify(corpo),
  })
}

export async function confirmarEntrega(id: string): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/entrega`, { method: "POST" })
}

export async function alterarStatus(
  id: string,
  status: StatusSolicitacaoCompra,
  observacao?: string
): Promise<unknown> {
  return pedir(`${BASE}/solicitacoes/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status, observacao: observacao ?? null }),
  })
}
