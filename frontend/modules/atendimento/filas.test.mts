// Exercita as garantias de integridade das filas da Central contra o Supabase
// LOCAL. Sem LLM, sem provider, sem rede externa.
//
// O que cada teste prova, e por que importa:
//   1. Worker que morre no meio não deixa a mensagem órfã — o lease a devolve.
//   2. Item que falha sempre não gira para sempre — vira 'failed' com motivo.
//   3. A limpeza automática não apaga 'failed'.
//   4. Reentrega de webhook não duplica linha na fila.
//   5. Duas entregas SIMULTÂNEAS não estouram: uma linha, sem exceção.
//   6. Apagar contato com envio pendente falha em vez de apagar em silêncio.
//   7. Mensagem e anexo nascem juntos ou não nascem.
//
// Rodar com a stack local de pé:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<service role local> \
//   npx tsx modules/atendimento/filas.test.mts

import { createClient } from '@supabase/supabase-js'
import { MessageRepository }      from './repositories/message.repository.js'
import { ConversationRepository } from './repositories/conversation.repository.js'
import { ContactRepository }      from './repositories/contact.repository.js'
import { AuditRepository }        from './repositories/audit.repository.js'
import { MessageService }         from './services/message.service.js'
import { caEventBus }             from './events/event-bus.js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = 'a0000000-0000-0000-0000-000000000001'

if (!KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY (use a chave da stack LOCAL).')
  process.exit(1)
}
if (!URL.includes('127.0.0.1') && !URL.includes('localhost')) {
  console.error(`Recusando rodar contra ${URL}: este teste grava e apaga dados, use a stack local.`)
  process.exit(1)
}

