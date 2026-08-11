-- ============================================================================
-- Central: reduzir privilégio ao que a RLS já permite, e tornar credencial
-- gravável mas não legível pelo browser
--
-- Situação anterior: `authenticated` tinha SELECT + INSERT + UPDATE + DELETE nas
-- 22 tabelas e views do schema central. A RLS impedia o abuso, mas era defesa
-- única — e várias tabelas têm uma policy só (apenas SELECT), de modo que os
-- grants de escrita existiam sem nenhuma policy que os autorizasse: privilégio
-- concedido sem uso, que só serve para o dia em que uma policy for afrouxada
-- por engano.
--
-- Duas mudanças, com propósitos diferentes:
--
-- 1. Filas e trilha de auditoria: só leitura para `authenticated`. Quem escreve
--    nelas é worker com service role. Auditoria que o próprio usuário pode
--    alterar não é auditoria.
--
-- 2. Colunas de credencial: privilégio de ESCRITA sem privilégio de LEITURA.
--    É o formato exato do que se quer — o admin cola a chave pela tela (precisa
--    gravar) e nunca a lê de volta (o servidor lê com service role). Sem isso,
--    um admin com a chave anônima e o schema exposto faz
--    `GET /rest/v1/agent_settings?select=elevenlabs_api_key` e leva a chave.
--
-- ATENÇÃO ao comportamento de privilégio por coluna (já documentado neste
-- projeto): REVOKE de coluna NÃO subtrai um grant de tabela. É preciso revogar
-- a tabela inteira e então conceder coluna por coluna. E sob privilégio por
-- coluna, `select('*')` passa a responder 403 — por isso as leituras destas
-- duas tabelas listam colunas explicitamente (ver COLUNAS_SEGURAS em
-- modules/atendimento/repositories/agent-settings.repository.ts).
--
-- CONSEQUÊNCIA DELIBERADA: coluna nova adicionada a estas tabelas nasce SEM
-- grant de leitura para `authenticated`. Falha fechada — uma credencial futura
-- não vaza por esquecimento. O preço é que coluna nova e inofensiva precisa ser
-- concedida explicitamente aqui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Filas e auditoria: leitura apenas
-- ----------------------------------------------------------------------------
revoke insert, update, delete on central.message_grouping_queue from authenticated;
revoke insert, update, delete on central.send_queue             from authenticated;
revoke insert, update, delete on central.conversation_states    from authenticated;
revoke insert, update, delete on central.conversation_events    from authenticated;

-- Views nunca deveriam ter tido escrita — não há caso de uso, e uma view
-- atualizável sobre tabela com credencial é caminho de escrita não auditado.
revoke insert, update, delete on central.agent_settings_public  from authenticated;
revoke insert, update, delete on central.contacts_with_stats    from authenticated;
revoke insert, update, delete on central.pending_queue_overview from authenticated;

-- ----------------------------------------------------------------------------
-- 2. central.agent_settings — elevenlabs_api_key deixa de ser legível
--
-- SELECT: todas as colunas MENOS elevenlabs_api_key.
-- INSERT/UPDATE: todas, inclusive a chave — é assim que a tela grava.
--
-- openai_assistant_id continua legível: é identificador, não segredo. A chave
-- da OpenAI não mora no banco (é variável de runtime), justamente para não
-- existir aqui uma segunda credencial a proteger.
-- ----------------------------------------------------------------------------
revoke all on central.agent_settings from authenticated;

grant select (
  id, organization_id, inbox_id,
  ai_model_mode, system_prompt, auto_response_enabled,
  response_delay_min, response_delay_max, message_breaking_enabled,
  openai_assistant_id,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled, created_at, updated_at
) on central.agent_settings to authenticated;

grant insert (
  id, organization_id, inbox_id,
  ai_model_mode, system_prompt, auto_response_enabled,
  response_delay_min, response_delay_max, message_breaking_enabled,
  openai_assistant_id,
  elevenlabs_api_key,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled
) on central.agent_settings to authenticated;

grant update (
  inbox_id,
  ai_model_mode, system_prompt, auto_response_enabled,
  response_delay_min, response_delay_max, message_breaking_enabled,
  openai_assistant_id,
  elevenlabs_api_key,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled, updated_at
) on central.agent_settings to authenticated;

-- ----------------------------------------------------------------------------
-- 3. central.channel_connections — provider_metadata deixa de ser legível
--
-- É onde o access token do WhatsApp e o phone_number_id vão morar. A policy de
-- SELECT permite a qualquer admin ler a linha; sem privilégio por coluna, ler a
-- linha é ler o token.
--
-- Nenhum código lê esta tabela hoje, então o privilégio por coluna entra sem
-- quebrar nada — e entra ANTES de existir credencial nela, que é a única ordem
-- em que esse tipo de proteção é barata.
-- ----------------------------------------------------------------------------
revoke all on central.channel_connections from authenticated;

grant select (
  id, organization_id, channel_id,
  external_id, provider_instance_id, provider_account_id,
  connection_status, last_sync_at, created_at, updated_at
) on central.channel_connections to authenticated;

grant insert (
  id, organization_id, channel_id,
  external_id, provider_instance_id, provider_account_id,
  provider_metadata,
  connection_status, last_sync_at
) on central.channel_connections to authenticated;

grant update (
  external_id, provider_instance_id, provider_account_id,
  provider_metadata,
  connection_status, last_sync_at, updated_at
) on central.channel_connections to authenticated;

-- ----------------------------------------------------------------------------
-- 4. View sem a credencial, para leitura de tela
--
-- Contraparte de agent_settings_public. security_invoker mantém a RLS da tabela
-- base valendo (SELECT só para admin) — a view não escalona privilégio, só
-- garante que a coluna de credencial não é listável por descuido.
-- ----------------------------------------------------------------------------
create or replace view central.channel_connections_public
  with (security_invoker = true)
as
select
  id,
  organization_id,
  channel_id,
  external_id,
  provider_instance_id,
  provider_account_id,
  -- provider_metadata omitido: guarda access token do provider
  connection_status,
  last_sync_at,
  created_at,
  updated_at
from central.channel_connections;

comment on view central.channel_connections_public is
  'channel_connections sem provider_metadata. Use em qualquer leitura que chegue ao browser.';

grant select on central.channel_connections_public to authenticated;
