# 📋 FASE 2-B — Session Mutation Handling
## Test Plan & Validation

**Status**: 🟡 **READY FOR TESTING**  
**Date**: 2026-06-08  
**Scope**: Mutation detection, history consolidation, orphan management

---

## 🎯 Objectives

After Fase 2-B deployment, the system must:

1. ✅ Detect when a TITA session is rescheduled (date/time changes)
2. ✅ Consolidate authorization history from old session_key to new
3. ✅ Mark old session as orphaned (soft delete)
4. ✅ Preserve audit trail for 30 days
5. ✅ Auto-cleanup orphans after 30 days
6. ✅ Maintain referential integrity (no broken FKs)

---

## 📦 Deployment Checklist

### Step 1: Apply Migration 20260609000000_cco_phase2b.sql

```bash
# Via Supabase CLI:
supabase db push

# OR via Supabase Dashboard SQL Editor:
# Paste contents of 20260609000000_cco_phase2b.sql
```

**Verify**:
- [ ] Table `cco.session_mutations` created
- [ ] Columns `orphaned_at`, `orphan_reason` added to `cco.atendimentos`
- [ ] Column `inherited_from` added to `cco.session_authorizations`
- [ ] Indexes on mutations table created
- [ ] Cron job `cco-cleanup-orphans` scheduled

### Step 2: Deploy Updated Job 1 (cco-sync-tita-sessions)

```bash
# Deploy with updated mutation detection:
supabase functions deploy cco-sync-tita-sessions --no-verify-jwt
```

**Changes in Job 1**:
- Imports `mutation-detector.ts` functions
- Calls `detectSessionMutations()` after UPSERT
- Calls `processMutations()` to consolidate history
- Logs mutation detection results

### Step 3: Verify Edge Function Deployment

```bash
# Test Job 1 is callable:
curl -X POST \
  https://<your-supabase-url>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response**:
```json
{
  "ok": true,
  "job": "cco-sync-tita-sessions",
  "rows_processed": N
}
```

---

## 🧪 Test Scenarios

### TEST 1: Schema Validation

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_1**

```bash
# In Supabase SQL Editor, run:
# SELECT '====== CHECK 1: Schema Changes ======' as title;
# -- Then all queries from CHECK_1 section
```

**Expected Results**:
- `mutations_table_exists`: TRUE
- `orphaned_at_exists`: TRUE
- `inherited_from_exists`: TRUE

---

### TEST 2: Mutation Detection

**Prerequisites**: Manually remap a TITA session to different date in system

1. In TITA admin console, reschedule a session from 2026-06-08 to 2026-06-09
2. Run Job 1: `POST /functions/v1/cco-sync-tita-sessions`
3. Check `cco.session_mutations` table

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_2**

```bash
# Run CHECK_2 queries to see:
# - Total mutations recorded
# - Recent mutations (last 10)
# - Breakdown by mutation_type
```

**Expected Results**:
- `total_mutations` > 0
- `processed_count` == `total_mutations`
- Each mutation has: session_key_old, session_key_new, detected_at, processed_at

---

### TEST 3: Orphan Marking

**Verification**: Old session_key is marked orphaned after mutation

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_3**

```bash
# Run CHECK_3 queries to see:
# - Count of orphaned records
# - Sample orphaned records with reasons
```

**Expected Results**:
- `total_orphaned` > 0
- All orphaned records have: `orphaned_at IS NOT NULL` and `orphan_reason LIKE 'RESCHEDULED%'`
- No NULL values in `orphaned_at` for marked records

---

### TEST 4: Authorization Consolidation

**Verification**: Authorizations inherited from old session to new

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_4**

```bash
# Run CHECK_4 queries to see:
# - Count of inherited authorizations
# - Sample inherited records with source session
```

**Scenario**:
1. Session ABC-123 has authorization status 'PENDENTE' from ASSIM
2. Session is remapped → new session_key DEF-456
3. Job 1 detects mutation and consolidates
4. Session DEF-456 now has the 'PENDENTE' authorization (inherited)

**Expected Results**:
- `total_inherited` > 0 (for each mutation)
- `inherited_from` column populated with old session_key
- Authorization status matches original

---

### TEST 5: Referential Integrity

**Verification**: No broken foreign keys after mutations

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_5**

```bash
# Run all three FK checks:
# - session_authorizations
# - session_substitutions
# - occurrences
```

**Expected Results**:
- `broken_fk_count` == 0 (for all three checks)
- All FKs point to active (non-orphaned) sessions or NULL

---

### TEST 6: Data Consistency Between Mutation & Orphan Tables

**Verification**: Every orphaned record has a corresponding mutation record

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_6**

```bash
# Shows orphaned records without mutations (potential issues)
```

**Expected Results**:
- Empty result set (0 rows)
- OR all results show `mutation_status = 'FOUND_MUTATION'`

---

### TEST 7: Retention Policy

**Verification**: Cleanup job will auto-delete orphans after 30 days

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_7**

```bash
# Shows orphaned records by retention status
```

**Expected Results**:
- Most records show `WITHIN_RETENTION`
- Records older than 30 days show `ELIGIBLE_FOR_DELETE`
- Cron job runs at 02:00 UTC daily

**Manual Test** (optional):
```sql
-- Simulate an orphan record from 31 days ago:
UPDATE cco.atendimentos
SET orphaned_at = now() - interval '31 days'
WHERE session_key = 'test-orphan-key';

