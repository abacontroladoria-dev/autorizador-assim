# Fase 2 — Validation & Testing Guide

**Objective**: Validate that all 4 sync jobs are working correctly, idempotent, and logging properly.

---

## Pre-Deployment Checklist

- [ ] Fase 1 migration applied (schema cco exists)
- [ ] Edge Functions directory structure created
- [ ] All 4 job files exist and have valid TypeScript
- [ ] `cco-shared/logger.ts` exists and exports correctly
- [ ] TITA_TOKEN environment variable is set in Supabase
- [ ] Service role key is accessible to Edge Functions

---

## Deployment Steps

### 1. Deploy Edge Functions

```bash
cd c:\Users\UNIVERSO\projeto_automacao\sistema-pulsar

# Deploy shared utilities (if supported)
supabase functions deploy cco-shared

# Deploy each job
supabase functions deploy cco-sync-tita-sessions
supabase functions deploy cco-sync-assim-authorizations
supabase functions deploy cco-sync-authorization-queue
supabase functions deploy cco-sync-therapist-control
```

### 2. Apply Cron Job Migration

```bash
supabase migration list
supabase db push
# or: paste 20260608000002_cco_cron_jobs.sql into Supabase SQL Editor
```

### 3. Verify Cron Jobs Registered

```sql
-- Supabase SQL Editor
SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'cco-%' ORDER BY jobname;
```

**Expected output**:
```
jobname                          | schedule                               | command
---------------------------------|----------------------------------------|----------
cco-sync-tita-sessions          | */5 * * * *                            | SELECT net.http_post(...)
cco-sync-assim-authorizations   | 1,6,11,16,21,26,31,36,41,46,51,56 * * * * | SELECT net.http_post(...)
cco-sync-authorization-queue    | 2,7,12,17,22,27,32,37,42,47,52,57 * * * * | SELECT net.http_post(...)
cco-sync-therapist-control      | 3,18,33,48 * * * *                     | SELECT net.http_post(...)
```

---

## Manual Testing

### Test 1: Invoke Job 1 (TITA Sessions)

```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response**:
```json
{
  "ok": true,
  "job": "cco-sync-tita-sessions",
  "rows_processed": 123
}
```

**Validate in database**:
```sql
SELECT COUNT(*) as count FROM cco.atendimentos;
SELECT * FROM cco.processing_logs WHERE job_name = 'cco-sync-tita-sessions' ORDER BY started_at DESC LIMIT 1;
```

---

### Test 2: Invoke Job 2 (ASSIM Authorizations)

```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-assim-authorizations \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response**:
```json
{
  "ok": true,
  "job": "cco-sync-assim-authorizations",
  "rows_processed": 45
}
```

**Validate**:
```sql
SELECT COUNT(*) as count FROM cco.session_authorizations WHERE source = 'assim';
SELECT authorization_status, COUNT(*) FROM cco.session_authorizations WHERE source = 'assim' GROUP BY authorization_status;
```

---

### Test 3: Invoke Job 3 (Fila Authorizations)

```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-authorization-queue \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response**:
```json
{
  "ok": true,
  "job": "cco-sync-authorization-queue",
  "rows_processed": 67
}
```

**Validate**:
```sql
SELECT COUNT(*) as count FROM cco.session_authorizations WHERE source = 'fila';
SELECT authorization_status, COUNT(*) FROM cco.session_authorizations WHERE source = 'fila' GROUP BY authorization_status;
```

---

### Test 4: Invoke Job 4 (Therapist Control)

```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-therapist-control \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response**:
```json
{
  "ok": true,
  "job": "cco-sync-therapist-control",
  "rows_processed": 12
}
```

**Validate**:
```sql
SELECT COUNT(*) as count FROM cco.session_substitutions;
SELECT status_ct, COUNT(*) FROM cco.session_substitutions GROUP BY status_ct;
```

---

## Idempotency Tests

### Test 5: Re-run Job 1 Immediately

