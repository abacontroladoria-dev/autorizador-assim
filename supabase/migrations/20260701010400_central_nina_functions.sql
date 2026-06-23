-- Central de Atendimento — Nina Integration: Functions & Triggers
-- M-N05 | Nina Integration Block
-- Depends on:
--   20260701010000_central_nina_tables.sql (central.conversation_states, filas)
--
-- Funções criadas:
--   1. central.get_or_create_conversation_state()  — upsert de estado IA
--   2. central.update_conversation_state()         — atualiza estado + scheduling_context
--   3. central.update_contact_ai_memory()          — merge de memória do contato
--   4. central.claim_message_grouping_batch()      — FOR UPDATE SKIP LOCKED (agrupamento)
--   5. central.claim_send_queue_batch()            — FOR UPDATE SKIP LOCKED (envio)
--   6. central.cleanup_processed_queues()          — purge de itens antigos processados
--
-- Todas as funções usam SECURITY DEFINER + set search_path para evitar
-- SQL injection via search_path manipulation.
--
-- ROLLBACK:
--   drop function if exists central.cleanup_processed_queues(integer);
--   drop function if exists central.claim_send_queue_batch(uuid, integer);
--   drop function if exists central.claim_message_grouping_batch(uuid, integer);
--   drop function if exists central.update_contact_ai_memory(uuid, uuid, jsonb);
--   drop function if exists central.update_conversation_state(uuid, uuid, text, text, jsonb);
--   drop function if exists central.get_or_create_conversation_state(uuid, uuid);

-- ============================================================================
-- FUNCTION: central.get_or_create_conversation_state
--
-- Retorna o registro de conversation_states para a conversa indicada.
-- Se não existir, cria com estado 'idle'.
-- Padrão: INSERT ... ON CONFLICT DO UPDATE (upsert idiomático no PG).
--
-- Uso típico: chamado pelo orquestrador de IA ao receber uma nova mensagem
-- antes de decidir o próximo passo do fluxo.
--
-- Parâmetros:
--   p_organization_id — obrigatório para RLS e particionamento futuro
--   p_conversation_id — conversa cujo estado deve ser recuperado/criado
-- ============================================================================
create or replace function central.get_or_create_conversation_state(
  p_organization_id uuid,
  p_conversation_id uuid
)
returns central.conversation_states
language plpgsql
security definer
set search_path = central, public
as $$
declare
  v_state central.conversation_states;
begin
  insert into central.conversation_states (
    organization_id,
    conversation_id,
    current_state
  )
  values (
    p_organization_id,
    p_conversation_id,
    'idle'
  )
  on conflict (conversation_id) do update
    set updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;

grant execute on function central.get_or_create_conversation_state(uuid, uuid) to service_role;

-- ============================================================================
-- FUNCTION: central.update_conversation_state
--
-- Atualiza o estado da máquina de estados de uma conversa.
-- Registra last_action e opcionalmente atualiza scheduling_context.
--
-- p_scheduling_context: se NULL, preserva o scheduling_context existente.
--   Se passado como '{}' (empty object), limpa o contexto.
--   Permite reset explícito sem ambiguidade.
--
-- Retorna: o registro atualizado (para confirmação pelo caller).
-- ============================================================================
create or replace function central.update_conversation_state(
  p_organization_id     uuid,
  p_conversation_id     uuid,
  p_new_state           text,
  p_last_action         text      default null,
  p_scheduling_context  jsonb     default null
)
returns central.conversation_states
language plpgsql
security definer
set search_path = central, public
as $$
declare
  v_state central.conversation_states;
begin
  update central.conversation_states
  set
    current_state      = p_new_state,
    last_action        = coalesce(p_last_action, last_action),
    last_action_at     = case when p_last_action is not null then now() else last_action_at end,
    scheduling_context = case when p_scheduling_context is not null then p_scheduling_context else scheduling_context end,
    updated_at         = now()
  where
    organization_id  = p_organization_id
    and conversation_id = p_conversation_id
  returning * into v_state;

  if not found then
    raise exception 'conversation_state not found for conversation_id=%', p_conversation_id;
  end if;

  return v_state;
end;
$$;

grant execute on function central.update_conversation_state(uuid, uuid, text, text, jsonb) to service_role;

-- ============================================================================
-- FUNCTION: central.update_contact_ai_memory
--
-- Faz merge da memória de IA do contato com novos dados.
-- Usa o operador || (jsonb concat) para mesclar — chaves novas são adicionadas,
-- chaves existentes são sobrescritas, chaves ausentes são preservadas.
--
-- Para apagar uma chave específica, use jsonb_set + null explícito na aplicação.
-- Para reset completo, passar p_memory_patch como o novo objeto completo
-- após limpar a coluna via UPDATE direto (service_role).
--
-- Equivale à função update_client_memory do Nina.
-- ============================================================================
create or replace function central.update_contact_ai_memory(
  p_organization_id  uuid,
  p_contact_id       uuid,
  p_memory_patch     jsonb
)
returns void
language plpgsql
security definer
set search_path = central, public
as $$
begin
  update central.contacts
  set
    ai_memory  = coalesce(ai_memory, '{}'::jsonb) || p_memory_patch,
    updated_at = now()
  where
    organization_id = p_organization_id
    and id          = p_contact_id
    and deleted_at  is null;

  if not found then
    raise exception 'contact not found or deleted: organization_id=%, contact_id=%',
      p_organization_id, p_contact_id;
  end if;
