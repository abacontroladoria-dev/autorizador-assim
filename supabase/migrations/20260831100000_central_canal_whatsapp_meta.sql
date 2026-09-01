-- ============================================================================
-- Canal de WhatsApp (Meta Cloud API) — inbox, channel e connection
--
-- O QUE ESTA MIGRATION RESOLVE
--
-- O módulo de atendimento inteiro (webhook, workers, provider) resolve o canal
-- pelo `phone_number_id` que a Meta manda em cada entrega:
--
--   phone_number_id → central.channel_connections.provider_metadata
--                   → channel_id → inbox_id → organização
--
-- Sem estas três linhas o webhook enfileira e o worker morre com "nenhum canal
-- com phone_number_id=...". A mensagem do responsável fica na fila e ninguém
-- responde — falha silenciosa do ponto de vista de quem escreveu.
--
-- ONDE MORA O TOKEN, E POR QUE NÃO AQUI
--
-- `provider_metadata` guarda IDENTIFICADORES (phone_number_id, waba_id), nunca
-- o token de acesso. O token é `META_WABA_TOKEN`, variável de RUNTIME no
-- Coolify, pela mesma decisão já tomada para OPENAI_API_KEY: uma credencial em
-- texto puro no Postgres é legível por quem tem acesso direto ao banco (a
-- pendência 7 do ESTADO-E-PLANO.md registra que a chave da ElevenLabs está
-- exatamente nessa situação, e não queremos uma segunda).
--
-- E nunca como ARG do Dockerfile: ARG fica gravado na imagem e no
-- `docker history` — foi assim que o TITA_TOKEN vazou uma vez.
--
-- IDEMPOTENTE E PARAMETRIZADA
--
-- Os identificadores da Meta são preenchidos por UPDATE depois que o app
-- Business existir. A migration cria a estrutura com marcadores; rodá-la de
-- novo não duplica nada e não sobrescreve valores já configurados.
-- ============================================================================

do $$
declare
  v_org_id     uuid := 'a0000000-0000-0000-0000-000000000001';
  v_inbox_id   uuid;
  v_channel_id uuid;
begin

  -- --------------------------------------------------------------------------
  -- 1. Inbox
  --
  -- A inbox é o agrupador que a Central usa para roteamento e para a
  -- configuração da atendente (agent_settings tem índice único por
  -- (org, inbox)). Uma só por enquanto: "WhatsApp Recepção".
  -- --------------------------------------------------------------------------
  select id into v_inbox_id
  from central.inboxes
  where organization_id = v_org_id
    and name = 'WhatsApp Recepção';

  if v_inbox_id is null then
    insert into central.inboxes (organization_id, name, description)
    values (
      v_org_id,
      'WhatsApp Recepção',
      'Canal de WhatsApp atendido pela atendente virtual, com escalada para a recepção.'
    )
    returning id into v_inbox_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 2. Channel
  --
  -- `status` nasce 'disconnected' de propósito: ainda não há token nem
  -- phone_number_id de verdade. Quem o promove a 'active' é a verificação de
  -- MetaWabaProvider.getStatus(), não esta migration — declarar-se conectado
  -- sem nunca ter falado com a Meta seria afirmar o que não se sabe.
  -- --------------------------------------------------------------------------
  select id into v_channel_id
  from central.channels
  where organization_id = v_org_id
    and inbox_id        = v_inbox_id
    and provider        = 'meta_waba';

  if v_channel_id is null then
    insert into central.channels (
      organization_id, inbox_id, name, provider, channel_type, status, active
    )
    values (
      v_org_id, v_inbox_id, 'WhatsApp Recepção', 'meta_waba', 'whatsapp',
      'disconnected', true
    )
    returning id into v_channel_id;
  end if;

  -- --------------------------------------------------------------------------
  -- 3. Connection
  --
  -- É AQUI que o phone_number_id precisa entrar depois de o app Business
  -- existir. Os marcadores 'PREENCHER_*' são deliberadamente inválidos: se
  -- alguém esquecer de configurá-los, o provider falha dizendo o que falta, em
  -- vez de tentar enviar para um número que não existe.
  --
  -- O `on conflict do nothing` protege o valor real: rodar a migration de novo
  -- depois de configurada NÃO devolve os marcadores.
  -- --------------------------------------------------------------------------
  insert into central.channel_connections (
    organization_id, channel_id, external_id, provider_account_id,
    provider_metadata, connection_status
  )
  values (
    v_org_id,
    v_channel_id,
    'PREENCHER_PHONE_NUMBER_ID',
    'PREENCHER_WABA_ID',
    jsonb_build_object(
      'phone_number_id',      'PREENCHER_PHONE_NUMBER_ID',
      'waba_id',              'PREENCHER_WABA_ID',
      'display_phone_number', 'PREENCHER_NUMERO'
    ),
    'disconnected'
  )
  on conflict do nothing;

  raise notice 'canal meta_waba pronto: inbox=% channel=%', v_inbox_id, v_channel_id;

end $$;

-- ----------------------------------------------------------------------------
-- Como configurar depois de criar o app na Meta
--
-- Rodar UMA vez, com os valores reais do painel (WhatsApp → API Setup):
--
--   update central.channel_connections
--   set provider_metadata = jsonb_build_object(
--         'phone_number_id',      '<PHONE_NUMBER_ID>',
--         'waba_id',              '<WABA_ID>',
--         'display_phone_number', '<+55 ...>'
--       ),
--       external_id         = '<PHONE_NUMBER_ID>',
--       provider_account_id = '<WABA_ID>',
--       connection_status   = 'active'   -- enum channel_status; 'connected' NÃO existe
--   where channel_id = (
--     select id from central.channels
--     where provider = 'meta_waba'
--       and organization_id = 'a0000000-0000-0000-0000-000000000001'
--   );
--
-- O token NÃO entra aqui — vai em META_WABA_TOKEN no Coolify.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- A atendente NÃO é ligada por esta migration.
--
-- `agent_settings.ai_mode` continua como está (o default é 'off'). Ligar a
-- resposta automática é decisão humana, tomada depois de ver a conversa
-- funcionando com um número de teste — uma migration que começasse a responder
-- pacientes ao ser aplicada seria a pior forma possível de descobrir um bug de
-- prompt.
--
-- Para ligar, quando decidirem:
--
--   update central.agent_settings
--   set ai_mode = 'auto', ai_scheduling_enabled = true
--   where organization_id = 'a0000000-0000-0000-0000-000000000001'
--     and inbox_id is null;
-- ----------------------------------------------------------------------------
