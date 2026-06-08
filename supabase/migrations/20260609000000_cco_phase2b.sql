-- Fase 2-B — Session Mutation Handling (PRÉ-REQUISITO PARA FASE 3)
-- Rastreia remarcações/deleções de sessões e consolida histórico de autorizações

-- ============================================================================
-- TABLE: cco.session_mutations
-- ============================================================================
-- Change log: registra todas as vezes que uma sessão é remarcada ou deletada
-- Permite rastrear herança de dados entre session_keys antigos e novos

CREATE TABLE IF NOT EXISTS cco.session_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tita_agendamento_id bigint NOT NULL,
  session_key_old text NOT NULL,
  session_key_new text NOT NULL,
  mutation_type text NOT NULL CHECK (mutation_type IN ('RESCHEDULED', 'DELETED', 'CONSOLIDATED')),
  data_sessao_old date,
  data_sessao_new date,
  hora_inicio_old time,
  hora_inicio_new time,
  paciente_nome text,
  detected_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  consolidation_note text,

  UNIQUE (session_key_old, session_key_new),
  FOREIGN KEY (session_key_new) REFERENCES cco.atendimentos(session_key) ON DELETE SET NULL
);

CREATE INDEX idx_mutations_tita_id ON cco.session_mutations(tita_agendamento_id);
CREATE INDEX idx_mutations_old_key ON cco.session_mutations(session_key_old);
CREATE INDEX idx_mutations_new_key ON cco.session_mutations(session_key_new);
CREATE INDEX idx_mutations_detected_at ON cco.session_mutations(detected_at);
CREATE INDEX idx_mutations_processed_at ON cco.session_mutations(processed_at)
  WHERE processed_at IS NULL;

-- ============================================================================
-- ALTER TABLE: cco.session_authorizations — Inheritance Tracking
-- ============================================================================
-- Rastrear quando autorização foi herdada de sessão remarcada

ALTER TABLE cco.session_authorizations
  ADD COLUMN IF NOT EXISTS inherited_from text DEFAULT NULL;

COMMENT ON COLUMN cco.session_authorizations.inherited_from IS
  'session_key da sessão antiga quando autorização foi herdada após remarcação. '
  'NULL = autorização original ou sincronia normal.';

-- ============================================================================
-- ALTER TABLE: cco.atendimentos — Soft Delete Columns
-- ============================================================================
-- Marcar registros órfãos sem deletá-los (auditoria de 30 dias)

ALTER TABLE cco.atendimentos
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS orphan_reason text DEFAULT NULL;

CREATE INDEX idx_atend_orphaned_at ON cco.atendimentos(orphaned_at)
  WHERE orphaned_at IS NULL;

-- ============================================================================
-- COMMENT: Documentação de Schema
-- ============================================================================

COMMENT ON TABLE cco.session_mutations IS
  'Change log de mutações de sessões. Quando uma sessão é remarcada em TITA (data/hora muda) '
  'ou deletada, registra session_key_old → session_key_new para rastreamento de herança '
  'de autorizações e validação de orphans.';

COMMENT ON COLUMN cco.atendimentos.orphaned_at IS
  'Timestamp de quando a sessão foi marcada como órfã (session_key_old após remarcação). '
  'Registros em soft-delete permitem auditoria por 30 dias antes de hard-delete.';

COMMENT ON COLUMN cco.atendimentos.orphan_reason IS
  'Razão pela qual a sessão foi marcada como órfã (ex: "RESCHEDULED → abc123...def456...")';

-- ============================================================================
-- CRON: Cleanup de Registros Órfãos
-- ============================================================================
-- Hard-delete de orphans após 30 dias de retenção

-- Cleanup cron job: Remove orphaned records after 30 days (retention window)
-- Executes daily at 02:00 UTC (allows audit trail before hard delete)
SELECT cron.schedule(
  'cco-cleanup-orphans',
  '0 2 * * *',
  $$
    DELETE FROM cco.atendimentos
    WHERE orphaned_at IS NOT NULL
      AND orphaned_at < now() - interval '30 days'
  $$
);

-- ============================================================================
-- RPC FUNCTION: log_job_execution (in public schema for RPC access)
-- ============================================================================
-- Wrapper to allow REST API to write to cco.processing_logs
-- Must be in public schema for Supabase RPC to expose it

CREATE OR REPLACE FUNCTION public.log_job_execution(
  p_job_name text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_status text,
  p_rows_processed integer DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cco.processing_logs (
    job_name,
    started_at,
    finished_at,
    status,
    rows_processed,
    error_message
  ) VALUES (
    p_job_name,
    p_started_at,
    p_finished_at,
    p_status,
    p_rows_processed,
    p_error_message
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.log_job_execution TO service_role, authenticated, anon;
