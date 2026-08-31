import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createSystemServices } from '../services'
import { JanelaAtendimentoFechadaError } from '../providers/meta-waba.provider'

// ============================================================================
// Worker de envio — drena a send_queue pelo MetaWabaProvider
//
// Separado do worker de agrupamento de propósito. Gerar a resposta (OpenAI,
// segundos, caro) e entregá-la (Meta, milissegundos, barato) falham por motivos
// diferentes e em ritmos diferentes. Juntos, uma instabilidade da Meta faria a
// resposta ser REGERADA na retentativa — pagando de novo pelo mesmo texto, e
// possivelmente produzindo um texto diferente do que a conversa já esperava.
//
// Com a fila no meio, a resposta é gerada uma vez e entregue quantas forem
// necessárias.
//
// O ENVIO NÃO PASSA DIRETO PELO PROVIDER: passa por MessageService.send(), que
// persiste a mensagem como 'pending' ANTES de chamar a Meta e confirma com o id
// devolvido depois. É a ordem que a migration 20260810120400 estabeleceu — na
// ordem inversa, uma falha no INSERT deixaria a mensagem no WhatsApp do
// responsável e fora do histórico da clínica, sem rastro de nada.
// ============================================================================

const TAMANHO_LOTE = 10
const ORCAMENTO_MS = 20_000

export interface ResultadoEnvio {
  reivindicados: number
  enviados: number
  falhados: number
  janelaFechada: number
}

interface ItemEnvio {
  id: string
  organization_id: string
  conversation_id: string
  body: string | null
  message_type: string | null
}

export async function processarEnvios(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ResultadoEnvio> {
  const limite = Date.now() + ORCAMENTO_MS
  const r: ResultadoEnvio = { reivindicados: 0, enviados: 0, falhados: 0, janelaFechada: 0 }

  const { data, error } = await supabase.schema('central').rpc(
    'claim_send_queue_batch',
    { p_organization_id: orgId, p_batch_size: TAMANHO_LOTE },
  )
  if (error) throw error

  const itens = (data ?? []) as ItemEnvio[]
  r.reivindicados = itens.length
  if (itens.length === 0) return r

  const { messageService } = createSystemServices()

  for (const item of itens) {
    if (Date.now() > limite) break

    if (!item.body?.trim()) {
      // Nunca deveria acontecer — o agrupamento só enfileira com texto. Se
      // acontecer, é defeito nosso, e enviar mensagem vazia ao responsável é
      // pior que registrar a falha.
      await marcar(supabase, item.id, 'failed', 'item sem corpo')
      r.falhados++
      continue
    }

    try {
      await messageService.send({
        conversationId: item.conversation_id,
        body: item.body,
        messageType: item.message_type ?? 'text',
        // A marca de que foi a IA que falou. É o que a Central usa para
        // distinguir, na tela, a resposta automática da fala da recepcionista.
        sentByAi: true,
      })

      await marcar(supabase, item.id, 'completed', null)
      r.enviados++

    } catch (err) {
      if (err instanceof JanelaAtendimentoFechadaError) {
        // NÃO é falha de sistema: é regra da Meta. Retentar reproduz a mesma
        // recusa até esgotar max_attempts, gastando tentativas por um motivo
        // que não muda com o tempo. Cancelado, e a conversa fica para um humano
        // que pode disparar um template aprovado.
        await marcar(supabase, item.id, 'cancelled', err.message)
        r.janelaFechada++
        console.warn('[worker envio] janela de 24h fechada', {
          conversationId: item.conversation_id,
        })
        continue
      }

      // Demais falhas ficam 'pending' para o lease devolver: instabilidade da
      // Meta costuma passar, e a resposta já está gerada e paga.
      const motivo = err instanceof Error ? err.message : String(err)
      await devolver(supabase, item.id, motivo)
      r.falhados++
      console.error('[worker envio] falha ao enviar', {
        conversationId: item.conversation_id, motivo,
      })
    }
  }

  return r
}

async function marcar(
  supabase: SupabaseClient,
  id: string,
  status: 'completed' | 'failed' | 'cancelled',
  motivo: string | null,
): Promise<void> {
  await supabase
    .schema('central')
    .from('send_queue')
    .update({
      status,
      ...(status === 'completed' ? { sent_at: new Date().toISOString() } : {}),
      ...(motivo ? { error_message: motivo.slice(0, 500) } : {}),
    })
    .eq('id', id)
}

// Devolve à fila com espera crescente. `retry_count` conta retentativa de
// NEGÓCIO (a Meta recusou), distinta de `attempts`, que conta reivindicação por
// worker — a migration 20260810120000 separa as duas porque `retry_count` alto
// indica provider instável e `attempts` alto indica worker instável. Somá-las
// esconderia o segundo diagnóstico.
async function devolver(
  supabase: SupabaseClient,
  id: string,
  motivo: string,
): Promise<void> {
  const { data } = await supabase
    .schema('central')
    .from('send_queue')
    .select('retry_count')
    .eq('id', id)
    .maybeSingle()

  const tentativas = ((data as { retry_count?: number } | null)?.retry_count ?? 0) + 1
  // 30s, 60s, 120s, 240s… com teto de 10 minutos.
  const esperaMs = Math.min(30_000 * 2 ** (tentativas - 1), 600_000)

  await supabase
    .schema('central')
    .from('send_queue')
    .update({
      status: 'pending',
      claimed_at: null,
      retry_count: tentativas,
      scheduled_at: new Date(Date.now() + esperaMs).toISOString(),
      error_message: motivo.slice(0, 500),
    })
    .eq('id', id)
}