-- The cron job at 02:00 UTC will DELETE this record
-- Or manually trigger (admin only):
-- DELETE FROM cco.atendimentos
-- WHERE orphaned_at < now() - interval '30 days';
```

---

### TEST 8: TITA ID Tracking

**Verification**: Multiple session_keys for same TITA ID (mutation evidence)

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_8**

```bash
# Shows sessions with multiple session_keys
# (Evidence of mutations in the system)
```

**Expected Results**:
- If mutations occurred: results showing `session_key_count > 1`
- Multiple session_keys for single `tita_agendamento_id`
- Dates showing the progression of remappings

---

### TEST 9: Processing Logs

**Verification**: Sync job logs indicate mutation processing

**File**: `FASE2B_AUDIT_QUERIES.sql` → **CHECK_9**

```bash
# Shows execution history of sync jobs
```

**Expected Results**:
- `cco-sync-tita-sessions` executions recorded
- `successful` count > 0
- Latest execution within last hour

---

## 🎯 Acceptance Criteria

| Criterion | Status | Verification |
|---|---|---|
| Schema changes applied | [ ] | CHECK_1 all TRUE |
| Mutation detection works | [ ] | CHECK_2 finds mutations |
| Orphan marking correct | [ ] | CHECK_3 has orphaned records |
| Authorization consolidation | [ ] | CHECK_4 inherited authorizations |
| No broken FKs | [ ] | CHECK_5 all counts = 0 |
| Mutation ↔ Orphan consistency | [ ] | CHECK_6 all mapped |
| Retention policy viable | [ ] | CHECK_7 shows retention status |
| TITA ID tracking | [ ] | CHECK_8 finds multi-key sessions |
| Processing logs present | [ ] | CHECK_9 shows recent executions |
| **OVERALL PHASE 2-B PASS** | [ ] | All checks ✅ |

---

## 📊 Performance Metrics

Expected performance targets:

| Operation | Target | Note |
|---|---|---|
| Mutation detection | < 5s | Per batch of 1000 sessions |
| History consolidation | < 2s | Per mutation |
| Orphan marking | < 1s | Per mutation |
| Total Job 1 execution | < 30s | Including original TITA sync |
| Cleanup query (30day) | < 10s | Runs at 02:00 UTC daily |

Monitor via `cco.processing_logs`:
```sql
SELECT
  job_name,
  ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at))), 2) as avg_duration_sec
FROM cco.processing_logs
WHERE status = 'success'
GROUP BY job_name;
```

---

## 🚨 Rollback Plan

If issues are discovered:

```bash
# Step 1: Disable cleanup cron
SELECT cron.unschedule('cco-cleanup-orphans');

# Step 2: Revert to previous Job 1 (without mutation detection)
supabase functions deploy cco-sync-tita-sessions --no-verify-jwt

# Step 3: (If necessary) Drop Fase 2-B tables
DROP TABLE cco.session_mutations CASCADE;
ALTER TABLE cco.atendimentos DROP COLUMN orphaned_at, DROP COLUMN orphan_reason;
ALTER TABLE cco.session_authorizations DROP COLUMN inherited_from;

# Step 4: Rollback migration
supabase migration rm 20260609000000_cco_phase2b
```

---

## 📝 Documentation References

- **Design**: Session mutation handling analysis (prior conversation)
- **Risk Analysis**: Identified 450-675 orphans/month without Fase 2-B
- **Prerequisite for**: Fase 3 (conciliation engine)
- **Related**: FASE2B_AUDIT_QUERIES.sql (this directory)

---

## ✅ Sign-Off

- [ ] Technical Lead Review
- [ ] QA Testing Complete
- [ ] Production Deployment Approved
- [ ] Monitoring Configured

---

**Next Phase**: After Fase 2-B passes all tests → Implement Fase 3 (Conciliation Engine)
