import { CentralError } from '../types/errors.types'

// ============================================================================
// Erros da camada de LLM
//
// Estendem CentralError, não Error, para entrarem no mesmo mapeamento HTTP que
// o resto do módulo (lib/central/errors.ts) e para que `code` seja estável para
// quem ramifica. Taxonomia paralela obrigaria a duplicar esse mapeamento.
//
// A separação abaixo não é decorativa: cada erro pede uma reação diferente do
// orquestrador, e é por isso que não são um LlmError genérico.
//
//   Configuração  → não adianta retentar; alguém precisa corrigir env
//   RateLimit     → retentar com backoff É a reação correta
//   Timeout       → retentar uma vez; persistir vira escalada ao humano
//   Recusado      → não retentar; o pedido é inválido como está
//   Orcamento     → não retentar NUNCA; retry aqui é gastar o que não há
//   LoopFerramenta→ abortar o turno e escalar; insistir é queimar dinheiro
// ============================================================================

// Env ausente ou inválida. Falha de instalação, não de execução.
export class LlmConfiguracaoError extends CentralError {
  constructor(message: string, public readonly variavel: string) {
    super(message, 'LLM_CONFIG_INVALID', { variavel })
  }
}

// 429. Retentável com backoff — é o caso em que esperar resolve.
export class LlmRateLimitError extends CentralError {
  constructor(public readonly esperarMs: number | null) {
    super(
      'A OpenAI recusou por limite de taxa. Tentar novamente depois.',
      'LLM_RATE_LIMIT',
      { esperarMs },
    )
  }
}

// Estourou o tempo da chamada. Distinto de rate limit: aqui não há indicação de
// quando tentar, e a chamada pode ter sido cobrada mesmo sem resposta útil.
export class LlmTimeoutError extends CentralError {
  constructor(public readonly limiteMs: number) {
    super(`A OpenAI não respondeu em ${limiteMs}ms.`, 'LLM_TIMEOUT', { limiteMs })
  }
}

// 4xx que não é 429: pedido inválido, credencial recusada, modelo inexistente.
// Retentar reproduz o mesmo erro e gasta de novo.
export class LlmRecusadoError extends CentralError {
  constructor(status: number, detalhe: string) {
    super(
      `A OpenAI recusou a requisição (HTTP ${status}): ${detalhe}`,
      'LLM_REQUEST_REJECTED',
      { status, detalhe },
    )
  }
}

// 5xx ou resposta ilegível. Retentável, mas com teto baixo.
export class LlmProviderError extends CentralError {
  constructor(detalhe: string, public readonly status?: number) {
    super(`Falha na OpenAI: ${detalhe}`, 'LLM_PROVIDER_ERROR', { detalhe, status })
  }
}

// Teto de gasto atingido. Deliberadamente NÃO retentável: este erro existe para
// impedir gasto, e um retry o transformaria em decoração.
//
// Implementado na Fase 6 (GuardaOrcamento); declarado aqui para que o
// orquestrador da Fase 3 já ramifique nele em vez de nascer sem o caminho.
export class LlmBudgetExceededError extends CentralError {
  constructor(
    public readonly escopo: 'turno' | 'conversa' | 'organizacao',
    detalhe: string,
  ) {
    super(
      `Teto de consumo de IA atingido (${escopo}): ${detalhe}`,
      'LLM_BUDGET_EXCEEDED',
      { escopo, detalhe },
    )
  }
}

// O modelo repetiu a mesma ferramenta com os mesmos argumentos, ou estourou o
// teto de iterações do turno. Abortar e escalar ao humano.
export class ToolLoopDetectedError extends CentralError {
  constructor(
    public readonly ferramenta: string,
    public readonly iteracoes: number,
  ) {
    super(
      `Laço de ferramenta detectado em '${ferramenta}' após ${iteracoes} iterações.`,
      'LLM_TOOL_LOOP',
      { ferramenta, iteracoes },
    )
  }
}
