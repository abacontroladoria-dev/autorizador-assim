# 🧪 FASE 2-B — Test Execution Report
## Session Mutation Handling — Central de Conciliação Operacional

**Date**: 2026-06-08  
**Status**: ⏳ **READY FOR EXECUTION**  
**Tester Role**: QA Engineer  
**Target Environment**: Production Supabase Database  

---

## 📋 Pre-Execution Checklist

- [ ] Migration `20260609000000_cco_phase2b.sql` has been applied to database
- [ ] Edge Function `cco-sync-tita-sessions` has been deployed with mutation detection
- [ ] At least one sync cycle has run (to populate data)
- [ ] Supabase SQL Editor access available
- [ ] Service role key or equivalent access ready

---

## 🚀 How to Execute Tests

### Setup

1. **Open Supabase SQL Editor**:
   - Navigate to: `https://<your-supabase-url>/project/_/sql`
   - Ensure you're connected to the production database

2. **Load Test Queries**:
   - Copy entire contents of `FASE2B_AUDIT_QUERIES.sql`
   - Paste into SQL Editor

### Execution

3. **Run All Checks**:
   - Execute entire script sequentially
   - Wait for all 9 CHECK sections to complete

4. **Record Results**:
   - Document output for each CHECK
   - Compare against expected results below

---

## 🎯 Test Scenarios & Expected Results

### TEST 1: Schema Validation (CHECK_1)

**Objective**: Verify all schema changes from migration were applied correctly.

**SQL**: 
```sql
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
```

**Expected Results**:
```
mutations_table_exists    | TRUE
orphaned_at_exists        | TRUE
inherited_from_exists     | TRUE
```

**Acceptance Criteria**:
- [ ] All three results return `TRUE`
- [ ] No error messages in output

**Status**: ⏳ Pending

---

### TEST 2: Mutation Detection (CHECK_2)

**Objective**: Verify mutations are being detected and recorded.

**SQL**:
```sql
-- Count total mutations recorded
SELECT
  COUNT(*) as total_mutations,
  COUNT(CASE WHEN mutation_type = 'RESCHEDULED' THEN 1 END) as rescheduled_count,
  COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_count
FROM cco.session_mutations;

-- Show recent mutations (last 10)
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
```

**Expected Results**:
- `total_mutations`: >= 0 (depends on actual data; could be 0 if no sessions remapped recently)
- `rescheduled_count`: should match or be less than `total_mutations`
- `processed_count`: should equal `total_mutations` (all processed)
- Recent mutations list may be empty if no mutations occurred

**If mutations exist** (after session remapping in TITA):
- Each mutation has `session_key_old`, `session_key_new`, `detected_at`, `processed_at`
- All `processed_at` values are NOT NULL

**Acceptance Criteria**:
- [ ] No error executing query
- [ ] `processed_count` == `total_mutations` (100% processing rate)
- [ ] Each mutation has all required fields populated
- [ ] If mutations > 0: verify `data_sessao_old` ≠ `data_sessao_new`

**Status**: ⏳ Pending

---

### TEST 3: Orphan Marking (CHECK_3)

**Objective**: Verify old sessions are marked as orphaned after mutation.

**SQL**:
```sql
-- Count orphaned records
SELECT
  COUNT(*) as total_orphaned,
  COUNT(DISTINCT paciente_nome) as unique_patients_orphaned
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL;

-- Show orphaned records details
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
```

**Expected Results**:
- `total_orphaned`: >= 0 (depends on actual mutations)
- If mutations exist: `total_orphaned` > 0
- Each orphaned record has:
  - `orphaned_at`: NOT NULL, recent timestamp
  - `orphan_reason`: text like "RESCHEDULED → def456..."

**Acceptance Criteria**:
- [ ] Orphaned record count matches mutation count (1:1 mapping)
- [ ] All orphaned records have valid `orphaned_at` timestamps
- [ ] `orphan_reason` contains "RESCHEDULED" or appropriate mutation type

**Status**: ⏳ Pending

---

### TEST 4: Authorization Consolidation (CHECK_4)

**Objective**: Verify authorizations are inherited from old sessions to new.

**SQL**:
```sql
-- Count inherited authorizations
SELECT
  COUNT(*) as total_inherited,
  COUNT(DISTINCT inherited_from) as unique_source_sessions
FROM cco.session_authorizations
WHERE inherited_from IS NOT NULL;

-- Show inherited authorizations
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
```

**Expected Results**:
- If mutations detected: `total_inherited` > 0
- Each inherited auth has:
  - `inherited_from`: source session_key (the old orphaned session)
  - `authorization_status`: valid status (PENDENTE, APROVADA, etc.)
  - `source`: ASSIM or other authorizer

**Scenario Validation**:
1. Old session had: `session_key='abc123', authorization_status='PENDENTE'`
2. Session remapped: new `session_key='def456'`
3. Result: `def456` now has authorization with `inherited_from='abc123'`

