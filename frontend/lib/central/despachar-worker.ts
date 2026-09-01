import { supabaseService } from '@/lib/supabase/service'
import { processarAgrupamento } from '@/modules/atendimento/workers/agrupamento.worker'
import { processarEnvios } from '@/modules/atendimento/workers/envio.worker'

// ============================================================================
// Despacho do worker logo após o webhook
//
// POR QUE ISTO EXISTE
//
// Sem ele, quem acorda o worker é só o pg_cron. Um cron de 10 segundos põe uma
// espera de 0–10s (média 5s) na frente de CADA resposta, e gasta 8.640 chamadas
// por dia para descobrir que a fila está vazia. Plataformas de atendimento de
// verdade (Chatwoot/Sidekiq, e o mesmo padrão em Intercom e Zendesk) não fazem
// isso: mantêm um consumidor VIVO, bloqueado na fila, que acorda em
// milissegundos quando algo entra.
//
// Não temos Redis nem fila gerenciada nesta infraestrutura, e introduzi-los é um
// projeto de infra. O que dá para fazer com o que existe é aproximar o
// comportamento: a própria entrega da Meta acorda o worker.
//
// POR QUE COM ATRASO, E NÃO IMEDIATO
//
// Chamar o worker no instante da entrega não adiantaria nada: a linha nasce com
// `process_after = now() + 15s` (migration 20260701010000, linha 324) e
// `claim_message_grouping_batch` só reivindica `process_after <= now()`. Um
// despacho imediato encontraria a fila vazia e voltaria de mãos abanando.
//
// Esses 15 segundos são DE PROPÓSITO: gente manda "oi", "queria marcar", "pra
// terça" em três mensagens seguidas, e sem o debounce seriam três turnos e três
// respostas atropelando o responsável. O atraso aqui não é desperdício — é o que
// faz a atendente responder como uma pessoa que esperou a frase terminar.
//
// Então despachamos QUANDO a janela fecha, com uma folga de 1s para o relógio do
// Postgres não estar meio segundo à frente e a linha ainda não estar elegível.
//
// POR QUE EM PROCESSO, E NÃO HTTP PARA SI MESMO
//
// Uma chamada HTTP à própria rota /workers/tick precisaria da URL pública, do
// segredo, e atravessaria o proxy — três coisas que podem falhar e nenhuma que
// acrescenta. As funções dos workers são as MESMAS que a rota do tique chama.
//
// SEGURANÇA CONTRA CONCORRÊNCIA
//
// Este despacho e o pg_cron podem cair no mesmo item ao mesmo tempo. Já está
// coberto: `claim_*_batch` usa FOR UPDATE SKIP LOCKED e lease. Quem chegar
// segundo não vê o item. Nada a inventar aqui — e por isso este arquivo NÃO tem
// lock próprio.
// ============================================================================

// A janela de debounce é de 15s; +1s de folga para o relógio do banco.
const ATRASO_MS = 16_000

// Guarda contra acúmulo: se muitas entregas chegarem juntas, não precisamos de
// um timer para cada. Um despacho pendente já vai drenar o lote inteiro.
let despachoPendente: NodeJS.Timeout | null = null

export function despacharWorkerEmBreve(orgId: string): void {
  if (despachoPendente) return

  despachoPendente = setTimeout(() => {
    despachoPendente = null
    void executar(orgId)
  }, ATRASO_MS)

  // unref: este timer não deve segurar o processo vivo no encerramento. Se o
  // container estiver descendo, o pg_cron pega o item no próximo tique — melhor
  // que atrasar um shutdown.
  despachoPendente.unref?.()
}

async function executar(orgId: string): Promise<void> {
  try {
    // Agrupamento antes de envio, pelo mesmo motivo da rota do tique: o
    // agrupamento ALIMENTA a fila de envio, então a resposta gerada agora sai
    // agora, em vez de esperar o próximo despacho.
    const agrupamento = await processarAgrupamento(supabaseService, orgId)
    const envio = await processarEnvios(supabaseService, orgId)

    // Só registra quando fez alguma coisa. Um log por entrega da Meta poluiria
    // o log a ponto de esconder os erros que importam.
    if (agrupamento.reivindicados > 0 || envio.reivindicados > 0) {
      console.log('[despacho pós-webhook]', { agrupamento, envio })
    }
  } catch (err) {
    // Engolir é deliberado: este despacho é uma ACELERAÇÃO, não o caminho
    // garantido. Se falhar, o pg_cron drena a fila depois. Deixar a exceção
    // subir num setTimeout derrubaria o processo Node inteiro — trocar latência
    // por indisponibilidade seria péssimo negócio.
    console.error('[despacho pós-webhook] falhou; o cron recupera', err)
  }
}
