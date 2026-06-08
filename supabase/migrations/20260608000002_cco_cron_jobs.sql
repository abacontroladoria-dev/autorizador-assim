-- Phase 2: Central de Conciliação Operacional (CCO) - Cron Job Registration
-- SPEC-CCO-001 | Sistema PULSAR
-- Register 4 sync jobs in pg_cron

-- ============================================================================
-- JOB 1: sync_tita_sessions (every 5 minutes, offset at :00)
-- ============================================================================
-- Reads from TITA API and materializes sessions into cco.atendimentos
-- Dependencies: None (reads external API)
SELECT cron.schedule(
  'cco-sync-tita-sessions',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cco-sync-tita-sessions',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body := '{}'::jsonb
    )
  $$
);

-- ============================================================================
-- JOB 2: sync_assim_authorizations (every 5 minutes, offset at :03)
-- ============================================================================
-- Reads from autorizacoes_assim and materializes into cco.session_authorizations
-- Dependencies: Requires Job 1 to have populated cco.atendimentos (3-min buffer)
SELECT cron.schedule(
  'cco-sync-assim-authorizations',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cco-sync-assim-authorizations',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body := '{}'::jsonb
    )
  $$
);

-- ============================================================================
-- JOB 3: sync_authorization_queue (every 5 minutes, offset at :04)
-- ============================================================================
-- Reads from fila_autorizacoes and materializes into cco.session_authorizations
-- Dependencies: Requires Job 1 to have populated cco.atendimentos (4-min buffer)
SELECT cron.schedule(
  'cco-sync-authorization-queue',
  '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cco-sync-authorization-queue',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body := '{}'::jsonb
    )
  $$
);

-- ============================================================================
-- JOB 4: sync_therapist_control (every 15 minutes, offset at :05)
-- ============================================================================
-- Reads from controle_terapeutico and materializes into cco.session_substitutions
-- Dependencies: Requires Job 1 to have populated cco.atendimentos (5-min buffer)
SELECT cron.schedule(
  'cco-sync-therapist-control',
  '5,20,35,50 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cco-sync-therapist-control',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body := '{}'::jsonb
    )
  $$
);

-- ============================================================================
-- NOTES
-- ============================================================================
-- Jobs use staggered start times to prevent thundering herd:
--   Job 1: :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
--   Job 2: :01, :06, :11, :16, :21, :26, :31, :36, :41, :46, :51, :56
--   Job 3: :02, :07, :12, :17, :22, :27, :32, :37, :42, :47, :52, :57
--   Job 4: :03, :18, :33, :48 (15-min window)
--
-- Rate-limit mitigation:
--   - Jobs 1-3 sync every 5 minutes (overlapping reads of public tables OK)
--   - Job 4 syncs every 15 minutes (controle_terapeutico changes slower)
--   - All offsets prevent simultaneous TITA API calls
--
-- Logging: All jobs log to cco.processing_logs with job_name, status, rows_processed
--
-- Error handling: If a job fails, pg_cron retries silently on next interval
--
-- IMPORTANT: Edge Functions must be deployed before cron jobs can execute
