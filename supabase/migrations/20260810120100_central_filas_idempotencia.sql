-- ============================================================================
-- Filas da Central: idempotência na entrada e na saída
--
-- Os dois lados do mesmo problema — mensagem duplicada. Perder registro é ruim;
-- duplicar registro numa conversa com responsável de paciente também é, porque
-- a duplicata sai como mensagem de verdade no WhatsApp dele.
--
-- ENTRADA — a Meta reentrega webhook.
--   Quando o endpoint demora ou responde 5xx, a Cloud API reenvia o mesmo
--   evento. central.messages já se protege com uq_messages_ext_id, mas a FILA
--   não tinha proteção nenhuma: a mesma mensagem entrava duas vezes em
--   message_grouping_queue, era agrupada duas vezes e gerava duas respostas do
--   agente. O paciente recebia resposta dobrada.
--
-- SAÍDA — retry após aceite do provider.
--   send_queue não guardava o id que a Meta devolve. Um worker que morre entre
--   "a Meta aceitou" e "gravei em central.messages" fazia o reclaim reenviar a
--   mensagem: o responsável recebia o mesmo texto duas vezes, e o histórico
--   registrava uma. Guardando o id na própria linha da fila, o reclaim sabe
--   que o envio já ocorreu e só termina a persistência.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Entrada: um evento do provider ocupa no máximo uma linha de fila.
--
-- Índice total, não parcial: whatsapp_message_id é NOT NULL e a garantia vale
-- para qualquer status. Isso inclui itens já 'completed' — reentrega tardia da
-- Meta (horas depois) não pode reprocessar um recado já respondido.
--
-- Consequência operacional deliberada: reprocessar um item que falhou é
-- devolvê-lo para 'pending' (com attempts = 0), não inserir linha nova.
-- ----------------------------------------------------------------------------
create unique index if not exists uq_grouping_wa_msg
  on central.message_grouping_queue (organization_id, whatsapp_message_id);

comment on index central.uq_grouping_wa_msg is
  'Um evento do provider = uma linha de fila. Absorve a reentrega de webhook da Meta.';

-- ----------------------------------------------------------------------------
-- Saída: a linha da fila carrega o id que o provider devolveu.
--
-- Preenchido ANTES de persistir em central.messages, e é o que o worker
-- consulta ao reivindicar um item que já esteve em processamento: com id
-- presente, o envio não se repete.
-- ----------------------------------------------------------------------------
alter table central.send_queue
  add column if not exists external_message_id text;

comment on column central.send_queue.external_message_id is
  'Id devolvido pelo provider, gravado antes de persistir a mensagem. Presente = já enviado: o reclaim não reenvia.';
