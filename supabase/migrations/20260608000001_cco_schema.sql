-- Phase 1: Central de Conciliação Operacional (CCO) - Schema Foundation
-- SPEC-CCO-001 | Sistema PULSAR
-- Objective: Create isolated schema with 6 tables, indexes, and retention policy
-- Status: REVERSIBLE (DROP SCHEMA cco CASCADE)

-- ============================================================================
-- SCHEMA
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS cco;

-- ============================================================================
-- ENUMS: Type Safety for Domain Values
-- ============================================================================
-- Authorization source (ASSIM vs fila_autorizacoes)
CREATE TYPE cco.authorization_source_enum AS ENUM ('assim', 'fila');

-- Authorization status (valid states)
CREATE TYPE cco.authorization_status_enum AS ENUM ('LIBERADA', 'PENDENTE', 'GLOSA', 'CANCELADA', 'SEM_SOLICITACAO');

-- Occurrence type (7 categorized types)
CREATE TYPE cco.occurrence_type_enum AS ENUM (
  'AUTORIZACAO_PENDENTE',
  'SESSAO_SEM_AUTORIZACAO',
  'EVOLUCAO_ATRASADA',
  'FALTA_TERAPEUTA',
  'SUBSTITUICAO',
  'FALTA_PACIENTE',
  'GLOSA'
);

-- Severity level
CREATE TYPE cco.severity_enum AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- Ensure pg_cron extension exists for retention job
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- TABLE: cco.atendimentos (Consolidação de sessões)
-- ============================================================================
CREATE TABLE cco.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL UNIQUE,
  tita_agendamento_id bigint,
  paciente_nome text NOT NULL,
  data_sessao date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time,
  profissional_agendado text,
  terapia text,
  convenio text,
  unidade text,
  status_agendamento text,
  justificativa text,
  possui_tratativa boolean,
  profissional_tratativa text,
  data_tratativa date,
  sync_hash text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN cco.atendimentos.session_key IS
  'Deterministic conciliation key: sha256(unaccent(lower(trim(paciente_nome))) || data_sessao || hora_inicio). Must be normalized before hash in application layer.';
COMMENT ON COLUMN cco.atendimentos.sync_hash IS
  'Change detection hash to skip unnecessary updates. Computed in application layer.';
COMMENT ON TABLE cco.atendimentos IS
  'Consolidated session view across TITA agenda, ASSIM authorizations, and operational data. Sidecar pattern: read-only for legacy sources.';

-- ============================================================================
-- TABLE: cco.session_authorizations (Status de autorizações)
-- ============================================================================
CREATE TABLE cco.session_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  source cco.authorization_source_enum NOT NULL,
  guia text,
  status_assim text,
  status_tratado text,
  data_autorizacao timestamptz,
  fila_id uuid,
  status_fila text,
  forma_autorizacao text,
  numero_autorizacao text,
  authorization_status cco.authorization_status_enum NOT NULL,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (session_key, source)
);

COMMENT ON TABLE cco.session_authorizations IS
  'Authorization status from two sources: ASSIM (sistema_assim) and FILA (fila_autorizacoes). UPSERT by (session_key, source) ensures no duplicates per source.';
COMMENT ON COLUMN cco.session_authorizations.source IS
  'Data source: ''assim'' for autorizacoes_assim table, ''fila'' for fila_autorizacoes table.';

-- ============================================================================
-- TABLE: cco.session_substitutions (Substituições de terapeutas)
-- ============================================================================
CREATE TABLE cco.session_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  tita_agendamento_id bigint NOT NULL,
  status_ct text NOT NULL,
  profissional_substituto_nome text,
  profissional_substituto_id bigint,
  confirmado_em timestamptz,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (session_key),
  CONSTRAINT ck_status_ct CHECK (status_ct IN ('falta', 'substituto', 'presente', 'confirmado'))
);

COMMENT ON TABLE cco.session_substitutions IS
  'Therapist substitution records from controle_terapeutico. Source of truth for absences and replacements.';
COMMENT ON COLUMN cco.session_substitutions.status_ct IS
  'Status copied from controle_terapeutico table. Valid values: falta, substituto, presente, confirmado.';

-- ============================================================================
-- TABLE: cco.occurrences (Ocorrências geradas)
-- ============================================================================
CREATE TABLE cco.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  tipo cco.occurrence_type_enum NOT NULL,
  severity cco.severity_enum NOT NULL,
  titulo text NOT NULL,
  descricao text,
  impacto_financeiro numeric(10,2),
  responsavel_acao text,
  acao_recomendada text,
  fingerprint text NOT NULL UNIQUE,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE cco.occurrences IS
  'Business rule occurrences generated by conciliation engine. Idempotent via fingerprint UNIQUE constraint. ON CONFLICT DO NOTHING pattern used in engine.';
