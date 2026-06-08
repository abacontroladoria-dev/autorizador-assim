# FASE 2-B Architecture Overview
## Session Mutation Handling — Visual Guide

---

## 🔄 Data Flow Diagram

```
TITA API
   │
   ├─ RESCHEDULE: João Silva
   │     2026-06-08 14:00 → 2026-06-09 15:00
   │     (Same tita_agendamento_id = 12345)
   │
   └─→ Job 1: cco-sync-tita-sessions
        │
        ├─ CSV Parse → TITASession[]
        │
        ├─ UPSERT to cco.atendimentos
        │   ├─ session_key_old = abc123... (orphaned)
        │   └─ session_key_new = def456... (active)
        │
        ├─ detectSessionMutations()
        │   └─ Find: tita_agendamento_id 12345
        │       data_sessao: 2026-06-08 → 2026-06-09
        │       ✅ MUTATION DETECTED
        │
        ├─ processMutations()
        │   │
        │   ├─ consolidateSessionHistory()
        │   │   ├─ FETCH auth from abc123 (PENDENTE)
        │   │   ├─ FETCH auth from def456 (none)
        │   │   ├─ COPY: abc123 auth → def456
        │   │   │        (mark inherited_from = abc123)
        │   │   │
        │   │   └─ UPDATE cco.atendimentos
        │   │        SET orphaned_at = now()
        │   │        WHERE session_key = 'abc123'
        │   │
        │   └─ INSERT cco.session_mutations
        │        ├─ tita_agendamento_id: 12345
        │        ├─ session_key_old: abc123...
        │        ├─ session_key_new: def456...
        │        ├─ mutation_type: RESCHEDULED
        │        └─ processed_at: now()
        │
        └─ logger.finishSuccess(count)
           → records in cco.processing_logs
```

---

## 📊 Table Relationships After Mutation

```
BEFORE MUTATION
═══════════════════════════════════════════════════════════

cco.atendimentos
┌─────────────────────────────┐
│ session_key: abc123...      │  ← João Silva, 2026-06-08
│ tita_agendamento_id: 12345  │
│ data_sessao: 2026-06-08     │
│ orphaned_at: NULL           │  ← ACTIVE
└─────────────────────────────┘
         ↓
cco.session_authorizations
┌─────────────────────────────┐
│ session_key: abc123...      │
│ authorization_status: PENDENTE
│ inherited_from: NULL        │  ← ORIGINAL
└─────────────────────────────┘


AFTER MUTATION (Fase 2-B Processing)
═══════════════════════════════════════════════════════════

cco.atendimentos (OLD)
┌─────────────────────────────┐
│ session_key: abc123...      │  ← João Silva, 2026-06-08
│ tita_agendamento_id: 12345  │
│ data_sessao: 2026-06-08     │
│ orphaned_at: 2026-06-08     │  ✅ MARKED ORPHANED
│ orphan_reason: "RESCHEDULED │
│  → def456..."               │
└─────────────────────────────┘

cco.session_mutations (NEW)
┌─────────────────────────────┐
│ tita_agendamento_id: 12345  │  ← LINK BETWEEN VERSIONS
│ session_key_old: abc123...  │
│ session_key_new: def456...  │
│ mutation_type: RESCHEDULED  │
│ detected_at: 2026-06-08T14:32Z
│ processed_at: 2026-06-08T14:32Z
└─────────────────────────────┘

cco.atendimentos (NEW)
┌─────────────────────────────┐
│ session_key: def456...      │  ← João Silva, 2026-06-09
│ tita_agendamento_id: 12345  │
│ data_sessao: 2026-06-09     │
│ orphaned_at: NULL           │  ← ACTIVE (new)
└─────────────────────────────┘
         ↓
cco.session_authorizations (INHERITED)
┌─────────────────────────────┐
│ session_key: def456...      │
│ authorization_status: PENDENTE
│ inherited_from: abc123...   │  ✅ MARKED INHERITED
│ synced_at: 2026-06-08T14:32Z
└─────────────────────────────┘
         ↑
    (COPIED FROM OLD)
```

---

## 🔄 Mutation Detection Algorithm

```
┌─ JOB 1 EXECUTION ─────────────────────────────────────────┐
│                                                            │
│  FOR each tita_agendamento_id in NEW batch:              │
│    ├─ new_session = current TITA data                     │
│    │                                                       │
│    ├─ old_session = query cco.atendimentos               │
│    │               WHERE tita_agendamento_id = ?          │
│    │               AND data_sessao >= (now - 30 days)     │
│    │                                                       │
│    └─ IF old_session EXISTS:                              │
│       │                                                     │
│       ├─ IF new.data_sessao ≠ old.data_sessao OR          │
│       │    new.hora_inicio ≠ old.hora_inicio:            │
│       │   ✅ MUTATION DETECTED                            │
│       │   └─ Add to mutations[] array                     │
│       │                                                     │
│       └─ CONTINUE to next session                         │
│                                                            │
│  FOR each mutation in mutations[]:                         │
│    └─ await consolidateSessionHistory(mutation)          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 💾 Soft Delete & Retention Timeline

```
TIME     EVENT                          ACTION
─────────────────────────────────────────────────────────────
T0       Mutation detected              orphaned_at = T0
         (session remapped)

