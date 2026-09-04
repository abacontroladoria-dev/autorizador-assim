// Status, prioridade e alerta do Controle de Prazos do PDI — regras replicadas
// 1:1 da planilha Excel `Controle_Prazos_PDI pronto 2.0` (colunas "Status",
// "Prioridade" e "Alerta (7 dias)"), decididas com o usuário no plano.
//
// Módulo PURO: `hoje` é sempre parâmetro (nunca `new Date()` aqui dentro), e
// datas são strings ISO comparadas lexicograficamente — mesmo padrão de
// lib/laudos/filtros.ts (`diasAteValidade`).

export type StatusPdi =
  | "Dentro do prazo"
  | "Aguardando Implementação"
  | "Atrasado"
  | "Próximo do prazo"

export type PrioridadePdi = "Alta" | "Média" | "Neutra"

/** Janela de "Próximo do prazo": 7 dias corridos ou menos até o fechamento. */
export const DIAS_ALERTA_PRAZO = 7

export interface EntradaStatusPdi {
  /** `prazoFechamento` calculado (null quando não há `dataAvaliacao` ainda). */
  prazoFechamento: string | null
  /** Hoje, ISO (`AAAA-MM-DD`) — de fora, nunca do relógio local. */
  hoje: string
}

/**
 * Regra dos QUATRO status, ponto final (decisão do usuário, 05/09/2026 —
 * substitui a regra 1:1 do Excel original, que tinha uma 5ª condição
 * ["Data de validade" preenchida sobrepunha atraso] removida por confundir:
 * um PDI cujo Prazo Fechamento já passou é "Atrasado", mesmo com Data de
 * validade preenchida — `dataValidade` não entra mais nesta conta):
 *
 *   1. Sem `prazoFechamento` (porque ainda não há `dataAvaliacao`) →
 *      "Aguardando Implementação" — não há prazo a contar.
 *   2. `hoje` depois do `prazoFechamento` → "Atrasado".
 *   3. `diasRestantes <= DIAS_ALERTA_PRAZO` → "Próximo do prazo".
 *   4. Senão → "Dentro do prazo".
 */
export function calcularStatus({ prazoFechamento, hoje }: EntradaStatusPdi): StatusPdi {
  if (!prazoFechamento) return "Aguardando Implementação"
  if (hoje > prazoFechamento) return "Atrasado"

  const dias = diasRestantes(prazoFechamento, hoje)
  if (dias !== null && dias <= DIAS_ALERTA_PRAZO) return "Próximo do prazo"

  return "Dentro do prazo"
}

/** Atrasado → Alta, Próximo do prazo → Média, senão → Neutra. */
export function calcularPrioridade(status: StatusPdi): PrioridadePdi {
  if (status === "Atrasado") return "Alta"
  if (status === "Próximo do prazo") return "Média"
  return "Neutra"
}

/**
 * Dias corridos de `hoje` até `prazoFechamento` (negativo se já passou).
 * `null` sem prazo — "sem prazo" não é "vence em N dias".
 *
 * `Date.UTC` sobre os componentes separados da string, e não `new Date(iso)`:
 * mesmo raciocínio de `diasAteValidade` em lib/laudos/filtros.ts.
 */
export function diasRestantes(prazoFechamento: string | null, hoje: string): number | null {
  if (!prazoFechamento) return null
  const [anoP, mesP, diaP] = prazoFechamento.split("-").map(Number)
  const [anoH, mesH, diaH] = hoje.split("-").map(Number)
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.round(
    (Date.UTC(anoP, mesP - 1, diaP) - Date.UTC(anoH, mesH - 1, diaH)) / msPorDia,
  )
}

// `calcularAlerta` (badge "ATRASADO"/"ALERTA: vence em breve"/"OK") foi
// REMOVIDA (pedido do usuário, 05/09/2026): era 100% derivada de `status`, e
// por isso só duplicava a mesma informação — "Atrasado" já se sabe pelo
// Status, sem precisar de um terceiro conceito. O aviso de "Próximo do
// prazo" continua existindo no card, só que lido direto de `status ===
// "Próximo do prazo"` (mais `diasRestantes`), sem passar por essa função.