end;
$$;

grant execute on function central.update_contact_ai_memory(uuid, uuid, jsonb) to service_role;

-- ============================================================================
-- FUNCTION: central.claim_message_grouping_batch
--
-- Reclama um lote de itens da fila de agrupamento para processamento exclusivo.
-- Usa FOR UPDATE SKIP LOCKED para evitar que múltiplos workers processem
-- o mesmo item concorrentemente — padrão seguro para filas no PostgreSQL.
--
-- Condições de elegibilidade:
--   status = 'pending'
--   process_after <= now()  (delay expirou)
--   organization_id = p_organization_id (isolamento multi-tenant)
--
-- Após a claim, o status muda para 'processing'.
-- O worker deve:
--   1. Processar o item
--   2. UPDATE status = 'completed' (sucesso) ou 'failed' + error_message (falha)
-- ============================================================================
create or replace function central.claim_message_grouping_batch(
  p_organization_id uuid,
  p_batch_size      integer default 10
)
returns setof central.message_grouping_queue
language sql
security definer
set search_path = central, public
as $$
  update central.message_grouping_queue
  set
    status     = 'processing',
    updated_at = now()
  where id in (
    select id
    from central.message_grouping_queue
    where
      organization_id = p_organization_id
      and status      = 'pending'
      and process_after <= now()
    order by process_after asc
    limit p_batch_size
    for update skip locked
  )
  returning *;
$$;

grant execute on function central.claim_message_grouping_batch(uuid, integer) to service_role;

-- ============================================================================
-- FUNCTION: central.claim_send_queue_batch
--
-- Reclama um lote de itens da fila de envio para processamento exclusivo.
-- Mesmo padrão FOR UPDATE SKIP LOCKED da fila de agrupamento.
--
-- Condições de elegibilidade:
--   status = 'pending'
--   scheduled_at <= now()  (hora de envio chegou)
--   organization_id = p_organization_id
--
-- Após a claim, o status muda para 'processing'.
-- O worker deve:
--   1. Chamar o provider WhatsApp/Instagram
--   2. UPDATE status = 'completed', sent_at = now() (sucesso)
--         ou status = 'failed', error_message = '...' (falha)
--
-- Retentativas: retry_count é incrementado pelo worker antes de re-enfileirar
--   (UPDATE SET status = 'pending', retry_count = retry_count + 1, scheduled_at = now() + delay).
-- ============================================================================
create or replace function central.claim_send_queue_batch(
  p_organization_id uuid,
  p_batch_size      integer default 10
)
returns setof central.send_queue
language sql
security definer
set search_path = central, public
as $$
  update central.send_queue
  set
    status     = 'processing',
    updated_at = now()
  where id in (
    select id
    from central.send_queue
    where
      organization_id = p_organization_id
      and status      = 'pending'
      and scheduled_at <= now()
    order by scheduled_at asc
    limit p_batch_size
    for update skip locked
  )
  returning *;
$$;

grant execute on function central.claim_send_queue_batch(uuid, integer) to service_role;

-- ============================================================================
-- FUNCTION: central.cleanup_processed_queues
--
-- Remove itens antigos com status 'completed', 'failed' ou 'cancelled'
-- de ambas as filas assíncronas.
--
-- Propósito: evitar crescimento ilimitado das tabelas de fila.
--   Itens processados há > p_older_than_days dias não têm valor operacional.
--   Em caso de debug, os dados relevantes já estão em central.messages e
--   central.conversation_events (audit trail imutável).
--
-- Chamada recomendada: job agendado (pg_cron ou Supabase Edge Function cron)
--   diariamente, com p_older_than_days = 7.
--
-- Retorna: número total de linhas removidas.
-- ============================================================================
create or replace function central.cleanup_processed_queues(
  p_older_than_days integer default 7
)
returns integer
language plpgsql
security definer
set search_path = central, public
as $$
declare
  v_cutoff     timestamptz;
  v_grouping   integer;
  v_send       integer;
begin
  v_cutoff := now() - (p_older_than_days || ' days')::interval;

  delete from central.message_grouping_queue
  where
    status in ('completed', 'failed', 'cancelled')
    and updated_at < v_cutoff;
  get diagnostics v_grouping = row_count;

  delete from central.send_queue
  where
    status in ('completed', 'failed', 'cancelled')
    and updated_at < v_cutoff;
  get diagnostics v_send = row_count;

  return v_grouping + v_send;
end;
$$;

grant execute on function central.cleanup_processed_queues(integer) to service_role;