**Acceptance Criteria**:
- [ ] `inherited_from` column has data when mutations exist
- [ ] Each inherited auth matches a mutation (old → new session)
- [ ] Authorization status preserved across inheritance
- [ ] If mutations = 0: `total_inherited` = 0

**Status**: ⏳ Pending

---

### TEST 5: Referential Integrity (CHECK_5)

**Objective**: Verify no broken foreign keys exist.

**SQL**:
```sql
-- Check 1: session_authorizations
SELECT 'session_authorizations' as table_name,
  COUNT(*) as broken_fk_count
FROM cco.session_authorizations sa
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = sa.session_key
    AND a.orphaned_at IS NULL
);

-- Check 2: session_substitutions
SELECT 'session_substitutions' as table_name,
  COUNT(*) as broken_fk_count
FROM cco.session_substitutions ss
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = ss.session_key
    AND a.orphaned_at IS NULL
);

-- Check 3: occurrences
SELECT 'occurrences' as table_name,
  COUNT(*) as broken_fk_count
FROM cco.occurrences occ
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = occ.session_key
    AND a.orphaned_at IS NULL
);
```

**Expected Results**:
- All three checks return `broken_fk_count = 0`
- No orphaned sessions should have children in dependent tables

**Important**: This validates that:
- Orphaned sessions have no active references
- Related data was consolidated to new session_key
- No data is "dangling"

**Acceptance Criteria**:
- [ ] `session_authorizations`: broken_fk_count = **0** ✅
- [ ] `session_substitutions`: broken_fk_count = **0** ✅
- [ ] `occurrences`: broken_fk_count = **0** ✅

**Status**: ⏳ Pending

---

### TEST 6: Mutation-to-Orphan Mapping (CHECK_6)

**Objective**: Verify every orphaned record has a corresponding mutation record.

**SQL**:
```sql
-- Orphaned records without mutation mapping (should be empty)
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
```

**Expected Results**:
- **Empty result set** (0 rows)
- Every orphaned session should have matching mutation record

**If you see results**: This indicates an inconsistency that needs investigation

**Acceptance Criteria**:
- [ ] Query returns **0 rows** (no mismatches)
- [ ] Every orphaned record is traceable to a mutation

**Status**: ⏳ Pending

---

### TEST 7: Retention Policy (CHECK_7)

**Objective**: Verify 30-day retention window is being tracked.

**SQL**:
```sql
-- Count records by retention status
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
```

**Expected Results**:
- Most records show `WITHIN_RETENTION`
- No `ELIGIBLE_FOR_DELETE` (unless system is old)
- Cleanup cron will run daily at 02:00 UTC

**Timeline**:
- Day 0: Mutation detected, orphan marked
- Day 1-29: Record in `WITHIN_RETENTION`
- Day 30+: Record eligible for hard delete
- Cron job deletes eligible records at 02:00 UTC

**Acceptance Criteria**:
- [ ] Records tracked with retention status
- [ ] Cron job configured (can be verified separately)
- [ ] Audit trail preserved for 30 days

**Status**: ⏳ Pending

---

### TEST 8: TITA ID Tracking (CHECK_8)

**Objective**: Verify tita_agendamento_id links mutations.

**SQL**:
```sql
-- Count unique TITA IDs tracked
SELECT
  COUNT(DISTINCT m.tita_agendamento_id) as unique_tita_ids_tracked,
  COUNT(DISTINCT m.tita_agendamento_id) FILTER (WHERE m.tita_agendamento_id IS NOT NULL) as non_null_tita_ids
FROM cco.session_mutations m;

-- Find sessions with multiple session_keys (mutation evidence)
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
```

**Expected Results**:
- `unique_tita_ids_tracked`: >= 0
- If mutations exist: `unique_tita_ids_tracked` > 0
- Sessions with multiple `session_key` values show remapping history

**Example**:
```
tita_agendamento_id | session_key_count | min_date   | max_date   | all_session_keys
---------------------|-------------------|----------|----------|------------------
12345               | 2                 | 2026-06-08| 2026-06-09| abc123..., def456...
```

This proves: Same TITA appointment (ID 12345) → 2 different session_keys (remapped)

**Acceptance Criteria**:
- [ ] TITA IDs properly tracked in mutations table
- [ ] Multi-key sessions visible in atendimentos
- [ ] Dates show progression of remappings

**Status**: ⏳ Pending

---

### TEST 9: Processing Logs (CHECK_9)

**Objective**: Verify sync jobs are executing and logging results.

**SQL**:
```sql
-- Check sync job executions
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
```

**Expected Results**:
- `cco-sync-tita-sessions`: Multiple successful executions
- `successful` count > 0
- `failed` count = 0 (or minimal)
- `last_execution`: Recent (within last hour)

**Indicates**:
- Job 1 running regularly
- Mutation detector integrated and active
- No major errors

**Acceptance Criteria**:
- [ ] At least 1 successful execution logged
- [ ] `last_execution` is recent
- [ ] Error count minimal or zero

**Status**: ⏳ Pending

---

## 📊 Summary Metrics (CHECK_SUMMARY)

