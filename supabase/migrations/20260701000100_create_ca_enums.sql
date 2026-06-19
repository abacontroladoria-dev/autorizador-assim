-- Central de Atendimento — Core Enums
-- M-001 | Sprint 0
-- Depends on: 20260701000000_create_ca_schema.sql (schema central must exist)

-- ============================================================================
-- ENUM: central.provider_type
-- Canal de origem da conversa (integração de mensageria)
-- ============================================================================
create type central.provider_type as enum (
  'evolution',
  'meta_waba',
  'instagram'
);

-- ============================================================================
-- ENUM: central.conversation_status
-- ============================================================================
create type central.conversation_status as enum (
  'open',
  'assigned',
  'waiting',
  'resolved',
  'archived'
);

-- ============================================================================
-- ENUM: central.contact_type
-- Tipo de vínculo do contato com a clínica
-- ============================================================================
create type central.contact_type as enum (
  'guardian',
  'patient',
  'therapist',
  'physician',
  'employee',
  'lead',
  'supplier',
  'other'
);

-- ============================================================================
-- ENUM: central.conversation_intent
-- Intenção classificada da conversa (por IA ou manualmente)
-- ============================================================================
create type central.conversation_intent as enum (
  'agenda',
  'autorizacao',
  'financeiro',
  'documentacao',
  'matricula',
  'reclamacao',
  'terapeuta',
  'marketing',
  'outros'
);

-- ============================================================================
-- ENUM: central.ai_mode
-- Nível de autonomia da IA por inbox
-- ============================================================================
create type central.ai_mode as enum (
  'off',
  'assisted',
  'autonomous'
);

-- ============================================================================
-- ENUM: central.notification_priority
-- ============================================================================
create type central.notification_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

-- ============================================================================
-- ENUM: central.channel_status
-- Estado da conexão do canal com o provedor de mensageria
-- ============================================================================
create type central.channel_status as enum (
  'active',
  'connecting',
  'disconnected',
  'error',
  'suspended'
);