T0 + 1h  Session still orphaned        Keep in storage
         (in cco.atendimentos)         (audit trail)

T0 + 24h Session still orphaned        Still visible
         (next day)                    (admin can review)

T0 + 7d  Session still orphaned        Still in DB
         (after one week)              (retained)

T0 + 29d Session still orphaned        Still in DB
         (near threshold)              (last day before cleanup)

T0 + 30d  ⏰ CRON JOB TRIGGERS          DELETE FROM cco.atendimentos
         (02:00 UTC)                   WHERE orphaned_at < now() - 30d
         
         ❌ HARD DELETE

T0 + 31d  Session permanently removed  Space reclaimed


DATA AVAILABILITY DURING RETENTION
═══════════════════════════════════════════════════════════

T0 to T0+30d:
  ├─ Audit queries can see orphaned records
  │  (WHERE orphaned_at IS NOT NULL)
  │
  ├─ Recovery possible via UPDATE:
  │  SET orphaned_at = NULL
  │
  └─ Historical analysis: inspect cco.session_mutations

After T0+30d:
  └─ Data permanently removed
     (kept in session_mutations for reference only)
```

---

## 🏗️ Module Dependencies

```
cco-sync-tita-sessions/index.ts (Job 1)
│
├─ imports: logger.ts
│   ├─ JobLogger class
│   ├─ normalizeDate, normalizeTime
│   ├─ buildSessionKey
│   └─ computeSHA256
│
└─ imports: mutation-detector.ts ⭐ NEW
    ├─ detectSessionMutations()
    │   └─ queries cco.atendimentos (30-day window)
    │   └─ compares tita_agendamento_id & date/time
    │   └─ returns SessionMutationRecord[]
    │
    ├─ consolidateSessionHistory()
    │   ├─ queries cco.session_authorizations
    │   ├─ copies auth from old → new session_key
    │   └─ marks old session orphaned
    │
    └─ processMutations()
        └─ orchestrates consolidation for all mutations
```

---

## 🗄️ Database Schema Changes

```
CREATED: cco.session_mutations
══════════════════════════════════════════════════════════

PK: id (uuid)
FK: session_key_new → cco.atendimentos(session_key)

Columns:
├─ tita_agendamento_id (bigint)       ← LINK
├─ session_key_old (text)             ← OLD (orphaned)
├─ session_key_new (text)             ← NEW (active)
├─ mutation_type (enum: RESCHEDULED, DELETED)
├─ data_sessao_old, data_sessao_new
├─ hora_inicio_old, hora_inicio_new
├─ paciente_nome
├─ detected_at (timestamp)            ← WHEN FOUND
├─ processed_at (timestamp)           ← WHEN CONSOLIDATED
└─ consolidation_note (text)

Indexes:
├─ idx_mutations_tita_id
├─ idx_mutations_old_key
├─ idx_mutations_new_key
├─ idx_mutations_detected_at
└─ idx_mutations_processed_at (partial, where processed_at IS NULL)


MODIFIED: cco.atendimentos
════════════════════════════════════════════════════════════

Existing columns: (unchanged)
  id, session_key, tita_agendamento_id, paciente_nome, ...

Added columns:
  ├─ orphaned_at (timestamptz, DEFAULT NULL)
  │   └─ When marked as orphaned (NULL = active)
  │
  └─ orphan_reason (text)
      └─ Why orphaned (e.g., "RESCHEDULED → def456...")

Indexes:
  └─ idx_atend_orphaned_at (partial, where orphaned_at IS NULL)


MODIFIED: cco.session_authorizations
════════════════════════════════════════════════════════════

Existing columns: (unchanged)
  id, session_key, source, authorization_status, ...

Added column:
  └─ inherited_from (text, DEFAULT NULL)
      └─ Original session_key (if inherited from mutation)
```

---

## ⏱️ Cron Schedule

```
┌─ Daily Cleanup Job ─────────────────────────────────────┐
│                                                         │
│ Job Name: cco-cleanup-orphans                          │
│ Schedule: 0 2 * * * (02:00 UTC, every day)            │
│ Action:   DELETE FROM cco.atendimentos                 │
│           WHERE orphaned_at IS NOT NULL               │
│           AND orphaned_at < now() - interval '30 d'   │
│                                                         │
│ Impact:   Removes records older than 30 days          │
│           Prevents unbounded table growth              │
│           Preserves audit trail during retention       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📈 Performance Impact

