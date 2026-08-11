-- ============================================================================
-- send_queue: apagar contato não pode apagar mensagem que não saiu
--
-- As duas FKs vinham com ON DELETE CASCADE:
--   send_queue.contact_id      → contacts
--   send_queue.conversation_id → conversations
--
-- O efeito é silencioso e do tipo pior: apagar um contato remove, sem erro e
-- sem rastro, mensagens que ainda estavam na fila para sair. Ninguém descobre —
-- não há linha em 'failed', não há erro, a fila simplesmente encurta.
--
-- CASCADE faz sentido para o que é PARTE do registro pai (identificadores de um
-- contato, anexos de uma mensagem — esses ficam como estão). Uma mensagem
-- pendente de envio não é parte do contato: é um compromisso nosso com ele.
--
-- Com RESTRICT o DELETE falha e a exclusão passa a exigir decisão explícita:
-- cancelar os envios pendentes primeiro. Na prática não deve acontecer, porque
-- central.contacts usa exclusão lógica (deleted_at) — o que torna o CASCADE
-- ainda mais gratuito como risco.
--
-- Itens antigos não travam exclusão para sempre: cleanup_processed_queues
-- remove 'completed' e 'cancelled' passados N dias. Só 'failed' e pendências
-- reais seguram, e é exatamente o que se quer que segure.
-- ============================================================================

alter table central.send_queue
  drop constraint if exists send_queue_contact_id_fkey,
  drop constraint if exists send_queue_conversation_id_fkey;

alter table central.send_queue
  add constraint send_queue_contact_id_fkey
    foreign key (contact_id) references central.contacts(id)
    on delete restrict,
  add constraint send_queue_conversation_id_fkey
    foreign key (conversation_id) references central.conversations(id)
    on delete restrict;
