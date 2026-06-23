-- Central de Atendimento — Nina Integration: Seed Data
-- M-N06 | Nina Integration Block
-- Depends on:
--   20260701010000_central_nina_tables.sql (central.agent_settings, central.tag_definitions)
--   20260701010400_central_nina_functions.sql (não obrigatório, mas seed é o último passo)
--
-- O que faz:
--   1. Atualiza central.organizations (Universo ABA) com timezone e horário comercial
--   2. Cria configuração padrão de agente (central.agent_settings) para Universo ABA
--   3. Cria tags padrão (central.tag_definitions) alinhadas com contexto clínico
--
-- Idempotente: todos os inserts usam ON CONFLICT DO NOTHING ou ON CONFLICT DO UPDATE.
-- Re-executar esta migration não cria duplicatas.
--
-- ROLLBACK (somente dados, estrutura preservada):
--   delete from central.tag_definitions where organization_id = 'a0000000-0000-0000-0000-000000000001';
--   delete from central.agent_settings   where organization_id = 'a0000000-0000-0000-0000-000000000001';
--   update central.organizations set timezone = null, business_hours_start = null,
--     business_hours_end = null, business_days = null, agent_name = null
--   where id = 'a0000000-0000-0000-0000-000000000001';

-- ============================================================================
-- UPDATE: central.organizations — dados operacionais da Universo ABA
--
-- UUID 'a0000000-0000-0000-0000-000000000001' é o ID fixo da org padrão
-- inserido em 20260701000000_create_ca_schema.sql.
-- ============================================================================
update central.organizations
set
  timezone             = 'America/Sao_Paulo',
  business_hours_start = '08:00',
  business_hours_end   = '18:00',
  business_days        = '{1,2,3,4,5}',
  agent_name           = 'Nina'
where id = 'a0000000-0000-0000-0000-000000000001';

-- ============================================================================
-- INSERT: central.agent_settings — configuração padrão IA
--
-- inbox_id = NULL → configuração padrão da organização (org-level default).
-- Todos os campos de credencial ficam NULL — devem ser preenchidos no painel
-- de configurações após o deploy.
--
-- auto_response_enabled = false:
--   Segurança: o agente NÃO responde automaticamente por padrão.
--   Admin deve ativar explicitamente após validar o system_prompt.
-- ============================================================================
insert into central.agent_settings (
  id,
  organization_id,
  inbox_id,
  ai_model_mode,
  system_prompt,
  auto_response_enabled,
  response_delay_min,
  response_delay_max,
  message_breaking_enabled,
  openai_assistant_id,
  elevenlabs_api_key,
  elevenlabs_voice_id,
  elevenlabs_model,
  elevenlabs_stability,
  elevenlabs_similarity_boost,
  elevenlabs_speed,
  tts_enabled
)
values (
  'b0000000-0000-0000-0000-000000000001',   -- UUID fixo para idempotência
  'a0000000-0000-0000-0000-000000000001',
  null,                                      -- org-level default
  'gpt-4o',
  null,                                      -- system_prompt: configurar no painel
  false,                                     -- auto_response desligado por segurança
  3,                                         -- delay mínimo: 3 segundos
  8,                                         -- delay máximo: 8 segundos
  true,                                      -- message_breaking: quebrará respostas longas
  null,                                      -- openai_assistant_id: configurar no painel
  null,                                      -- elevenlabs_api_key: configurar no painel
  null,                                      -- elevenlabs_voice_id: configurar no painel
  'eleven_multilingual_v2',
  0.50,
  0.75,
  1.00,
  false                                      -- TTS desligado por padrão
)
on conflict on constraint uq_agent_settings_org_default do update
  set
    ai_model_mode            = excluded.ai_model_mode,
    response_delay_min       = excluded.response_delay_min,
    response_delay_max       = excluded.response_delay_max,
    message_breaking_enabled = excluded.message_breaking_enabled,
    elevenlabs_model         = excluded.elevenlabs_model,
    elevenlabs_stability     = excluded.elevenlabs_stability,
    elevenlabs_similarity_boost = excluded.elevenlabs_similarity_boost,
    elevenlabs_speed         = excluded.elevenlabs_speed,
    updated_at               = now();

-- ============================================================================
-- INSERT: central.tag_definitions — tags padrão Universo ABA
--
-- Organizadas em 4 categorias:
--   Triagem       → estado do lead/contato novo
--   Atendimento   → estado operacional da conversa
--   Financeiro    → flags financeiras
--   Urgência      → prioridade operacional
-- ============================================================================
insert into central.tag_definitions (organization_id, key, label, color, category, is_active) values

  -- Triagem
  ('a0000000-0000-0000-0000-000000000001', 'lead_novo',          'Lead novo',          '#6366f1', 'Triagem',    true),
  ('a0000000-0000-0000-0000-000000000001', 'aguardando_triagem', 'Aguardando triagem', '#8b5cf6', 'Triagem',    true),
  ('a0000000-0000-0000-0000-000000000001', 'em_triagem',         'Em triagem',         '#a78bfa', 'Triagem',    true),
  ('a0000000-0000-0000-0000-000000000001', 'triagem_concluida',  'Triagem concluída',  '#7c3aed', 'Triagem',    true),

  -- Atendimento
  ('a0000000-0000-0000-0000-000000000001', 'sem_resposta',       'Sem resposta',       '#f59e0b', 'Atendimento', true),
  ('a0000000-0000-0000-0000-000000000001', 'em_andamento',       'Em andamento',       '#10b981', 'Atendimento', true),
  ('a0000000-0000-0000-0000-000000000001', 'matricula_pendente', 'Matrícula pendente', '#3b82f6', 'Atendimento', true),
  ('a0000000-0000-0000-0000-000000000001', 'documentacao',       'Documentação',       '#0ea5e9', 'Atendimento', true),
  ('a0000000-0000-0000-0000-000000000001', 'responsavel_viagem', 'Responsável viagem', '#64748b', 'Atendimento', true),

  -- Financeiro
  ('a0000000-0000-0000-0000-000000000001', 'negociacao',         'Negociação',         '#f97316', 'Financeiro',  true),
  ('a0000000-0000-0000-0000-000000000001', 'particular',         'Particular',         '#84cc16', 'Financeiro',  true),
  ('a0000000-0000-0000-0000-000000000001', 'convenio',           'Convênio',           '#22c55e', 'Financeiro',  true),

  -- Urgência
  ('a0000000-0000-0000-0000-000000000001', 'urgente',            'Urgente',            '#ef4444', 'Urgência',    true),
  ('a0000000-0000-0000-0000-000000000001', 'alta_prioridade',    'Alta prioridade',    '#f43f5e', 'Urgência',    true)

on conflict (organization_id, key) do update
  set
    label      = excluded.label,
    color      = excluded.color,
    category   = excluded.category,
    is_active  = excluded.is_active,
    updated_at = now();