let falhas = 0
function checar(cond: boolean, desc: string, extra?: unknown) {
  if (cond) console.log(`  ok    ${desc}`)
  else {
    falhas++
    console.log(`  FALHA ${desc}`)
    if (extra !== undefined) console.log('        ', JSON.stringify(extra).slice(0, 400))
  }
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const central = () => sb.schema('central') as any

const MARCA = 'teste-filas-automatizado'

// ids criados, para limpeza na ordem inversa das FKs
let inboxId = '', channelId = '', contactId = '', conversationId = ''

async function inserir(tabela: string, valores: Record<string, unknown>) {
  const { data, error } = await central().from(tabela).insert(valores).select().single()
  if (error) throw new Error(`insert em ${tabela}: ${error.message}`)
  return data
}

try {
  // ---------------------------------------------------------------------------
  // Fixture
  // ---------------------------------------------------------------------------
  console.log('0. montando fixture')
  inboxId = (await inserir('inboxes', { organization_id: ORG, name: `${MARCA}-inbox` })).id
  channelId = (await inserir('channels', {
    organization_id: ORG, inbox_id: inboxId, name: `${MARCA}-canal`,
    provider: 'meta_waba', channel_type: 'whatsapp', active: true, status: 'active',
  })).id
  contactId = (await inserir('contacts', {
    organization_id: ORG, name: `${MARCA}-contato`, display_phone: '+5511999990000',
  })).id
  conversationId = (await inserir('conversations', {
    organization_id: ORG, inbox_id: inboxId, channel_id: channelId,
    contact_id: contactId, status: 'open',
  })).id
  checar(!!conversationId, 'fixture criada (inbox, canal, contato, conversa)')

  // ---------------------------------------------------------------------------
  // 1. Lease: item de worker morto volta a ser reivindicável
  // ---------------------------------------------------------------------------
  console.log('\n1. lease devolve item de worker que morreu')
  const item = await inserir('message_grouping_queue', {
    organization_id: ORG,
    whatsapp_message_id: `wamid.${MARCA}.1`,
    phone_number_id: '000',
    message_data: { texto: 'oi' },
    process_after: new Date(Date.now() - 1000).toISOString(),
  })

  const c1 = await central().rpc('claim_message_grouping_batch', {
    p_organization_id: ORG, p_batch_size: 10,
  })
  checar(c1.data?.length === 1, 'primeira reivindicação pega o item', c1.error ?? c1.data?.length)
  checar(c1.data?.[0]?.status === 'processing', "status vira 'processing'", c1.data?.[0]?.status)
  checar(c1.data?.[0]?.attempts === 1, 'attempts = 1', c1.data?.[0]?.attempts)

  // Sem concluir: é exatamente o que um worker que morre deixa para trás.
  const c2 = await central().rpc('claim_message_grouping_batch', {
    p_organization_id: ORG, p_batch_size: 10,
  })
  checar(c2.data?.length === 0, 'dentro do lease o item NÃO é reivindicado de novo', c2.data?.length)

  // Envelhece a reivindicação para simular o lease vencendo.
  await central().from('message_grouping_queue')
    .update({ claimed_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    .eq('id', item.id)

  const c3 = await central().rpc('claim_message_grouping_batch', {
    p_organization_id: ORG, p_batch_size: 10,
  })
  checar(c3.data?.length === 1, 'lease vencido devolve o item', c3.data?.length)
  checar(c3.data?.[0]?.attempts === 2, 'attempts = 2 na retomada', c3.data?.[0]?.attempts)

  // ---------------------------------------------------------------------------
  // 2. Esgotamento vira 'failed', não reivindicação infinita
  // ---------------------------------------------------------------------------
  console.log('\n2. esgotar max_attempts sepulta o item')
  await central().from('message_grouping_queue')
    .update({
      attempts: 5, max_attempts: 5, status: 'processing',
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    })
    .eq('id', item.id)

  const c4 = await central().rpc('claim_message_grouping_batch', {
    p_organization_id: ORG, p_batch_size: 10,
  })
  checar(c4.data?.length === 0, 'item esgotado não é reivindicado', c4.data?.length)

  const { data: sepultado } = await central()
    .from('message_grouping_queue').select('status, error_message').eq('id', item.id).single()
  checar(sepultado?.status === 'failed', "vira 'failed'", sepultado?.status)
  checar(/max_attempts/.test(sepultado?.error_message ?? ''),
    'error_message explica o esgotamento', sepultado?.error_message)

  // ---------------------------------------------------------------------------
  // 3. A limpeza não apaga 'failed'
  // ---------------------------------------------------------------------------
  console.log('\n3. cleanup preserva failed e apaga completed')
  const concluido = await inserir('message_grouping_queue', {
    organization_id: ORG,
    whatsapp_message_id: `wamid.${MARCA}.concluido`,
    phone_number_id: '000',
    message_data: {},
    status: 'completed',
  })
  // Janela negativa em vez de envelhecer as linhas: o trigger set_updated_at
  // reescreve updated_at = now() em todo UPDATE, então tentar plantar uma data
  // antiga não funciona — e um cleanup que não apaga nada faria o teste passar
  // por engano. Com -1 dia o corte vai para o futuro e TODA linha entra na
  // janela, o que isola exatamente o que se quer provar: o que protege o
  // 'failed' é o filtro de status, não a idade.
  const limpeza = await central().rpc('cleanup_processed_queues', { p_older_than_days: -1 })
  checar(!limpeza.error, 'cleanup executa', limpeza.error)
  checar((limpeza.data ?? 0) >= 1, 'cleanup relata linhas apagadas', limpeza.data)

  const { data: aindaFailed } = await central()
    .from('message_grouping_queue').select('id').eq('id', item.id).maybeSingle()
  checar(!!aindaFailed, "item 'failed' SOBREVIVEU à limpeza")

  const { data: aindaCompleted } = await central()
    .from('message_grouping_queue').select('id').eq('id', concluido.id).maybeSingle()
  checar(!aindaCompleted, "item 'completed' foi apagado")

  // A fila morta é visível
  const { data: mortos } = await central()
    .from('queue_dead_letter_overview').select('*').eq('organization_id', ORG)
  checar((mortos?.length ?? 0) >= 1, 'queue_dead_letter_overview mostra o item falhado', mortos?.length)

  // ---------------------------------------------------------------------------
  // 4. Reentrega de webhook não duplica linha de fila
  // ---------------------------------------------------------------------------
  console.log('\n4. mesmo whatsapp_message_id não entra duas vezes')
  const wamid = `wamid.${MARCA}.reentrega`
  await inserir('message_grouping_queue', {
    organization_id: ORG, whatsapp_message_id: wamid,
    phone_number_id: '000', message_data: {},
  })
  const dupe = await central().from('message_grouping_queue').insert({
    organization_id: ORG, whatsapp_message_id: wamid,
    phone_number_id: '000', message_data: {},
  })
  checar(dupe.error?.code === '23505', 'segunda inserção é recusada pelo índice único', dupe.error?.code)

  // É assim que o webhook vai enfileirar: sem erro, sem duplicar.
  const ignorada = await central().from('message_grouping_queue')
    .upsert(
      { organization_id: ORG, whatsapp_message_id: wamid, phone_number_id: '000', message_data: {} },
      { onConflict: 'organization_id,whatsapp_message_id', ignoreDuplicates: true },
    )
  checar(!ignorada.error, 'upsert com ignoreDuplicates absorve a reentrega sem erro', ignorada.error)

  const { count } = await central().from('message_grouping_queue')
    .select('id', { count: 'exact', head: true }).eq('whatsapp_message_id', wamid)
  checar(count === 1, 'segue existindo exatamente uma linha', count)

  // ---------------------------------------------------------------------------
  // 5. Entrega SIMULTÂNEA do mesmo webhook: uma mensagem, sem exceção
  // ---------------------------------------------------------------------------
  console.log('\n5. duas entregas simultâneas da mesma mensagem')
  const msgRepo = new MessageRepository(sb as any)
  const service = new MessageService(
    msgRepo,
    new ConversationRepository(sb as any),
    new ContactRepository(sb as any),
    new AuditRepository(sb as any),
    caEventBus,
    // receive() não usa provider; o stub garante que um uso acidental apareça.
    { get: () => { throw new Error('provider não deve ser usado em receive()') } } as any,
    sb as any,
  )

  const extId = `wamid.${MARCA}.corrida`
  const entrada = {
    conversationId, orgId: ORG, externalMessageId: extId,
    messageType: 'text', body: 'mensagem duplicada', provider: 'meta_waba' as const,
  }
  const [a, b] = await Promise.all([service.receive(entrada), service.receive(entrada)])
  checar(!!a?.id && !!b?.id, 'as duas chamadas retornam mensagem (nenhuma lançou)')
  checar(a.id === b.id, 'e retornam A MESMA mensagem', { a: a?.id, b: b?.id })

  const { count: nMsg } = await central().from('messages')
    .select('id', { count: 'exact', head: true }).eq('external_message_id', extId)
  checar(nMsg === 1, 'existe exatamente uma linha em messages', nMsg)

  // ---------------------------------------------------------------------------
  // 6. Apagar contato com envio pendente falha em vez de apagar em silêncio
  // ---------------------------------------------------------------------------
  console.log('\n6. FK RESTRICT protege envio pendente')
  await inserir('send_queue', {
    organization_id: ORG, conversation_id: conversationId, contact_id: contactId,
    body: 'resposta que ainda não saiu',
  })
  const delContato = await central().from('contacts').delete().eq('id', contactId)
  checar(delContato.error?.code === '23503',
    'DELETE do contato é recusado por FK (23503), não apaga a fila', delContato.error?.code)

  const { count: nFila } = await central().from('send_queue')
    .select('id', { count: 'exact', head: true }).eq('contact_id', contactId)
  checar(nFila === 1, 'o envio pendente continua na fila', nFila)

  // ---------------------------------------------------------------------------
  // 7. Mensagem e anexo: atômicos
  // ---------------------------------------------------------------------------
  console.log('\n7. mensagem com anexo é transacional')
  const comAnexo = await msgRepo.createWithAttachments(
    {
      organization_id: ORG, conversation_id: conversationId,
      external_message_id: `wamid.${MARCA}.audio`,
      direction: 'inbound', message_type: 'audio', body: undefined,
      provider: 'meta_waba', status: 'delivered',
    },
    [{
      organization_id: ORG, message_id: '',
      external_url: 'https://exemplo/audio.ogg', file_type: 'audio/ogg',
      storage_status: 'pending', duration_secs: 7,
    }],
  )
  checar(!!comAnexo?.id, 'mensagem de áudio criada', comAnexo?.id)
  const { data: anexos } = await central()
    .from('message_attachments').select('id, duration_secs, message_id').eq('message_id', comAnexo.id)
  checar(anexos?.length === 1, 'anexo nasceu junto', anexos?.length)
  checar(anexos?.[0]?.duration_secs === 7, 'duração preservada', anexos?.[0]?.duration_secs)

  // Anexo inválido derruba a mensagem toda — é o ponto da transação.
  let rolou = false
  try {
    await msgRepo.createWithAttachments(
      {
        organization_id: ORG, conversation_id: conversationId,
        external_message_id: `wamid.${MARCA}.rollback`,
        direction: 'inbound', message_type: 'audio', provider: 'meta_waba',
      },
      // file_size não-numérico: a conversão explode DENTRO da função
      [{ organization_id: ORG, message_id: '', external_url: 'x', file_size: 'abc' as any }],
    )
  } catch {
    rolou = true
  }
  checar(rolou, 'anexo inválido faz a chamada falhar')
  const { count: nRollback } = await central().from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('external_message_id', `wamid.${MARCA}.rollback`)
  checar(nRollback === 0, 'e a mensagem NÃO ficou órfã no banco', nRollback)

} finally {
  // ---------------------------------------------------------------------------
  // Limpeza, na ordem que as FKs exigem
  // ---------------------------------------------------------------------------
  console.log('\nlimpando')
  await central().from('send_queue').delete().eq('organization_id', ORG)
  await central().from('message_grouping_queue').delete().eq('organization_id', ORG)
  if (conversationId) {
    await central().from('message_attachments').delete().eq('organization_id', ORG)
    await central().from('messages').delete().eq('conversation_id', conversationId)
    await central().from('conversation_events').delete().eq('conversation_id', conversationId)
    await central().from('conversations').delete().eq('id', conversationId)
  }
  if (contactId)  await central().from('contacts').delete().eq('id', contactId)
  if (channelId)  await central().from('channels').delete().eq('id', channelId)
  if (inboxId)    await central().from('inboxes').delete().eq('id', inboxId)
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} ASSERÇÃO(ÕES) FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
