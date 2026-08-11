-- ============================================================================
-- central.criar_mensagem_com_anexos — mensagem e anexos numa transação só
--
-- MessageRepository.createWithAttachments fazia duas viagens ao banco: insere a
-- mensagem, depois insere os anexos um a um. Sem transação, falha no segundo
-- passo deixa a mensagem gravada SEM o anexo — e é o pior estado possível para
-- áudio de WhatsApp, porque `body` de mensagem de áudio é vazio: o orquestrador
-- recebe uma mensagem sem texto e sem áudio, não tem o que responder, e o
-- responsável fica achando que mandou um áudio que a clínica ignorou.
--
-- Uma função plpgsql roda numa transação implícita: ou a mensagem e todos os
-- anexos existem, ou nada existe.
--
-- SECURITY INVOKER (o padrão, não declarado) de propósito: os privilégios do
-- chamador continuam valendo. O worker de webhook usa service role e passa; um
-- operador humano passa pela RLS de messages_insert. Marcar SECURITY DEFINER
-- aqui abriria uma porta de INSERT sem RLS para qualquer `authenticated`.
--
-- Entrada em jsonb em vez de 20 parâmetros: o repositório já monta objetos, e
-- assinatura de função com 20 argumentos posicionais é onde se trocam dois
-- campos de texto sem ninguém perceber.
-- ============================================================================

create or replace function central.criar_mensagem_com_anexos(
  p_mensagem jsonb,
  p_anexos   jsonb default '[]'::jsonb
)
returns central.messages
language plpgsql
set search_path = central, public
as $$
declare
  v_msg central.messages;
begin
  if p_mensagem is null then
    raise exception 'p_mensagem é obrigatório';
  end if;

  insert into central.messages (
    organization_id,
    conversation_id,
    external_message_id,
    direction,
    message_type,
    body,
    provider,
    sent_by_user_id,
    sent_by_ai,
    reply_to_message_id,
    status,
    sent_at
  )
  values (
    (p_mensagem->>'organization_id')::uuid,
    (p_mensagem->>'conversation_id')::uuid,
    -- nullif em toda coluna opcional: o cliente manda '' onde queria null, e ''
    -- em external_message_id escaparia do índice parcial uq_messages_ext_id
    -- (que só cobre valor não-nulo) — duas mensagens com '' passariam.
    nullif(p_mensagem->>'external_message_id', ''),
    p_mensagem->>'direction',
    coalesce(nullif(p_mensagem->>'message_type', ''), 'text'),
    p_mensagem->>'body',
    nullif(p_mensagem->>'provider', '')::central.provider_type,
    nullif(p_mensagem->>'sent_by_user_id', '')::uuid,
    coalesce((p_mensagem->>'sent_by_ai')::boolean, false),
    nullif(p_mensagem->>'reply_to_message_id', '')::uuid,
    coalesce(nullif(p_mensagem->>'status', ''), 'pending'),
    nullif(p_mensagem->>'sent_at', '')::timestamptz
  )
  returning * into v_msg;

  -- Um único INSERT ... SELECT para todos os anexos. organization_id e
  -- message_id vêm da mensagem recém-criada, nunca do payload: assim um
  -- payload malformado não consegue pendurar anexo em mensagem de outra
  -- organização.
  insert into central.message_attachments (
    organization_id,
    message_id,
    file_name,
    file_type,
    file_size,
    external_url,
    storage_status,
    duration_secs
  )
  select
    v_msg.organization_id,
    v_msg.id,
    nullif(a->>'file_name', ''),
    nullif(a->>'file_type', ''),
    nullif(a->>'file_size', '')::bigint,
    nullif(a->>'external_url', ''),
    coalesce(nullif(a->>'storage_status', ''), 'pending'),
    nullif(a->>'duration_secs', '')::integer
  from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) as a;

  return v_msg;
end;
$$;

comment on function central.criar_mensagem_com_anexos(jsonb, jsonb) is
  'Insere mensagem e seus anexos atomicamente. Mensagem de áudio sem anexo é indistinguível de mensagem vazia — daí a transação.';

grant execute on function central.criar_mensagem_com_anexos(jsonb, jsonb) to authenticated;
