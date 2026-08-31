// Verifica o laço de tool calling com provider e ferramentas dublês. Não gasta
// token, não toca banco:
//
//   npx tsx --conditions react-server modules/atendimento/agente/orquestrador.test.mts
//
// (a flag é necessária porque o orquestrador importa 'server-only', cujo
// index.js lança por design; sob a condição react-server ele resolve para um
// módulo vazio, que é o que o Next usa no bundle do servidor.)
//
// O que se prova, e por que:
//
//   1. O CAMINHO FELIZ de ponta a ponta, incluindo a ordem exigida pela API
//      (assistant com tool_calls ANTES das mensagens tool que os respondem).
//   2. OS TETOS — repetição e MAX_ITERACOES. São a garantia de custo do turno:
//      sem eles um modelo travado gira cobrando por volta.
//   3. JSON INVÁLIDO não derruba o turno, volta ao modelo como recusa.
//   4. CADA CLASSE DE ERRO produz a reação certa. Rate limit virando 'escalar'
//      faria o sistema desistir quando bastava esperar; recusa virando
//      'aguardar' faria retentar contra credencial que não vai melhorar.
//   5. NENHUM CAMINHO TERMINA EM SILÊNCIO — a regra do arquivo.
//   6. O INTERRUPTOR de agendamento realmente impede o modelo de escrever.
//
// Sem framework, como os outros testes do módulo.

import { executarTurno, __MAX_ITERACOES, type DepsTurno } from './orquestrador.js'
import type { FerramentasAgente, ResultadoFerramenta } from './ferramentas.js'
import {
  LlmRateLimitError,
  LlmTimeoutError,
  LlmRecusadoError,
  LlmConfiguracaoError,
  LlmBudgetExceededError,
  LlmProviderError,
} from '../llm/erros.js'
import type { LLMProvider, LlmResposta, LlmRequisicao, LlmMensagem } from '../llm/tipos.js'

let falhas = 0
function checar(condicao: boolean, descricao: string, extra?: unknown) {
  if (condicao) {
    console.log(`  ok   ${descricao}`)
  } else {
    falhas++
    console.error(`  FALHA ${descricao}`)
    if (extra !== undefined) console.error('        ', extra)
  }
}

const USO = { modelo: 'gpt-4o-mini', tokensEntrada: 10, tokensSaida: 5 }

function resposta(parcial: Partial<LlmResposta>): LlmResposta {
  return {
    conteudo: null,
    chamadas: [],
    uso: USO,
    motivoParada: 'stop',
    latenciaMs: 1,
    ...parcial,
  }
}

// Provider dublê: devolve o roteiro em ordem; se acabar, repete o último.
// Guarda as requisições para inspeção.
function providerDe(roteiro: (LlmResposta | Error)[]): {
  provider: LLMProvider
  requisicoes: LlmRequisicao[]
} {
  const requisicoes: LlmRequisicao[] = []
  let i = 0
  return {
    requisicoes,
    provider: {
      nome: 'duble',
      async chat(req) {
        requisicoes.push(req)
        const passo = roteiro[Math.min(i, roteiro.length - 1)]
        i++
        if (passo instanceof Error) throw passo
        return passo
      },
    },
  }
}

// Ferramentas dublê: registra o que foi executado.
function ferramentasDe(
  resultado: ResultadoFerramenta = { ok: true, horarios: [] },
): { ferramentas: FerramentasAgente; executadas: { nome: string; args: unknown }[] } {
  const executadas: { nome: string; args: unknown }[] = []
  return {
    executadas,
    ferramentas: {
      async executar(nome: string, args: unknown) {
        executadas.push({ nome, args })
        return resultado
      },
    } as unknown as FerramentasAgente,
  }
}

const CONTEXTO: LlmMensagem[] = [{ papel: 'system', conteudo: 'Você é a atendente.' }]

function deps(parcial: Partial<DepsTurno>): DepsTurno {
  return {
    provider: providerDe([resposta({ conteudo: 'oi' })]).provider,
    ferramentas: ferramentasDe().ferramentas,
    contexto: CONTEXTO,
    agendamentoHabilitado: true,
    ...parcial,
  }
}

const ENTRADA = {
  orgId: 'org-1',
  conversationId: 'conv-1',
  contactId: 'cont-1',
  textosDoUsuario: ['oi', 'queria marcar'],
}

// ----------------------------------------------------------------------------
console.log('\n1. caminho feliz: uma ida, texto de volta')

{
  const { provider, requisicoes } = providerDe([resposta({ conteudo: 'Bom dia! Como posso ajudar?' })])
  const r = await executarTurno(ENTRADA, deps({ provider }))

  checar(r.tipo === 'responder', 'devolve responder', r)
  checar(r.tipo === 'responder' && r.texto === 'Bom dia! Como posso ajudar?', 'texto preservado')
  checar(r.tipo === 'responder' && r.usos.length === 1, 'contabiliza 1 uso')

  const msgs = requisicoes[0]!.mensagens
  checar(msgs[0]?.papel === 'system', 'contexto vem primeiro')
  checar(
    msgs[1]?.papel === 'user' && msgs[1].conteudo === 'oi\nqueria marcar',
    'as mensagens agrupadas viram UM turno de usuário',
    msgs[1],
  )
}

