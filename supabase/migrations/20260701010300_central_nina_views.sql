-- Central de Atendimento — Nina Integration: Views
-- M-N04 | Nina Integration Block
-- Depends on:
--   20260701010000_central_nina_tables.sql (novas tabelas + ALTER TABLEs)
--   20260701010200_central_nina_rls.sql   (RLS habilitado nas novas tabelas)
--
-- Views criadas:
--   1. central.contacts_with_stats        — contatos + métricas de conversa
--   2. central.agent_settings_public      — configurações IA sem credenciais sensíveis
--   3. central.pending_queue_overview     — visão consolidada das filas para monitoramento
--
-- ROLLBACK:
--   drop view if exists central.pending_queue_overview;
--   drop view if exists central.agent_settings_public;
--   drop view if exists central.contacts_with_stats;

-- ============================================================================
-- VIEW: central.contacts_with_stats
--
-- Equivalente à view contacts_with_stats do Nina, adaptada para multi-tenant.
-- Exposta com SECURITY INVOKER: cada usuário vê apenas o que as policies
-- de contacts e conversations permitem. Não usa SECURITY DEFINER para evitar
-- escalonamento de privilégio via JOINs.
--
-- Campos:
--   contact_*           — todos os campos de central.contacts
--   total_conversations — total de conversas (qualquer status)
--   open_conversations  — conversas ativas (open + assigned + waiting)
--   last_conversation_at— timestamp da conversa mais recente
--   last_message_at     — última mensagem em qualquer conversa do contato
--   primary_phone       — identificador principal do tipo 'phone'
--   primary_wa_id       — identificador principal do tipo 'wa_id'
-- ============================================================================
create or replace view central.contacts_with_stats
  with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.name,
  c.display_phone,
  c.display_email,
  c.contact_type,
  c.status,
  c.source,
  c.avatar_url,
  c.is_provisional,
  c.merged_into_contact_id,
  c.last_interaction_at,
  c.deleted_at,
  c.tags,
  c.ai_memory,
  c.created_at,
  c.updated_at,

  -- Estatísticas de conversas
  count(conv.id)                                                        as total_conversations,
  count(conv.id) filter (
    where conv.status in ('open', 'assigned', 'waiting')
  )                                                                     as open_conversations,
  max(conv.created_at)                                                  as last_conversation_at,
  max(conv.last_message_at)                                             as last_message_at,

  -- Identificadores primários desnormalizados para display sem JOIN adicional
  (
    select ci.identifier_value
    from central.contact_identifiers ci
    where ci.contact_id = c.id
      and ci.identifier_type = 'phone'
      and ci.is_primary = true
    limit 1
  )                                                                     as primary_phone,
  (
    select ci.identifier_value
    from central.contact_identifiers ci
    where ci.contact_id = c.id
      and ci.identifier_type = 'wa_id'
      and ci.is_primary = true
    limit 1
  )                                                                     as primary_wa_id

from central.contacts c
left join central.conversations conv
  on conv.contact_id = c.id
  and conv.organization_id = c.organization_id
where c.deleted_at is null
group by c.id;

-- ============================================================================
-- VIEW: central.agent_settings_public
--
-- Versão segura de central.agent_settings sem as colunas de credencial.
-- Usada pela UI para exibir/editar configurações de comportamento do agente
-- sem expor elevenlabs_api_key ao cliente.
--
-- Campos omitidos: elevenlabs_api_key, openai_assistant_id
-- Campos incluídos: todos os campos comportamentais + campos de modelo TTS
--                   (voice_id, model, parâmetros de qualidade — sem a chave)
--
-- SECURITY INVOKER: RLS de agent_settings (admin apenas para SELECT direto)
-- ainda se aplica. Esta view não escalona privilégio.
-- ============================================================================
create or replace view central.agent_settings_public
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
  elevenlabs_speed,
  tts_enabled,
  created_at,
  updated_at
from central.agent_settings;

-- ============================================================================
-- VIEW: central.pending_queue_overview
--
-- Visão consolidada das duas filas assíncronas para monitoramento operacional.
-- Exibe apenas itens pendentes ou em processamento — não polui com histórico.
-- Usado no painel de saúde da Central para detectar gargalos.
--
-- queue_type: 'grouping' | 'send' — identifica a origem
-- item_id: UUID do item na fila
-- status: pending | processing
-- scheduled_at: quando o item deve ser / foi processado
-- age_seconds: idade do item desde criação (alertar se > threshold)
-- retry_count: número de tentativas anteriores (alertar se > 0)
-- error_message: último erro registrado
--
-- SECURITY INVOKER: respeita as RLS das filas (admin + director SELECT).
-- ============================================================================
create or replace view central.pending_queue_overview
  with (security_invoker = true)
as
select
  'grouping'::text                                  as queue_type,
  q.id                                              as item_id,
  q.organization_id,
  q.status,
  q.process_after                                   as scheduled_at,
  extract(epoch from (now() - q.created_at))::int   as age_seconds,
  q.retry_count,
  q.error_message,
  q.created_at
from central.message_grouping_queue q
where q.status in ('pending', 'processing')

union all

select
  'send'::text                                      as queue_type,
  s.id                                              as item_id,
  s.organization_id,
  s.status,
  s.scheduled_at,
  extract(epoch from (now() - s.created_at))::int   as age_seconds,
  s.retry_count,
  s.error_message,
  s.created_at
from central.send_queue s
where s.status in ('pending', 'processing')

order by created_at asc;
