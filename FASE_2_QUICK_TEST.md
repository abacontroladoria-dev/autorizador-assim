# ⚡ Fase 2 — Quick Test Checklist

Execute estes comandos **em sequência** no Supabase SQL Editor para validar Fase 2.

---

## 📋 PRE-DEPLOYMENT CHECKS

### ✅ Check 1: Schema CCO Exists
```sql
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'cco';
-- Expected: 1 row with "cco"
```

### ✅ Check 2: All Tables Exist
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'cco' 
ORDER BY table_name;
-- Expected: atendimentos, processing_logs, session_authorizations, session_substitutions
```

---

## 🚀 INVOCATION TESTS (Manual via curl or Supabase Functions Dashboard)

### Test 1: Invoke Job 1 (TITA Sessions)
```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: {"ok": true, "job": "cco-sync-tita-sessions", "rows_processed": N}
```

**Then validate in SQL:**
```sql
SELECT COUNT(*) as atendimentos_count FROM cco.atendimentos;
-- Should be > 0
```

---

### Test 2: Invoke Job 2 (ASSIM Authorizations)
```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-assim-authorizations \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Then validate:**
```sql
SELECT COUNT(*) as assim_count FROM cco.session_authorizations 
WHERE source = 'assim';
```

---

### Test 3: Invoke Job 3 (Fila Authorizations)
```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-authorization-queue \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Then validate:**
```sql
SELECT COUNT(*) as fila_count FROM cco.session_authorizations 
WHERE source = 'fila';
```

---

### Test 4: Invoke Job 4 (Therapist Control)
```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-therapist-control \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Then validate:**
```sql
SELECT COUNT(*) as subs_count FROM cco.session_substitutions;
```

---

## 🔄 IDEMPOTENCY TESTS

### Test 5: Re-run Job 1 (Should Not Duplicate)
```sql
-- Before re-run
SELECT COUNT(DISTINCT session_key) as unique_sessions FROM cco.atendimentos;
SELECT COUNT(*) as total_rows FROM cco.atendimentos;

-- Run: curl -X POST https://<SUPABASE_URL>/functions/v1/cco-sync-tita-sessions ...

-- After re-run
SELECT COUNT(DISTINCT session_key) as unique_sessions FROM cco.atendimentos;
SELECT COUNT(*) as total_rows FROM cco.atendimentos;
-- unique_sessions should STILL equal total_rows (no duplicates)
```

### Test 6: Check No Duplicates by (session_key, source)
```sql
SELECT session_key, source, COUNT(*) as cnt 
FROM cco.session_authorizations 
GROUP BY session_key, source 
HAVING COUNT(*) > 1;
-- Expected: 0 rows (no duplicates)
```

---

## ✔️ DATA VALIDATION TESTS

### Test 7: Session Key Consistency
```sql
SELECT COUNT(*) as collisions FROM (
  SELECT paciente_nome, data_sessao, hora_inicio, COUNT(DISTINCT session_key) as unique_keys
  FROM cco.atendimentos
  GROUP BY paciente_nome, data_sessao, hora_inicio
  HAVING COUNT(DISTINCT session_key) > 1
) t;
-- Expected: 0 (no collisions)
```

### Test 8: Date Format Validation
```sql
SELECT COUNT(*) as invalid_dates FROM cco.atendimentos 
WHERE data_sessao !~ '^\d{4}-\d{2}-\d{2}$';
-- Expected: 0
```

### Test 9: Time Format Validation
```sql
SELECT COUNT(*) as invalid_times FROM cco.atendimentos 
WHERE hora_inicio !~ '^\d{2}:\d{2}$' AND hora_inicio IS NOT NULL;
-- Expected: 0
```

### Test 10: Authorization Status Enum
```sql
SELECT DISTINCT authorization_status FROM cco.session_authorizations
ORDER BY authorization_status;
-- Expected: only CANCELADA, GLOSA, LIBERADA, PENDENTE, SEM_SOLICITACAO
```

### Test 11: Foreign Key Integrity (Authorizations)
```sql
SELECT COUNT(*) as orphaned FROM cco.session_authorizations sa
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key);
-- Expected: 0
```

### Test 12: Foreign Key Integrity (Substitutions)
```sql
SELECT COUNT(*) as orphaned FROM cco.session_substitutions ss
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key);
-- Expected: 0
```

---

## ⚡ PERFORMANCE TESTS

