-- ============================================================================
-- FASE 2-B — AUDIT & VALIDATION QUERIES
-- ============================================================================
-- Execute estas queries para validar:
-- 1. Detecção de mutações funcionando
-- 2. Consolidação de histórico operacional
-- 3. Registros órfãos marcados corretamente
-- 4. Integridade de dados mantida

-- ============================================================================
-- CHECK 1: Schema Changes Applied
-- ============================================================================
SELECT 'CHECK_1: Schema updates applied' as check_name;

-- Verify cco.session_mutations table exists
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'cco' AND table_name = 'session_mutations'
) as mutations_table_exists;

-- Verify orphaned_at column exists
SELECT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'cco' AND table_name = 'atendimentos' AND column_name = 'orphaned_at'
) as orphaned_at_exists;

-- Verify inherited_from column exists
SELECT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'cco' AND table_name = 'session_authorizations' AND column_name = 'inherited_from'
) as inherited_from_exists;

-- ============================================================================
-- CHECK 2: Mutation Detection Validation
-- ============================================================================
SELECT 'CHECK_2: Mutation detection working' as check_name;

-- Count total mutations recorded
SELECT
  COUNT(*) as total_mutations,
  COUNT(CASE WHEN mutation_type = 'RESCHEDULED' THEN 1 END) as rescheduled_count,
  COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_count
FROM cco.session_mutations;

-- Show recent mutations (last 10)
SELECT 'Recent mutations (last 10):' as detail;
SELECT
  id,
  mutation_type,
  session_key_old,
  session_key_new,
  data_sessao_old,
  data_sessao_new,
  detected_at,
  processed_at
FROM cco.session_mutations
ORDER BY detected_at DESC
LIMIT 10;

-- ============================================================================
-- CHECK 3: Orphan Marking Validation
-- ============================================================================
SELECT 'CHECK_3: Orphans marked correctly' as check_name;

-- Count orphaned records
SELECT
  COUNT(*) as total_orphaned,
  COUNT(DISTINCT paciente_nome) as unique_patients_orphaned
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL;

-- Show orphaned records details
SELECT 'Sample orphaned records:' as detail;
SELECT
  session_key,
  paciente_nome,
  data_sessao,
  orphaned_at,
  orphan_reason
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL
ORDER BY orphaned_at DESC
LIMIT 10;

-- ============================================================================
-- CHECK 4: Authorization Consolidation Validation
-- ============================================================================
SELECT 'CHECK_4: Authorizations inherited correctly' as check_name;

-- Count inherited authorizations
SELECT
  COUNT(*) as total_inherited,
  COUNT(DISTINCT inherited_from) as unique_source_sessions
FROM cco.session_authorizations
WHERE inherited_from IS NOT NULL;

-- Show inherited authorizations
SELECT 'Sample inherited authorizations:' as detail;
SELECT
  session_key,
  inherited_from,
  source,
  authorization_status,
  synced_at
FROM cco.session_authorizations
WHERE inherited_from IS NOT NULL
ORDER BY synced_at DESC
LIMIT 10;

-- ============================================================================
-- CHECK 5: Data Integrity Validation
-- ============================================================================
SELECT 'CHECK_5: Referential integrity' as check_name;

-- Verify no broken FKs in session_authorizations pointing to orphaned sessions
SELECT 'Orphaned FK check - session_authorizations:' as detail;
SELECT
  COUNT(*) as broken_fk_count,
  COUNT(DISTINCT sa.session_key) as unique_broken_keys
FROM cco.session_authorizations sa
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = sa.session_key
    AND a.orphaned_at IS NULL
);

-- Verify no broken FKs in session_substitutions
SELECT 'Orphaned FK check - session_substitutions:' as detail;
SELECT
  COUNT(*) as broken_fk_count,
  COUNT(DISTINCT ss.session_key) as unique_broken_keys
FROM cco.session_substitutions ss
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = ss.session_key
    AND a.orphaned_at IS NULL
);

-- Verify no broken FKs in occurrences
SELECT 'Orphaned FK check - occurrences:' as detail;
SELECT
  COUNT(*) as broken_fk_count,
  COUNT(DISTINCT occ.session_key) as unique_broken_keys