COMMENT ON COLUMN cco.occurrences.fingerprint IS
  'Idempotency key: sha256(session_key || tipo || date_trunc(''day'', data_sessao)). Daily granularity prevents duplicate occurrences within same day. Computed in conciliation-engine.';
COMMENT ON COLUMN cco.occurrences.resolved_at IS
  'Timestamp when occurrence was manually resolved by user. NULL = unresolved. Retention policy: rows with resolved_at < now()-90days are deleted daily at 01:00 UTC.';

-- ============================================================================
-- TABLE: cco.dashboard_snapshot (Contadores pré-calculados)
-- ============================================================================
CREATE TABLE cco.dashboard_snapshot (
  id bigserial PRIMARY KEY,
  calculated_at timestamptz DEFAULT now(),
  data_ref date NOT NULL UNIQUE,
  autorizacoes_pendentes integer,
  sessoes_sem_autorizacao integer,
  evolucoes_atrasadas integer,
  faltas_terapeuta integer,
  substituicoes integer,
  faltas_paciente integer,
  glosas integer,
  receita_em_risco_count integer
);

COMMENT ON TABLE cco.dashboard_snapshot IS
  'Pre-calculated dashboard counters updated daily by conciliation-engine. Guarantees <500ms response time. UPSERT by data_ref ensures exactly one row per date.';
COMMENT ON COLUMN cco.dashboard_snapshot.data_ref IS
  'Reference date for dashboard snapshot. UNIQUE constraint prevents duplicates. Expected one row per day.';

-- ============================================================================
-- TABLE: cco.processing_logs (Auditoria de execução)
-- ============================================================================
CREATE TABLE cco.processing_logs (
  id bigserial PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  status text,
  rows_processed integer,
  error_message text
);

-- ============================================================================
-- INDEXES: cco.atendimentos
-- ============================================================================
CREATE UNIQUE INDEX idx_sessions_session_key
  ON cco.atendimentos(session_key);

CREATE INDEX idx_sessions_data_sessao
  ON cco.atendimentos(data_sessao);

CREATE INDEX idx_sessions_tita_id
  ON cco.atendimentos(tita_agendamento_id)
  WHERE tita_agendamento_id IS NOT NULL;

CREATE INDEX idx_sessions_unidade_data
  ON cco.atendimentos(unidade, data_sessao);

CREATE INDEX idx_sessions_convenio_data
  ON cco.atendimentos(convenio, data_sessao);

CREATE INDEX idx_sessions_profissional
  ON cco.atendimentos(profissional_agendado, data_sessao);

-- ============================================================================
-- INDEXES: cco.session_authorizations
-- ============================================================================
CREATE INDEX idx_auth_session_key
  ON cco.session_authorizations(session_key);

CREATE INDEX idx_auth_status
  ON cco.session_authorizations(authorization_status);

-- ============================================================================
-- INDEXES: cco.session_substitutions
-- ============================================================================
CREATE INDEX idx_sub_session_key
  ON cco.session_substitutions(session_key);

-- ============================================================================
-- INDEXES: cco.occurrences
-- ============================================================================
CREATE INDEX idx_occ_session_key
  ON cco.occurrences(session_key);

CREATE INDEX idx_occ_tipo_severity
  ON cco.occurrences(tipo, severity);

CREATE INDEX idx_occ_created_at
  ON cco.occurrences(created_at);

-- Partial index for active occurrences (unresolved)
CREATE INDEX idx_occ_active
  ON cco.occurrences(severity, tipo, created_at)
  WHERE resolved_at IS NULL;

-- Partial index for "receita em risco" (risk revenue)
CREATE INDEX idx_occ_receita_risco
  ON cco.occurrences(session_key)
  WHERE tipo IN ('SESSAO_SEM_AUTORIZACAO','AUTORIZACAO_PENDENTE','EVOLUCAO_ATRASADA')
    AND resolved_at IS NULL;

-- ============================================================================
-- INDEXES: cco.dashboard_snapshot
-- ============================================================================
CREATE INDEX idx_snapshot_data_ref
  ON cco.dashboard_snapshot(data_ref DESC);

-- ============================================================================
-- INDEXES: cco.processing_logs
-- ============================================================================
CREATE INDEX idx_logs_job_name
  ON cco.processing_logs(job_name, started_at DESC);

-- ============================================================================
-- PG_CRON: Daily Retention Job
-- Delete resolved occurrences older than 90 days
-- ============================================================================
-- Ensures unbounded table growth is prevented. Runs daily at 01:00 UTC.
SELECT cron.schedule(
  'cco-retention-90d',
  '0 1 * * *',
  'DELETE FROM cco.occurrences WHERE resolved_at IS NOT NULL AND resolved_at < now() - interval ''90 days'''
);

-- ============================================================================
-- GRANTS (Supabase service role access)
-- Service role used by Edge Functions and Next.js APIs to bypass RLS
-- ============================================================================
GRANT USAGE ON SCHEMA cco TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cco TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cco TO service_role;