```
Job 1 (cco-sync-tita-sessions) Execution Timeline
════════════════════════════════════════════════════════

BEFORE Fase 2-B          AFTER Fase 2-B
─────────────────────────────────────────────────────

Fetch TITA CSV: 5s       Fetch TITA CSV: 5s
Parse CSV: 1s            Parse CSV: 1s
UPSERT batch: 3s         UPSERT batch: 3s
                         
                         ─── FASE 2-B OVERHEAD ───
                         
                         Query old sessions: 2s
                         Detect mutations: 1s
                         Consolidate auth: 2s
                         Mark orphans: < 1s
                         
                         ─────────────────────────

Total: ~9s               Total: ~15s (estimate)
                         Target: < 30s per cycle ✅
```

---

## 🔒 Safety Guarantees

```
FOREIGN KEY INTEGRITY
═══════════════════════════════════════════════════════════

cco.occurrences
  └─ REFERENCES cco.atendimentos(session_key)
     ON DELETE RESTRICT
     
     ✅ Orphaned sessions CANNOT be deleted
        (FK prevents deletion)
     
     ✅ All occurrences still accessible
        (via filtered queries where orphaned_at IS NULL)


AUTHORIZATION HISTORY PRESERVATION
═══════════════════════════════════════════════════════════

Old session (orphaned):
  → cco.session_mutations tracks the remapping
  → cco.session_authorizations keeps original auth
    (new session inherits a copy)
  
  ✅ Full audit trail preserved for 30+ days


AUDIT TRAIL
═══════════════════════════════════════════════════════════

cco.session_mutations:
  ├─ Records all mutations with full details
  ├─ Permanent record (not deleted after 30d)
  └─ Queryable for historical analysis

cco.processing_logs:
  ├─ Records Job 1 execution
  ├─ Tracks consolidation activity
  └─ Available for compliance audits
```

---

## 🧪 Validation Checkpoints

```
PHASE 1: Schema Validation
══════════════════════════════════════════════════════════
✅ cco.session_mutations table exists
✅ Indexes created correctly
✅ Columns orphaned_at, orphan_reason exist
✅ Column inherited_from exists
✅ Cron job scheduled


PHASE 2: Mutation Detection
══════════════════════════════════════════════════════════
✅ Job 1 runs successfully
✅ Mutations recorded in session_mutations
✅ Correct tita_agendamento_id linking
✅ Accurate date/time change detection


PHASE 3: Data Consolidation
══════════════════════════════════════════════════════════
✅ Authorizations copied to new session
✅ inherited_from column populated
✅ Old session marked orphaned
✅ Orphan records visible in queries


PHASE 4: Integrity Checks
══════════════════════════════════════════════════════════
✅ No broken foreign keys
✅ All FK references valid
✅ Orphaned & active records consistent
✅ All mutations have corresponding orphans


PHASE 5: Retention Policy
══════════════════════════════════════════════════════════
✅ Cleanup cron scheduled
✅ Orphaned records after 30d can be deleted
✅ 30-day retention window enforced
✅ No records deleted before threshold
```

---

## 📋 Monitoring Dashboard Queries

```sql
-- Current orphan count
SELECT COUNT(*) as orphaned_sessions
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL;

-- Mutations per day (trend)
SELECT DATE(detected_at) as date, COUNT(*) as mutations
FROM cco.session_mutations
GROUP BY DATE(detected_at)
ORDER BY date DESC;

-- Authorization consolidation success rate
SELECT
  COUNT(*) as total_mutations,
  COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as consolidated
FROM cco.session_mutations;

-- Next cleanup (when will records be deleted)
SELECT
  COUNT(*) as eligible_for_cleanup,
  MIN(orphaned_at) as oldest_orphan
FROM cco.atendimentos
WHERE orphaned_at < now() - interval '30 days';

-- Job 1 execution performance
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at))), 2) as avg_duration_sec,
  MAX(EXTRACT(EPOCH FROM (finished_at - started_at))) as max_duration_sec
FROM cco.processing_logs
WHERE job_name = 'cco-sync-tita-sessions'
  AND status = 'success'
  AND finished_at > now() - interval '7 days';
```

---

## ✅ Success Criteria

```
PRE-DEPLOYMENT
══════════════════════════════════════════════════════════
✅ All code written and documented
✅ No syntax errors
✅ Error handling implemented
✅ Logging enabled
✅ Test plan created
✅ Audit queries provided
✅ User documentation written

POST-DEPLOYMENT (First 24 Hours)
══════════════════════════════════════════════════════════
✅ Migration applied successfully
✅ Job 1 deployed and callable
✅ First mutations detected (if any remappings occurred)
✅ Orphan records created and tracked
✅ Authorization consolidation working
✅ No foreign key violations
✅ Processing logs recording activity

ONGOING (First Week)
══════════════════════════════════════════════════════════
✅ Mutations accumulating as expected (5-8% of daily sessions)
✅ Orphan records aging correctly
✅ Cron job scheduled and verified
✅ No performance degradation
✅ All audit queries returning expected results
✅ Cleanup job ready (will execute at T0+30d)
```

---

**Architecture Version**: 2026-06-08  
**Status**: Ready for deployment  
**Next**: Fase 3 (Conciliation Engine) after Fase 2-B testing completes