FROM cco.occurrences occ
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = occ.session_key
    AND a.orphaned_at IS NULL
);

-- ============================================================================
-- CHECK 6: Mutation-to-Orphan Mapping
-- ============================================================================
SELECT 'CHECK_6: Mutation mapping validation' as check_name;

-- Verify each mutation has corresponding orphaned record
SELECT 'Orphaned records without mutation mapping (potential issues):' as detail;
SELECT
  a.session_key,
  a.orphaned_at,
  a.orphan_reason,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM cco.session_mutations
      WHERE session_key_old = a.session_key
    ) THEN 'FOUND_MUTATION'
    ELSE 'NO_MUTATION_RECORD'
  END as mutation_status
FROM cco.atendimentos a
WHERE a.orphaned_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cco.session_mutations
    WHERE session_key_old = a.session_key
  )
LIMIT 10;

-- ============================================================================
-- CHECK 7: Retention Policy Validation
-- ============================================================================
SELECT 'CHECK_7: Retention policy working' as check_name;

-- Count records nearing 30-day cleanup threshold
SELECT
  CASE
    WHEN orphaned_at < now() - interval '30 days' THEN 'ELIGIBLE_FOR_DELETE'
    WHEN orphaned_at < now() - interval '25 days' THEN 'NEAR_THRESHOLD'
    ELSE 'WITHIN_RETENTION'
  END as retention_status,
  COUNT(*) as record_count,
  MIN(orphaned_at) as oldest_record,
  MAX(orphaned_at) as newest_record
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL
GROUP BY retention_status
ORDER BY retention_status;

-- ============================================================================
-- CHECK 8: TITA ID Tracking
-- ============================================================================
SELECT 'CHECK_8: TITA ID consistency' as detail;

-- Verify tita_agendamento_id is preserved in mutations
SELECT
  COUNT(DISTINCT m.tita_agendamento_id) as unique_tita_ids_tracked,
  COUNT(DISTINCT m.tita_agendamento_id) FILTER (WHERE m.tita_agendamento_id IS NOT NULL) as non_null_tita_ids
FROM cco.session_mutations m;

-- Find sessions with same TITA ID but different session_keys (mutation evidence)
SELECT 'Sessions with multiple session_keys (mutation evidence):' as detail;
SELECT
  tita_agendamento_id,
  COUNT(DISTINCT session_key) as session_key_count,
  MIN(data_sessao) as min_date,
  MAX(data_sessao) as max_date,
  STRING_AGG(DISTINCT session_key, ', ' ORDER BY session_key) as all_session_keys
FROM cco.atendimentos
WHERE tita_agendamento_id IS NOT NULL
GROUP BY tita_agendamento_id
HAVING COUNT(DISTINCT session_key) > 1
ORDER BY session_key_count DESC
LIMIT 10;

-- ============================================================================
-- CHECK 9: Processing Log Verification
-- ============================================================================
SELECT 'CHECK_9: Mutation processing logged' as check_name;

-- Check if sync jobs are executing and recording mutations
SELECT
  job_name,
  COUNT(*) as executions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'error') as failed,
  MAX(finished_at) as last_execution
FROM cco.processing_logs
WHERE job_name IN ('cco-sync-tita-sessions', 'cco-mutation-detector')
GROUP BY job_name
ORDER BY last_execution DESC;

-- ============================================================================
-- SUMMARY METRICS
-- ============================================================================
SELECT 'SUMMARY_METRICS' as section;

SELECT
  'Overall Data Health' as metric,
  CASE
    WHEN (SELECT COUNT(*) FROM cco.atendimentos) = 0 THEN 0
    ELSE ROUND(
      (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NULL) * 100.0 /
      (SELECT COUNT(*) FROM cco.atendimentos),
      2
    )
  END as active_sessions_percent,
  (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NOT NULL) as orphaned_records,
  (SELECT COUNT(*) FROM cco.session_mutations) as total_mutations,
  (SELECT COUNT(*) FROM cco.session_authorizations WHERE inherited_from IS NOT NULL) as inherited_authorizations;