**Overall System Health Query**:
```sql
SELECT
  ROUND(
    (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NULL) * 100.0 /
    (SELECT COUNT(*) FROM cco.atendimentos),
    2
  ) as active_sessions_percent,
  (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NOT NULL) as orphaned_records,
  (SELECT COUNT(*) FROM cco.session_mutations) as total_mutations,
  (SELECT COUNT(*) FROM cco.session_authorizations WHERE inherited_from IS NOT NULL) as inherited_authorizations;
```

**Expected Output**:
```
active_sessions_percent | orphaned_records | total_mutations | inherited_authorizations
-------------------------|------------------|-----------------|---------------------------
95-99%                   | 0-100            | 0-100           | 0-100
```

(Actual numbers depend on data age and mutation frequency)

---

## ✅ Test Execution Checklist

Execute all 9 tests in order and mark completion:

| Test | Name | Status | Notes |
|------|------|--------|-------|
| 1 | Schema Validation | [ ] | All 3 columns exist |
| 2 | Mutation Detection | [ ] | Processed count = total |
| 3 | Orphan Marking | [ ] | Orphaned records present |
| 4 | Auth Consolidation | [ ] | Inherited authorizations exist |
| 5 | Referential Integrity | [ ] | Zero broken FKs (all 3 checks) |
| 6 | Mutation Mapping | [ ] | Zero unmapped orphans |
| 7 | Retention Policy | [ ] | Status tracking visible |
| 8 | TITA ID Tracking | [ ] | Multi-key sessions visible |
| 9 | Processing Logs | [ ] | Recent executions logged |

---

## 🎯 Acceptance Criteria — Overall

For Fase 2-B to **PASS**, all of the following must be TRUE:

- [ ] **TEST 1 PASSED**: Schema fully applied
- [ ] **TEST 2 PASSED**: Mutations detected and 100% processed
- [ ] **TEST 3 PASSED**: Orphaned records correctly marked
- [ ] **TEST 4 PASSED**: Authorization consolidation working
- [ ] **TEST 5 PASSED**: Zero broken foreign keys
- [ ] **TEST 6 PASSED**: All orphans mapped to mutations
- [ ] **TEST 7 PASSED**: Retention policy tracking
- [ ] **TEST 8 PASSED**: TITA ID tracking enabled
- [ ] **TEST 9 PASSED**: Processing logs recorded
- [ ] **OVERALL**: All tests ✅ → **PHASE 2-B APPROVED FOR PRODUCTION**

---

## 🐛 Troubleshooting

### Issue: "Table cco.session_mutations does not exist"
**Solution**: Migration not applied. Run: `supabase db push`

### Issue: "Column orphaned_at does not exist"
**Solution**: Migration failed partially. Check migration logs in Supabase dashboard.

### Issue: "No mutations detected but data exists"
**Solution**: 
- Verify Job 1 deployed with mutation detection enabled
- Check that TITA data includes `tita_agendamento_id` field
- Wait for next sync cycle

### Issue: "Broken FKs detected"
**Solution**:
- This indicates consolidation did not complete
- Check `cco.processing_logs` for errors
- Manually verify orphaned sessions have no children

### Issue: "Orphans exist but no mutation records"
**Solution**:
- Indicates manual orphaning or old data
- Manually map using `session_key` comparison
- Document reason for manual orphaning

---

## 📝 Test Report Template

**Tester Name**: [Your Name]  
**Test Date**: [Date]  
**Environment**: [Staging/Production]  
**Database**: [URL/Instance]

### Results Summary

| Test | Result | Comments |
|------|--------|----------|
| Schema Validation | ✅ / ❌ | |
| Mutation Detection | ✅ / ❌ | |
| Orphan Marking | ✅ / ❌ | |
| Auth Consolidation | ✅ / ❌ | |
| Referential Integrity | ✅ / ❌ | |
| Mutation Mapping | ✅ / ❌ | |
| Retention Policy | ✅ / ❌ | |
| TITA ID Tracking | ✅ / ❌ | |
| Processing Logs | ✅ / ❌ | |

### Overall Assessment

**Phase 2-B Status**: [ ] PASS | [ ] FAIL | [ ] CONDITIONAL

**Issues Found**:
(List any failed tests or anomalies)

**Sign-Off**:
- QA Lead: _____________ Date: _______
- Tech Lead: _____________ Date: _______

---

## 🔄 Post-Test Actions

If all tests **PASS**:
1. ✅ Document results in this file
2. ✅ Obtain QA sign-off
3. ✅ Notify Architecture team
4. ✅ Proceed to Fase 3 implementation

If any test **FAILS**:
1. ❌ Document issue in detail
2. ❌ Investigate root cause
3. ❌ Determine rollback vs. fix
4. ❌ Execute mitigation
5. ❌ Re-test failed scenario

---

**Status**: 🟡 **READY FOR EXECUTION**  
**Next Step**: Execute tests in Supabase SQL Editor  
**Timeline**: 2-3 hours (including data analysis)