```bash
# Run Job 1
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
# → Response: {"ok": true, "rows_processed": 123}

# Wait 1 second

# Run Job 1 again
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
# → Response: {"ok": true, "rows_processed": 0} or same count (idempotent)
```

**Validate no duplicates**:
```sql
SELECT COUNT(DISTINCT session_key) as unique_sessions, COUNT(*) as total_rows 
FROM cco.atendimentos;
-- Should be: unique_sessions == total_rows (no duplicates)
```

---

### Test 6: Re-run Jobs 2 & 3 Simultaneously

```bash
# Simulate concurrent execution (both jobs running at same time)
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-assim-authorizations \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' &

curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-authorization-queue \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' &

wait
```

**Validate no corruption**:
```sql
-- Each source should have exactly one row per session_key
SELECT session_key, source, COUNT(*) as cnt 
FROM cco.session_authorizations 
GROUP BY session_key, source 
HAVING COUNT(*) > 1;
-- Should return 0 rows (no duplicates per source)
```

---

## Data Validation Tests

### Test 7: Check Session Key Consistency

```sql
-- Session keys should be deterministic (same input → same hash)
-- If a session is updated in TITA, should reuse same session_key
SELECT paciente_nome, data_sessao, hora_inicio, COUNT(DISTINCT session_key) as unique_keys
FROM cco.atendimentos
GROUP BY paciente_nome, data_sessao, hora_inicio
HAVING COUNT(DISTINCT session_key) > 1;
-- Should return 0 rows (no collisions)
```

---

### Test 8: Check Date/Time Normalization

```sql
-- All dates should be in YYYY-MM-DD format
SELECT COUNT(*) as count
FROM cco.atendimentos
WHERE data_sessao !~ '^\d{4}-\d{2}-\d{2}$';
-- Should be 0 (all dates valid)

-- All times should be in HH:MM format
SELECT COUNT(*) as count
FROM cco.atendimentos
WHERE hora_inicio !~ '^\d{2}:\d{2}$' AND hora_inicio IS NOT NULL;
-- Should be 0 (all times valid)
```

---

### Test 9: Check Authorization Status Enum

```sql
-- All status values should be valid enum values
SELECT DISTINCT authorization_status
FROM cco.session_authorizations
ORDER BY authorization_status;
-- Should return exactly 5 values: LIBERADA, PENDENTE, GLOSA, CANCELADA, SEM_SOLICITACAO
```

---

### Test 10: Check Foreign Key Referential Integrity

```sql
-- All session_authorizations.session_key should reference valid cco.atendimentos rows
SELECT COUNT(*) as orphaned_auths
FROM cco.session_authorizations sa
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key);
-- Should be 0 (no orphaned records)

-- All session_substitutions.session_key should reference valid cco.atendimentos rows
SELECT COUNT(*) as orphaned_subs
FROM cco.session_substitutions ss
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key);
-- Should be 0 (no orphaned records)
```

---

## Performance Tests

### Test 11: Job Execution Time

```sql
-- Average execution time per job (should be < 30 seconds for 5-min interval)
SELECT 
  job_name,
  COUNT(*) as executions,
  AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration_sec,
  MAX(EXTRACT(EPOCH FROM (finished_at - started_at))) as max_duration_sec
FROM cco.processing_logs
WHERE status = 'success'
GROUP BY job_name
ORDER BY job_name;
```

**Acceptance criteria**:
- Avg execution time < 20 seconds
- Max execution time < 30 seconds
- No job blocking others

---

### Test 12: Index Performance

```sql
-- Verify indexes are being used
EXPLAIN ANALYZE
SELECT COUNT(*) FROM cco.atendimentos WHERE data_sessao = CURRENT_DATE;
-- Should use idx_sessions_data_sessao

EXPLAIN ANALYZE
SELECT COUNT(*) FROM cco.session_authorizations WHERE authorization_status = 'PENDENTE';
-- Should use idx_auth_status
```

