# Fase 2 — Risks, Architecture & Design Decisions

---

## Architecture Overview

### Layer Structure

```
Layer 0: Legacy Sources
  ├─ TITA API (http)
  ├─ autorizacoes_assim (public.*)
  ├─ fila_autorizacoes (public.*)
  └─ controle_terapeutico (public.*)

Layer 1: Scheduling & Orchestration
  └─ pg_cron (PostgreSQL)
     ├─ Job 1: cco-sync-tita-sessions (*/5 * * * *) @ :00
     ├─ Job 2: cco-sync-assim-authorizations (every 5m) @ :01
     ├─ Job 3: cco-sync-authorization-queue (every 5m) @ :02
     └─ Job 4: cco-sync-therapist-control (every 15m) @ :03

Layer 2: Materialization
  ├─ Edge Function: cco-sync-tita-sessions (Deno)
  ├─ Edge Function: cco-sync-assim-authorizations (Deno)
  ├─ Edge Function: cco-sync-authorization-queue (Deno)
  └─ Edge Function: cco-sync-therapist-control (Deno)

Layer 3: Storage (CCO Schema)
  ├─ cco.atendimentos (sessions from TITA)
  ├─ cco.session_authorizations (from ASSIM + fila)
  ├─ cco.session_substitutions (from controle_terapeutico)
  └─ cco.processing_logs (audit trail)

Ready for: Fase 3 (Conciliation Engine)
```

---

## Design Decisions

### 1. **Staggered Cron Offsets**

**Decision**: Each job starts at a different second (00, 01, 02, 03)

**Rationale**:

- Prevents "thundering herd" (all jobs starting at :00)
- Distributes database connections and load
- Gives TITA API breathing room (max 12 calls/hour from Job 1)
- Leaves overhead for manual interventions

**Alternative Considered**: Sequential job runs (Job 1 completes, then Job 2 starts)

- **Rejected**: Adds 5-10 minutes latency per job cycle
- **Our choice**: Parallel execution with staggered start times

---

### 2. **UPSERT Pattern (Not INSERT)**

**Decision**: All jobs use PostgreSQL `UPSERT` (INSERT ... ON CONFLICT)

**Example**:

```typescript
await supabase
  .from("cco.atendimentos")
  .upsert(batch, { onConflict: "session_key" })
```

**Rationale**:

- Safe for re-execution (idempotent)
- No risk of duplicate key violations
- Natural conflict resolution (update existing row)
- Single atomic operation (no race condition window)

**Alternative Considered**: Fetch existing rows, then INSERT or UPDATE selectively

- **Rejected**: Higher latency, complex logic, race window possible
- **Our choice**: Trust PostgreSQL's native UPSERT

---

### 3. **Composite Keys for Authorization Tables**

**Decision**: UPSERT by `(session_key, source)` for Jobs 2 & 3

**Example**:

```typescript
await supabase
  .from("cco.session_authorizations")
  .upsert(batch, { onConflict: "session_key,source" })
```

**Rationale**:

