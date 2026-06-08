-- ============================================================================
-- FASE 2 — CCO VALIDATION TESTS
-- Execute all 17 tests in order
-- ============================================================================

-- ============================================================================
-- PRE-DEPLOYMENT CHECKS
-- ============================================================================

-- Check 1: Schema CCO Exists
SELECT 'CHECK_1: Schema exists' as test_name;
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'cco';

-- Check 2: All Tables Exist
SELECT 'CHECK_2: Tables exist' as test_name;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'cco'
ORDER BY table_name;

-- ============================================================================
-- DATA VALIDATION TESTS (via SQL, after jobs have run)
-- ============================================================================

-- Test 7: Session Key Consistency (no collisions)
SELECT 'TEST_7: Session key consistency' as test_name;
SELECT COUNT(*) as collisions FROM (
  SELECT paciente_nome, data_sessao, hora_inicio, COUNT(DISTINCT session_key) as unique_keys
  FROM cco.atendimentos
  GROUP BY paciente_nome, data_sessao, hora_inicio
  HAVING COUNT(DISTINCT session_key) > 1
) t;

-- Test 8: Date Format Validation
SELECT 'TEST_8: Date format validation' as test_name;
SELECT COUNT(*) as invalid_dates FROM cco.atendimentos
WHERE data_sessao !~ '^\d{4}-\d{2}-\d{2}$';

-- Test 9: Time Format Validation
SELECT 'TEST_9: Time format validation' as test_name;
SELECT COUNT(*) as invalid_times FROM cco.atendimentos
WHERE hora_inicio !~ '^\d{2}:\d{2}$' AND hora_inicio IS NOT NULL;

-- Test 10: Authorization Status Enum
SELECT 'TEST_10: Status enum validation' as test_name;
SELECT DISTINCT authorization_status FROM cco.session_authorizations
ORDER BY authorization_status;

-- Test 11: Foreign Key Integrity (Authorizations)
SELECT 'TEST_11: FK integrity - authorizations' as test_name;
SELECT COUNT(*) as orphaned FROM cco.session_authorizations sa
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key);

-- Test 12: Foreign Key Integrity (Substitutions)
SELECT 'TEST_12: FK integrity - substitutions' as test_name;
SELECT COUNT(*) as orphaned FROM cco.session_substitutions ss
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key);

-- Test 5: Idempotency - Check no duplicates by session_key
SELECT 'TEST_5: Idempotency - duplicates by session_key' as test_name;
SELECT session_key, COUNT(*) as cnt
FROM cco.atendimentos
GROUP BY session_key
HAVING COUNT(*) > 1;

-- Test 6: Check no duplicates by (session_key, source)
SELECT 'TEST_6: Idempotency - duplicates by composite key' as test_name;
SELECT session_key, source, COUNT(*) as cnt
FROM cco.session_authorizations
GROUP BY session_key, source
HAVING COUNT(*) > 1;

-- Test 13: Job Execution Time
SELECT 'TEST_13: Performance - job execution time' as test_name;
SELECT
  job_name,
  COUNT(*) as executions,
  ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric, 2) as avg_duration_sec,
  ROUND(MAX(EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric, 2) as max_duration_sec
FROM cco.processing_logs
WHERE status = 'success'
GROUP BY job_name
ORDER BY job_name;

-- Test 15: Check Processing Logs
SELECT 'TEST_15: Logging - processing logs exist' as test_name;
SELECT COUNT(*) as log_count FROM cco.processing_logs;

-- Test 16: Check Error Handling
SELECT 'TEST_16: Error handling - error logs' as test_name;
SELECT COUNT(*) as error_count FROM cco.processing_logs
WHERE status = 'error';

-- Test 17: Full Data Consistency
SELECT 'TEST_17: Integration - data consistency' as test_name;
SELECT
  (SELECT COUNT(DISTINCT session_key) FROM cco.atendimentos) as total_sessions,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_authorizations) as with_authorization,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_substitutions) as with_substitution,
  (SELECT COUNT(*) FROM cco.processing_logs WHERE status = 'success') as successful_syncs;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '====== TEST EXECUTION COMPLETE ======' as summary;