---

## Logging Tests

### Test 13: Check Processing Logs

```sql
SELECT * FROM cco.processing_logs 
ORDER BY started_at DESC 
LIMIT 10;
```

**Validate each log entry**:
- [ ] `job_name` is not null
- [ ] `started_at` is a valid timestamp
- [ ] `finished_at` is after `started_at` (for success)
- [ ] `status` is one of: 'running', 'success', 'error'
- [ ] `rows_processed` is >= 0 (for success)
- [ ] `error_message` is null (for success) or has content (for error)

---

### Test 14: Check Error Handling

```sql
-- Simulate an error by making a job fail (e.g., incorrect table name)
-- Then check logs capture the error:
SELECT job_name, status, error_message 
FROM cco.processing_logs 
WHERE status = 'error' 
ORDER BY started_at DESC 
LIMIT 1;
```

**Validate**:
- [ ] Error is logged with clear message
- [ ] `finished_at` is set
- [ ] `rows_processed` is null or 0
- [ ] Error message describes the problem (e.g., "table not found")

---

## Integration Tests

### Test 15: Full Sync Cycle

```sql
-- Before any job runs
SELECT COUNT(*) as count_initial FROM cco.atendimentos;

-- Run all 4 jobs in sequence
-- (via curl or Supabase Dashboard)

-- After all jobs
SELECT COUNT(*) as count_after FROM cco.atendimentos;
SELECT COUNT(*) as count_auth FROM cco.session_authorizations;
SELECT COUNT(*) as count_subs FROM cco.session_substitutions;

-- Verify all 3 tables have related data
SELECT 
  (SELECT COUNT(DISTINCT session_key) FROM cco.atendimentos) as sessions,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_authorizations) as with_auth,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_substitutions) as with_subs;
```

**Acceptance criteria**:
- [ ] Sessions count > 0
- [ ] with_auth < sessions (not all sessions have authorization)
- [ ] with_subs < sessions (not all sessions have substitution)

---

## Acceptance Criteria (Fase 2)

- [ ] **4 Edge Functions deployed** without errors
- [ ] **4 Cron jobs registered** in pg_cron
- [ ] **Each job tested manually** and returns valid response
- [ ] **Idempotency confirmed** — re-run same job → 0 new rows inserted
- [ ] **No duplicates** — COUNT(DISTINCT) == COUNT(*) for each table
- [ ] **Foreign keys valid** — no orphaned session_key references
- [ ] **Enums enforced** — only valid authorization_status values
- [ ] **Dates/times normalized** — all in YYYY-MM-DD and HH:MM formats
- [ ] **Logging complete** — all jobs logged to cco.processing_logs
- [ ] **Performance acceptable** — jobs complete in < 30 seconds
- [ ] **Error handling works** — failed jobs logged with error message
- [ ] **Data consistency** — related data exists across tables

---

## Rollback Plan (If Needed)

### Rollback Cron Jobs
```sql
SELECT cron.unschedule('cco-sync-tita-sessions');
SELECT cron.unschedule('cco-sync-assim-authorizations');
SELECT cron.unschedule('cco-sync-authorization-queue');
SELECT cron.unschedule('cco-sync-therapist-control');
```

### Delete Edge Functions
```bash
supabase functions delete cco-sync-tita-sessions
supabase functions delete cco-sync-assim-authorizations
supabase functions delete cco-sync-authorization-queue
supabase functions delete cco-sync-therapist-control
```

### Clear CCO Data (Optional)
```sql
DELETE FROM cco.session_authorizations;
DELETE FROM cco.session_substitutions;
DELETE FROM cco.atendimentos;
DELETE FROM cco.processing_logs;
```

---

## Next Phase

After all acceptance criteria are met, proceed to **Fase 3** (Conciliation Engine):
- Implement business rule logic
- Generate occurrences
- Update dashboard snapshot
- Jobs will call engine upon completion
