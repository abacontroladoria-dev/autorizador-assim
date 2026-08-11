-- ============================================================================
-- central.agent_settings — completar os parâmetros de voz da ElevenLabs
--
-- Por que existe:
--   A tela de configuração herdada do Nina (components/nina/settings/ApiSettings)
--   edita sete parâmetros de voz. A tabela criada em 20260701010000 tem cinco:
--   faltam `style` e `use_speaker_boost`, que a API da ElevenLabs aceita dentro
--   de voice_settings. Sem as colunas, o que o usuário ajusta na tela não tem
--   onde ser gravado e o áudio sai com um timbre diferente do que ele ouviu no
--   teste.
--
--   A tela também tinha um campo `audio_response_enabled`. Não é criado aqui:
--   é o mesmo conceito de `tts_enabled`, que já existe. Duas colunas para a
--   mesma decisão viram divergência silenciosa — a tela passa a ler tts_enabled.
--
-- Sobre a chave em texto puro:
--   `elevenlabs_api_key` continua em texto puro, como a migration original
--   documentou. O que esta migration garante é que ela nunca sai do banco pela
--   API: a view `agent_settings_public` (recriada abaixo) não a lista, e a rota
--   /api/central/agent-settings devolve apenas os quatro últimos caracteres.
--   Migrar para Supabase Vault segue como pendência aberta.
-- ============================================================================

alter table central.agent_settings
  add column if not exists elevenlabs_style         numeric(3,2) default 0.30,
  add column if not exists elevenlabs_speaker_boost boolean      not null default true;

comment on column central.agent_settings.elevenlabs_style is
  'voice_settings.style da ElevenLabs (0–1). Acima de ~0.5 a dicção fica instável.';
comment on column central.agent_settings.elevenlabs_speaker_boost is
  'voice_settings.use_speaker_boost. Aproxima o timbre da voz original ao custo de latência.';

-- ----------------------------------------------------------------------------
-- Recria a view pública incluindo os dois parâmetros novos.
--
-- DROP antes do CREATE, e não `create or replace`: o replace exige a mesma lista
-- de colunas na mesma ordem, e aqui elevenlabs_style entra no meio do bloco de
-- voz (ficar ao lado de similarity_boost é o que torna a view legível). Com
-- replace o Postgres recusa — "cannot change name of view column".
--
-- Nada depende desta view: ela nasceu na 20260701010300 e a UI passou a ler pela
-- rota /api/central/agent-settings. Se algum dia houver dependente, o DROP
-- falha em vez de derrubá-lo em silêncio (sem CASCADE, de propósito).
--
-- Os campos de credencial (elevenlabs_api_key, openai_assistant_id) seguem
-- omitidos de propósito: é isso que permite exibir a configuração de voz sem
-- expor a chave. `security_invoker` mantém a RLS de agent_settings valendo.
-- ----------------------------------------------------------------------------
drop view if exists central.agent_settings_public;

create view central.agent_settings_public
  with (security_invoker = true)
as
select
  id,
  organization_id,
  inbox_id,
  ai_model_mode,
  system_prompt,
  auto_response_enabled,
  response_delay_min,
  response_delay_max,
  message_breaking_enabled,
  -- openai_assistant_id omitido
  -- elevenlabs_api_key omitido
  elevenlabs_voice_id,
  elevenlabs_model,
  elevenlabs_stability,
  elevenlabs_similarity_boost,
  elevenlabs_style,
  elevenlabs_speed,
  elevenlabs_speaker_boost,
  tts_enabled,
  created_at,
  updated_at
from central.agent_settings;

comment on view central.agent_settings_public is
  'agent_settings sem colunas de credencial. Use esta view em qualquer leitura que chegue ao browser.';
