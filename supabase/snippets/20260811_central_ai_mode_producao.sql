-- ============================================================
-- central.agent_settings: ai_mode + ai_scheduling_enabled
--
-- Aplica a migration 20260811100000, a unica do modulo que ficou
-- de fora do bundle anterior. Sem ela a tela de Configuracoes
-- responde 500: o codigo pede as colunas ai_mode e
-- ai_scheduling_enabled, que ainda nao existem aqui.
--
-- Tudo ou nada: se der erro, nada e aplicado.
-- ============================================================

begin;

-- ============================================================================
-- central.agent_settings — separar AUTONOMIA de MODELO
--
-- Por que existe:
--   A tabela nasceu com `ai_model_mode text not null default 'gpt-4o'`, herdado
--   do seletor de modelo do CRM Nina. Três problemas somados:
--
--   1. O único consumidor que aquela coluna já teve foi getModelSettings() no
--      nina-orchestrator, que fazia switch em 'flash'/'pro'/'pro3'/'adaptive' e
--      devolvia modelos Gemini. O valor 'gpt-4o' caía no `default:` do switch e
--      virava google/gemini-2.5-flash — escolha de modelo em silêncio, que é a
--      pior forma de errar isso.
--   2. Modelo não é configuração de negócio. É decisão de instalação, versionada
--      junto do código que sabe conversar com ele. Passa a viver em OPENAI_MODEL,
--      variável de runtime, validada contra allowlist no boot.
--   3. `auto_response_enabled` codificava AUTONOMIA como booleano. Duas colunas
--      decidindo a mesma coisa por eixos diferentes é divergência silenciosa —
--      o mesmo motivo pelo qual a 20260810110000 recusou criar
--      `audio_response_enabled` ao lado de `tts_enabled`.
--
-- O que fica:
--   `ai_mode` — eixo único de autonomia, três estados:
--     'off'        o agente não é acionado; nenhuma chamada ao LLM acontece
--     'assisted'   o agente responde, a resposta fica como rascunho e NÃO é
--                  enviada; um humano revisa
--     'autonomous' o agente responde e a resposta é enfileirada para envio
--
--   `ai_scheduling_enabled` — interruptor das ferramentas que ESCREVEM
--     (agendar, reagendar, cancelar). Separado de `ai_mode` de propósito: dá
--     para ter agente autônomo que só informa horários sem poder reservar.
--     Default `false`: ferramenta que grava começa desligada.
--
-- Backfill deliberadamente conservador:
--   auto_response_enabled = true  → 'assisted'   (NUNCA 'autonomous')
--   auto_response_enabled = false → 'off'
--   Promover para 'autonomous' é decisão de gente. Se esta migration o fizesse,
--   o agente passaria a mandar mensagem para responsável de paciente no instante
--   em que o canal fosse ligado, sem ninguém ter aprovado isso.
-- ============================================================================

alter table central.agent_settings
  add column if not exists ai_mode               text    not null default 'off',
  add column if not exists ai_scheduling_enabled boolean not null default false;

-- Backfill guardado pela existência da coluna antiga: numa segunda execução
-- (após o drop mais abaixo) o bloco não roda e não reseta um 'autonomous' que
-- alguém tenha configurado pela tela.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'central'
      and table_name   = 'agent_settings'
      and column_name  = 'auto_response_enabled'
  ) then
    update central.agent_settings
    set ai_mode = case when auto_response_enabled then 'assisted' else 'off' end;
  end if;
end $$;

-- CHECK em vez de enum: adicionar valor a enum exige ALTER TYPE fora de
-- transação em versões antigas do Postgres, e um quarto estado de autonomia é
-- mudança que merece migration própria de qualquer forma.
alter table central.agent_settings
  drop constraint if exists ck_agent_settings_ai_mode;

alter table central.agent_settings
  add constraint ck_agent_settings_ai_mode
  check (ai_mode in ('off', 'assisted', 'autonomous'));

comment on column central.agent_settings.ai_mode is
  'Autonomia do agente: off (não aciona), assisted (rascunho para revisão humana), autonomous (envia). NÃO escolhe modelo — isso é OPENAI_MODEL.';
comment on column central.agent_settings.ai_scheduling_enabled is
  'Habilita as ferramentas que gravam agenda (agendar/reagendar/cancelar). Desligado por padrão.';

-- ----------------------------------------------------------------------------
-- A view depende de ai_model_mode e auto_response_enabled — precisa cair antes
-- das colunas. Sem CASCADE de propósito: se algo mais passar a depender dela, o
-- DROP falha em vez de derrubar o dependente em silêncio.
-- ----------------------------------------------------------------------------
drop view if exists central.agent_settings_public;

alter table central.agent_settings
  drop column if exists ai_model_mode,
  drop column if exists auto_response_enabled,
  drop column if exists openai_assistant_id;

-- ----------------------------------------------------------------------------
-- Recria a view com o novo eixo.
--
-- Credencial (elevenlabs_api_key) segue omitida — é o que permite exibir a
-- configuração sem expor a chave. `security_invoker` mantém a RLS valendo.
-- ----------------------------------------------------------------------------
create view central.agent_settings_public
  with (security_invoker = true)
as
select
  id,
  organization_id,
  inbox_id,
  ai_mode,
  ai_scheduling_enabled,
  system_prompt,
  response_delay_min,
  response_delay_max,
  message_breaking_enabled,
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

revoke insert, update, delete on central.agent_settings_public from authenticated;
grant  select                 on central.agent_settings_public to   authenticated;

-- ----------------------------------------------------------------------------
-- Grants por coluna, refeitos.
--
-- Sob privilégio por coluna (20260810120300), coluna nova nasce SEM grant de
-- leitura e `select('*')` responde 403. É falha fechada — credencial futura não
-- vaza por esquecimento — mas obriga a conceder explicitamente toda coluna nova.
-- ai_mode e ai_scheduling_enabled entram aqui por isso.
--
-- elevenlabs_api_key continua gravável e NÃO legível: o admin cola a chave pela
-- tela e nunca a lê de volta; quem lê é service role.
-- ----------------------------------------------------------------------------
revoke all on central.agent_settings from authenticated;

grant select (
  id, organization_id, inbox_id,
  ai_mode, ai_scheduling_enabled,
  system_prompt,
  response_delay_min, response_delay_max, message_breaking_enabled,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled, created_at, updated_at
) on central.agent_settings to authenticated;

grant insert (
  id, organization_id, inbox_id,
  ai_mode, ai_scheduling_enabled,
  system_prompt,
  response_delay_min, response_delay_max, message_breaking_enabled,
  elevenlabs_api_key,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled
) on central.agent_settings to authenticated;

grant update (
  inbox_id,
  ai_mode, ai_scheduling_enabled,
  system_prompt,
  response_delay_min, response_delay_max, message_breaking_enabled,
  elevenlabs_api_key,
  elevenlabs_voice_id, elevenlabs_model,
  elevenlabs_stability, elevenlabs_similarity_boost,
  elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost,
  tts_enabled, updated_at
) on central.agent_settings to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260811100000','central_ai_mode')
on conflict (version) do nothing;

commit;

-- Conferencia: deve devolver 1 linha com ai_mode = 'off'.
select id, ai_mode, ai_scheduling_enabled from central.agent_settings;