### Test 13: Job Execution Time
```sql
SELECT
  job_name,
  COUNT(*) as executions,
  AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration_sec,
  MAX(EXTRACT(EPOCH FROM (finished_at - started_at))) as max_duration_sec
FROM cco.processing_logs
WHERE status = 'success'
GROUP BY job_name
ORDER BY job_name;
-- Expected: avg < 20s, max < 30s
```

### Test 14: Index Usage Verification
```sql
EXPLAIN ANALYZE
SELECT COUNT(*) FROM cco.atendimentos WHERE data_sessao = CURRENT_DATE;
-- Should show "Seq Scan on cco.atendimentos" or "Index Scan on idx_sessions_data_sessao"
```

---

## 📋 LOGGING TESTS

### Test 15: Check Processing Logs
```sql
SELECT 
  job_name, 
  started_at, 
  finished_at, 
  status, 
  rows_processed, 
  error_message
FROM cco.processing_logs 
ORDER BY started_at DESC 
LIMIT 10;
-- Expected: All fields populated for success, error_message null for success
```

### Test 16: Check Error Handling
```sql
SELECT COUNT(*) as error_count FROM cco.processing_logs 
WHERE status = 'error';
-- Expected: <= number of intentional test errors
```

---

## 🔗 INTEGRATION TEST

### Test 17: Full Data Consistency
```sql
SELECT 
  (SELECT COUNT(DISTINCT session_key) FROM cco.atendimentos) as total_sessions,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_authorizations) as with_authorization,
  (SELECT COUNT(DISTINCT session_key) FROM cco.session_substitutions) as with_substitution,
  (SELECT COUNT(*) FROM cco.processing_logs WHERE status = 'success') as successful_syncs;
```

**Acceptance:**
- total_sessions > 0
- with_authorization < total_sessions (not all have auth)
- with_substitution < total_sessions (not all have subs)
- successful_syncs > 0

---

## 📊 ACCEPTANCE CRITERIA CHECKLIST

- [ ] **Schema created** — `cco` schema exists
- [ ] **Tables exist** — 4 tables: atendimentos, session_authorizations, session_substitutions, processing_logs
- [ ] **Job 1 tested** — cco-sync-tita-sessions returns rows_processed > 0
- [ ] **Job 2 tested** — cco-sync-assim-authorizations returns rows_processed ≥ 0
- [ ] **Job 3 tested** — cco-sync-authorization-queue returns rows_processed ≥ 0
- [ ] **Job 4 tested** — cco-sync-therapist-control returns rows_processed ≥ 0
- [ ] **Idempotency confirmed** — Re-running Job 1 does not duplicate rows
- [ ] **No duplicate records** — COUNT(DISTINCT) == COUNT(*) for all tables
- [ ] **Session keys consistent** — No collisions detected
- [ ] **Dates valid** — All dates in YYYY-MM-DD format
- [ ] **Times valid** — All times in HH:MM format
- [ ] **Status enum valid** — Only valid authorization_status values
- [ ] **FK integrity OK** — No orphaned references
- [ ] **Performance OK** — Jobs complete in < 30 seconds
- [ ] **Logging works** — All jobs logged to processing_logs
- [ ] **Error handling OK** — Failed jobs logged with messages
- [ ] **Data consistent** — Sessions, authorizations, and substitutions have proper overlap

---

## 🎯 NEXT STEPS

If **all tests pass** ✅:
1. Commit Fase 2 code
2. Proceed to **Fase 3** — Conciliation Engine

If **any test fails** ❌:
1. Review the error message and stack trace
2. Check `cco.processing_logs` for detailed errors
3. Fix the job code
4. Re-run the test

---

## 🆘 QUICK ROLLBACK

If Fase 2 needs to be rolled back:

```sql
-- Disable cron jobs
SELECT cron.unschedule('cco-sync-tita-sessions');
SELECT cron.unschedule('cco-sync-assim-authorizations');
SELECT cron.unschedule('cco-sync-authorization-queue');
SELECT cron.unschedule('cco-sync-therapist-control');

-- Clear data (optional)
DELETE FROM cco.session_authorizations;
DELETE FROM cco.session_substitutions;
DELETE FROM cco.atendimentos;
DELETE FROM cco.processing_logs;
```

Then delete the Edge Functions via CLI:
```bash
supabase functions delete cco-sync-tita-sessions
supabase functions delete cco-sync-assim-authorizations
supabase functions delete cco-sync-authorization-queue
supabase functions delete cco-sync-therapist-control
```