// ----------------------------------------------------------------------------
console.log('\n2. tool calling: executa e volta ao modelo')

{
  const { provider, requisicoes } = providerDe([
    resposta({
      motivoParada: 'tool_calls',
      chamadas: [{ id: 'c1', nome: 'consultar_horarios_disponiveis', argumentosJson: '{"terapiaId":3}' }],
    }),
    resposta({ conteudo: 'Tenho terça às 9h.' }),
  ])
  const { ferramentas, executadas } = ferramentasDe({ ok: true, horarios: [{ data: '2026-09-01' }] })
  const r = await executarTurno(ENTRADA, deps({ provider, ferramentas }))

  checar(r.tipo === 'responder' && r.texto === 'Tenho terça às 9h.', 'responde após a ferramenta', r)
  checar(executadas.length === 1, 'a ferramenta foi executada uma vez')
  checar(executadas[0]?.nome === 'consultar_horarios_disponiveis', 'nome correto')
  checar(
    JSON.stringify(executadas[0]?.args) === '{"terapiaId":3}',
    'argumentos chegam PARSEADOS ao executor',
    executadas[0]?.args,
  )
  checar(r.tipo === 'responder' && r.usos.length === 2, 'contabiliza os 2 usos (as duas idas custam)')

  // Ordem exigida pela API: o tool_call precisa existir antes do tool result.
  const segunda = requisicoes[1]!.mensagens
  const iAssist = segunda.findIndex((m) => m.papel === 'assistant')
  const iTool = segunda.findIndex((m) => m.papel === 'tool')
  checar(iAssist >= 0 && iTool > iAssist,
    'assistant com tool_calls vem ANTES do resultado (senão a API rejeita o turno)',
    segunda.map((m) => m.papel))
  const tool = segunda[iTool] as { chamadaId?: string; conteudo?: string }
  checar(tool.chamadaId === 'c1', 'o resultado carrega o id da chamada')
  checar(String(tool.conteudo).includes('"ok":true'), 'o resultado da ferramenta é serializado como JSON')
}

// ----------------------------------------------------------------------------
console.log('\n3. teto: repetição exata é laço na SEGUNDA ocorrência')

{
  const mesma = {
    motivoParada: 'tool_calls' as const,
    chamadas: [{ id: 'x', nome: 'consultar_horarios_disponiveis', argumentosJson: '{"terapiaId":3}' }],
  }
  const { provider, requisicoes } = providerDe([resposta(mesma), resposta(mesma)])
  const r = await executarTurno(ENTRADA, deps({ provider }))

  checar(r.tipo === 'escalar' && r.motivo === 'loop', 'repetição vira escalar/loop', r)
  checar(requisicoes.length === 2,
    'para na 2ª ida, não espera o teto de iterações (cada volta extra custa)',
    requisicoes.length)
}

{
  // Mesma ferramenta, argumentos DIFERENTES = progresso legítimo, não laço.
  const { provider } = providerDe([
    resposta({ motivoParada: 'tool_calls', chamadas: [{ id: 'a', nome: 'f', argumentosJson: '{"dia":"terca"}' }] }),
    resposta({ motivoParada: 'tool_calls', chamadas: [{ id: 'b', nome: 'f', argumentosJson: '{"dia":"quarta"}' }] }),
    resposta({ conteudo: 'Quarta tem vaga.' }),
  ])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'responder',
    'mesma ferramenta com argumentos diferentes NÃO é laço (consultar terça e depois quarta é progresso)', r)
}

// ----------------------------------------------------------------------------
console.log('\n4. teto de iterações')

{
  // Argumentos sempre novos, para escapar da detecção de repetição e bater no teto.
  let n = 0
  const provider: LLMProvider = {
    nome: 'duble',
    async chat() {
      n++
      return resposta({
        motivoParada: 'tool_calls',
        chamadas: [{ id: `c${n}`, nome: 'f', argumentosJson: `{"n":${n}}` }],
      })
    },
  }
  const r = await executarTurno(ENTRADA, deps({ provider }))

  checar(r.tipo === 'escalar' && r.motivo === 'loop', 'estourar o teto vira escalar/loop', r)
  checar(n === __MAX_ITERACOES, `foi ao modelo exatamente ${__MAX_ITERACOES} vezes`, n)
  checar(r.tipo === 'escalar' && r.usos.length === __MAX_ITERACOES, 'todos os usos foram contabilizados')
}

// ----------------------------------------------------------------------------
console.log('\n5. JSON inválido nos argumentos volta ao modelo, não derruba o turno')