- Prevents cross-source overwriting (ASSIM can't erase fila data)
- Each source maintains independent UPSERT path
- No race condition between Job 2 and Job 3
- Natural modeling: same session has 2 authorization sources

**Alternative Considered**: Single table with UNION of ASSIM + fila

- **Rejected**: Complex query logic, duplicate session_key issues
- **Our choice**: Separate UPSERT paths, same destination table

---

### 4. **Deterministic session_key**

**Decision**: `session_key = sha256(unaccent_lower(paciente_nome) || data_sessao || hora_inicio)`

**Rationale**:

- **Deterministic**: Same input → same hash (idempotent join key)
- **Normalized**: unaccent removes ç→c, á→a, etc.
- **Collision-resistant**: SHA-256 = 2^256 space (negligible collision risk)
- **Reproducible**: Can verify hash outside database

**Normalization steps**:

1. `trim()` — remove leading/trailing spaces
2. `toLowerCase()` — case-insensitive
3. `.normalize("NFD")` — decompose accented chars
4. Remove diacritics — ç becomes c
5. SHA-256 hash → 64-char hex

**Alternative Considered**: Use TITA's `tita_agendamento_id` as PK

- **Rejected**: Not present in ASSIM or fila tables
- **Our choice**: Computed hash bridges all 4 sources

---

### 5. **Shared Logger Module**

**Decision**: Centralized logging in `cco-shared/logger.ts`

**Rationale**:

- **DRY**: Avoid repeating logging code in 4 jobs
- **Consistency**: All jobs log same structure
- **Auditability**: Complete audit trail in `cco.processing_logs`
- **Reusability**: Can be imported by all jobs

**Logged fields**:

- `job_name` — identifier (cco-sync-*)
- `started_at` — when job started
- `finished_at` — when job ended (NULL if still running)
- `status` — 'running', 'success', 'error'
- `rows_processed` — count of UPSERT rows
- `error_message` — error detail (if status='error')

**Alternative Considered**: Inline logging in each job

- **Rejected**: Duplicated code, inconsistent format
- **Our choice**: Shared logger module

---

### 6. **Batch Upsert (100 rows per batch)**

**Decision**: Process UPSERT in batches of 100 rows

**Code**:

```typescript
for (let i = 0; i < rows.length; i += 100) {
  const batch = rows.slice(i, i + 100)
  const { count, error } = await supabase.from(...).upsert(batch, ...)
}
```

**Rationale**:

- **Connection safety**: PostgreSQL can handle 100-row UPSERT atomically
- **Memory efficient**: Doesn't load 10,000 rows into Deno memory at once
- **Failure isolation**: If batch 5 fails, batches 1-4 already committed
- **Reasonable trade-off**: Balances safety and speed

**Alternative Considered**: 1 giant UPSERT for all rows

- **Rejected**: Memory overflow for large datasets, all-or-nothing failure
- **Our choice**: Batches of 100 (proven safe in existing projects)

---

## Identified Risks

### Risk 1: TITA API Unavailability

**Severity**: MEDIUM

**Scenario**: TITA API is down or unreachable

**Impact**:

- Job 1 fails, logs error to `cco.processing_logs`
- cco.atendimentos not updated
- Subsequent jobs (2-4) still run (not blocked by Job 1 failure)
- Next job cycle (5 min) retries automatically

**Mitigation**:

- ✅ Each job is independent (failure doesn't cascade)
- ✅ pg_cron retries on next interval
- ✅ Logging captures root cause
- ❌ No active alert yet (Fase 5 can add Slack integration)

**Acceptance**: ACCEPTABLE — job will self-heal on retry

---

### Risk 2: Missing Required Fields

**Severity**: LOW

**Scenario**: Legacy data missing paciente_nome, data_sessao, or hora_inicio

**Impact**:

- Row is skipped, logged as warning
- Job continues processing remaining rows
- Skipped rows not materialized

**Mitigation**:

- ✅ Validation check before session_key computation
- ✅ Skip + log pattern prevents cascade failure
- ✅ Logging shows which rows were skipped

**Acceptance**: ACCEPTABLE — graceful degradation

---

### Risk 3: Session_key Collision

**Severity**: LOW

**Scenario**: Two different sessions happen to hash to same value

**Impact**:

- Later session overwrites earlier one (via UPSERT)
- Occurrences mixed across sessions
- Data loss

**Likelihood**: ~1 in 2^256 (cryptographically negligible)

**Mitigation**:

- ✅ SHA-256 has proven collision resistance
- ✅ Test case: same patient, same date, different times → different keys
- ✅ Historical data analysis would catch pattern

**Acceptance**: ACCEPTABLE — SHA-256 is industry standard

---

### Risk 4: Race Condition on (session_key, source)

**Severity**: MEDIUM

**Scenario**: Job 2 (ASSIM) and Job 3 (fila) both UPSERT same session_key at exact same millisecond

**Impact**:

- Both try to INSERT/UPDATE `cco.session_authorizations`
- PostgreSQL ON CONFLICT resolves atomically
- One wins, one sees "no changes" (idempotent)
- **No data loss**, but potential stale read

**Mitigation**:

- ✅ PostgreSQL UNIQUE constraint + ON CONFLICT is atomic
- ✅ Jobs 2 & 3 use different sources ('assim' vs 'fila')
- ✅ Composite key `(session_key, source)` prevents interference
- ⚠️ Fase 3 will add advisory locks for engine-job coordination

**Acceptance**: ACCEPTABLE — conflict resolution is atomic

---

### Risk 5: Network Timeout Between pg_cron and Edge Function

**Severity**: LOW

**Scenario**: pg_cron calls Edge Function URL, but network is slow/down

**Impact**:

- HTTP POST request times out
- Job doesn't run (or runs partially)
- cron.job's job_stats might show failure

**Mitigation**:

- ✅ pg_cron retries on next interval (5-15 min)
- ✅ Each job is idempotent (safe to retry)
- ✅ Timeout is configurable in pg_cron (default ~30 sec)

**Acceptance**: ACCEPTABLE — automatic retry handles it

---

### Risk 6: Foreign Key Violation (Orphaned session_key)

**Severity**: MEDIUM

**Scenario**: cco.session_authorizations references session_key that doesn't exist in cco.atendimentos

**Impact**:

- UPSERT fails with constraint violation
- Job logged as error
- Orphaned authorizations not materialized

**Likelihood**: LOW if Job 1 (TITA) syncs before Job 2-4

**Mitigation**:

- ✅ Fase 1 schema uses `ON DELETE RESTRICT` (prevents orphaning)
- ✅ Staggered offsets: Job 1 runs before Jobs 2-4 (most cycles)
- ⚠️ If Job 1 never ran, Jobs 2-4 will fail

**Acceptance**: ACCEPTABLE — data integrity protected by schema constraints

---

### Risk 7: Concurrent Job Execution (Status='running' forever)

**Severity**: LOW

**Scenario**: Job 1 takes > 5 minutes to complete, but cron fires another instance

**Impact**:

- Two instances of Job 1 running concurrently
- Both UPSERT same rows
- No data loss (idempotent), but inefficient

**Mitigation**:

- ✅ Fase 3 will use advisory locks to prevent concurrent engine runs
- ✅ Each job < 30 seconds expected (< 5-min interval)
- ⚠️ Fase 2 jobs don't have locks yet (acceptable risk)

**Acceptance**: ACCEPTABLE — jobs are fast enough; Fase 3 adds locks

---

### Risk 8: Timestamp Normalization Errors

**Severity**: LOW

**Scenario**: TITA returns time in unexpected format (e.g., "8:30:00" instead of "08:30")

**Impact**:

- `normalizeTime()` returns null
- Row skipped
- Session not materialized

**Mitigation**:

- ✅ Regex handles both "8:30" and "08:30:00"
- ✅ Skipped rows logged with warning
- ✅ Can be debugged from logs

**Acceptance**: ACCEPTABLE — graceful degradation

---

## Mitigation Summary

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| TITA API down | MEDIUM | Retry, logging | ✅ Fase 2 |
| Missing fields | LOW | Skip + log | ✅ Fase 2 |
| Hash collision | LOW | SHA-256 | ✅ Fase 2 |
| Concurrent UPSERT | MEDIUM | Atomic constraint | ✅ Fase 2 |
| Network timeout | LOW | Auto-retry | ✅ Fase 2 |
| Orphaned FK | MEDIUM | Schema constraints | ✅ Fase 2 |
| Concurrent job | LOW | Advisory lock | ⏳ Fase 3 |
| Time format error | LOW | Flexible parser | ✅ Fase 2 |

---

## Performance Profile

### Job 1: TITA Sessions

- **Source**: CSV API (network time dominant)
- **Expected duration**: 10-20 seconds (depends on TITA response)
- **Expected rows**: 500-1000 per run
- **Network calls**: 1 (TITA API)
- **DB operations**: 1 UPSERT (100 batches)

### Job 2: ASSIM Authorizations

- **Source**: Supabase query
- **Expected duration**: 5-10 seconds
- **Expected rows**: 100-200 per run
- **Network calls**: 0 (Supabase internal)
- **DB operations**: 1 SELECT + 1 UPSERT

### Job 3: Fila Authorizations

- **Source**: Supabase query
- **Expected duration**: 5-10 seconds
- **Expected rows**: 100-300 per run
- **Network calls**: 0
- **DB operations**: 1 SELECT + 1 UPSERT

### Job 4: Therapist Control

- **Source**: Supabase query
- **Expected duration**: 2-5 seconds
- **Expected rows**: 20-50 per run
- **Network calls**: 0
- **DB operations**: 1 SELECT + 1 UPSERT

**Total monthly API calls to TITA**: ~8,640 (= 60 min/hour × 24 hours × 30 days ÷ 5 min = 8,640)

**Rate limit risk**: TITA allows 10,000/day (nominal), we use ~288/day → **SAFE** ✅

---

## Testing Strategy

See: [FASE_2_CCO_VALIDATION.md](./FASE_2_CCO_VALIDATION.md)

Key test categories:

1. **Deployment** — jobs deploy, cron registered
2. **Invocation** — manual curl tests
3. **Idempotency** — re-run same job → no duplicates
4. **Data consistency** — no orphaned FKs, valid enums
5. **Performance** — jobs < 30 seconds
6. **Error handling** — errors logged, job continues
7. **Integration** — all 4 jobs together

---

## Rollback Plan

1. Unschedule all cron jobs
2. Delete Edge Functions
3. Clear CCO tables (optional)

**Data safety**: No legacy tables modified, only CCO schema touched

---

## Next Phase: Fase 3

After Fase 2 acceptance criteria met:

- Implement **Conciliation Engine** (7 business rules)
- Generate **occurrences** in `cco.occurrences`
- Update **dashboard_snapshot**
- Jobs 1-4 call engine upon completion (fire-and-forget)
- Add **advisory locks** to prevent concurrent engine runs

---

## Approval

✅ **Architecture**: Reviewed, approved  
⏳ **Implementation**: Fase 2 in progress  
⏳ **Testing**: Validation plan ready  
⏳ **Deployment**: Ready after testing  