{
  const { provider, requisicoes } = providerDe([
    resposta({ motivoParada: 'tool_calls', chamadas: [{ id: 'c1', nome: 'f', argumentosJson: '{isto nao e json' }] }),
    resposta({ conteudo: 'Desculpe, pode repetir?' }),
  ])
  const { ferramentas, executadas } = ferramentasDe()
  const r = await executarTurno(ENTRADA, deps({ provider, ferramentas }))

  checar(r.tipo === 'responder', 'o turno continua e responde', r)
  checar(executadas.length === 0, 'a ferramenta NÃO foi executada com lixo')
  const tool = requisicoes[1]!.mensagens.find((m) => m.papel === 'tool') as { conteudo?: string }
  checar(String(tool?.conteudo).includes('argumentos_invalidos'),
    'o modelo recebe a recusa no mesmo formato das ferramentas reais, para reformular',
    tool?.conteudo)
}

{
  // JSON válido que não é objeto: as ferramentas indexam por chave.
  const { provider } = providerDe([
    resposta({ motivoParada: 'tool_calls', chamadas: [{ id: 'c1', nome: 'f', argumentosJson: '"texto"' }] }),
    resposta({ conteudo: 'ok' }),
  ])
  const { ferramentas, executadas } = ferramentasDe()
  await executarTurno(ENTRADA, deps({ provider, ferramentas }))
  checar(executadas.length === 0, 'JSON válido mas não-objeto ("texto") também é recusado')
}

// ----------------------------------------------------------------------------
console.log('\n6. classificação de erro do provider')

{
  const { provider } = providerDe([new LlmRateLimitError(30_000)])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'aguardar', 'rate limit → aguardar (esperar É a reação certa, não é falha)', r)
  checar(r.tipo === 'aguardar' && r.esperarMs === 30_000, 'esperarMs repassado ao worker')
}

{
  const { provider, requisicoes } = providerDe([new LlmTimeoutError(60_000)])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(requisicoes.length === 2, 'timeout é retentado UMA vez', requisicoes.length)
  checar(r.tipo === 'escalar' && r.motivo === 'erro_provider', 'timeout persistente → escalar', r)
}

{
  // Timeout que passa na segunda: prova que a retentativa serve para algo.
  const { provider } = providerDe([new LlmTimeoutError(60_000), resposta({ conteudo: 'consegui' })])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'responder' && r.texto === 'consegui', 'timeout que passa na 2ª tentativa responde normalmente', r)
}

for (const [nome, erro] of [
  ['LlmRecusadoError', new LlmRecusadoError(401, 'chave inválida')],
  ['LlmConfiguracaoError', new LlmConfiguracaoError('falta env', 'OPENAI_API_KEY')],
  ['LlmBudgetExceededError', new LlmBudgetExceededError('conversa', 'teto atingido')],
  ['LlmProviderError', new LlmProviderError('502 bad gateway', 502)],
  ['erro desconhecido', new Error('algo imprevisto')],
] as const) {
  const { provider, requisicoes } = providerDe([erro as Error])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'escalar', `${nome} → escalar`, r)
  checar(requisicoes.length === 1, `${nome} NÃO é retentado`, requisicoes.length)
}

// ----------------------------------------------------------------------------
console.log('\n7. nenhum caminho termina em silêncio')

{
  const { provider } = providerDe([resposta({ motivoParada: 'content_filter', conteudo: 'parcial' })])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'escalar' && r.motivo === 'filtrado',
    'content_filter → escalar (não manda o parcial filtrado ao paciente)', r)
}

{
  const { provider } = providerDe([resposta({ conteudo: null })])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'escalar' && r.motivo === 'sem_texto', 'conteúdo null sem chamadas → escalar', r)
}

{
  const { provider } = providerDe([resposta({ conteudo: '   ' })])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'escalar' && r.motivo === 'sem_texto',
    'texto só de espaços → escalar (nunca enviar mensagem vazia)', r)
}

{
  const { provider } = providerDe([resposta({ motivoParada: 'length', conteudo: null })])
  const r = await executarTurno(ENTRADA, deps({ provider }))
  checar(r.tipo === 'escalar' && String(r.detalhe).includes('truncada'),
    'truncado sem texto → escalar dizendo que foi truncado', r)
}

// ----------------------------------------------------------------------------
console.log('\n8. interruptor de agendamento')

{
  const { provider, requisicoes } = providerDe([resposta({ conteudo: 'oi' })])
  await executarTurno(ENTRADA, deps({ provider, agendamentoHabilitado: true }))
  checar(
    Array.isArray(requisicoes[0]?.ferramentas) && requisicoes[0]!.ferramentas!.length === 6,
    'habilitado: as 6 ferramentas vão ao modelo',
    requisicoes[0]?.ferramentas?.length,
  )
}

{
  const { provider, requisicoes } = providerDe([resposta({ conteudo: 'oi' })])
  await executarTurno(ENTRADA, deps({ provider, agendamentoHabilitado: false }))
  checar(requisicoes[0]?.ferramentas === undefined,
    'desligado: ferramentas undefined — o modelo NEM SABE que poderia agendar (botão de pânico)',
    requisicoes[0]?.ferramentas)
}

// ----------------------------------------------------------------------------
console.log(
  falhas === 0
    ? '\nTodas as asserções passaram.\n'
    : `\n${falhas} asserção(ões) falharam.\n`,
)
process.exit(falhas === 0 ? 0 : 1)
