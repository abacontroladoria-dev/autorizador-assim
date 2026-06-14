# Roadmap: Implementação da Solução de Sessões Mutantes

**Status**: 🔧 Pronto para início (Fase 2-B)  
**Duração Estimada**: 1-2 semanas  
**Dependências**: Fase 1 ✅, Fase 2 ✅  
**Bloqueador**: Fase 3 deve aguardar conclusão de Fase 2-B

---

## Sprint 1: Foundation (3-4 dias)

### 1.1 Schema DDL Additions

**Arquivo**: `supabase/migrations/20260610000001_cco_mutations_tracking.sql`

```sql
-- 1. Create session_mutations table
CREATE TABLE IF NOT EXISTS cco.session_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tita_agendamento_id bigint NOT NULL,
  session_key_before text,
  session_key_after text NOT NULL,
  mutation_type text NOT NULL CHECK (mutation_type IN (
    'creation', 'reschedule', 'substitution', 'cancellation', 'reactivation'
  )),
  data_old date,
  data_new date,
  hora_old time,
  hora_new time,
  paciente_nome text NOT NULL,
  mutation_at timestamptz DEFAULT now(),
  detected_by text DEFAULT 'job-1-tita',
  UNIQUE (tita_agendamento_id, mutation_at, mutation_type)
);

-- 2. Indexes for mutation queries
CREATE INDEX idx_mutations_tita_id 
  ON cco.session_mutations(tita_agendamento_id, mutation_at DESC);
CREATE INDEX idx_mutations_session_keys 
  ON cco.session_mutations(session_key_before, session_key_after);
CREATE INDEX idx_mutations_type
  ON cco.session_mutations(mutation_type, mutation_at DESC);

-- 3. Add soft-delete columns
ALTER TABLE cco.atendimentos 
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS tita_session_chain_id uuid;

ALTER TABLE cco.occurrences 
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;

ALTER TABLE cco.session_authorizations 
  ADD COLUMN IF NOT EXISTS orphaned_at timestamptz,
  ADD COLUMN IF NOT EXISTS copied_from_session_key text;

-- 4. Create consolidation log
CREATE TABLE IF NOT EXISTS cco.consolidation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_session_key text NOT NULL,
  target_session_key text NOT NULL,
  records_copied int,
  consolidation_type text,
  executed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_consolidation_keys
  ON cco.consolidation_log(source_session_key, target_session_key);

-- 5. Create retention audit log
CREATE TABLE IF NOT EXISTS cco.retention_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_rows int,
  deleted_type text,
  reason text,
  executed_at timestamptz DEFAULT now()
);

-- 6. Revision for FK constraints (soft-delete ready)
-- Note: On DELETE SET NULL allows cleanup while preserving occurrences
ALTER TABLE cco.session_authorizations
  DROP CONSTRAINT IF EXISTS session_authorizations_session_key_fkey,
  ADD CONSTRAINT session_authorizations_session_key_fkey
    FOREIGN KEY (session_key) 
    REFERENCES cco.atendimentos(session_key) 
    ON DELETE SET NULL;  -- Changed from RESTRICT

-- 7. Grant permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA cco TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cco TO service_role;
```

**Checklist**:

- [ ] SQL syntax validated
- [ ] Migration tested on staging DB
- [ ] Indexes created successfully
- [ ] No schema conflicts
- [ ] FK changes applied without data loss

**Tests to Run**:

```bash
supabase db reset  # Reset to latest migration
# Verify:
SELECT * FROM information_schema.tables 
WHERE table_schema='cco' AND table_name IN (
  'session_mutations', 'consolidation_log', 'retention_audit'
);
```

---

### 1.2 Type/Interface Definitions

**File**: `supabase/functions/cco-shared/mutations.ts`

```typescript
/**
 * Mutation tracking types for CCO sync jobs
 */

export interface SessionMutation {
  id?: string;
  tita_agendamento_id: bigint;
  session_key_before: string | null;
  session_key_after: string;
  mutation_type: 'creation' | 'reschedule' | 'substitution' | 'cancellation' | 'reactivation';
  data_old: string | null; // YYYY-MM-DD
  data_new: string;
  hora_old: string | null; // HH:MM
  hora_new: string;
  paciente_nome: string;
  mutation_at?: string;
  detected_by?: string;
}

export interface ConsolidationLog {
  source_session_key: string;
  target_session_key: string;
  records_copied: number;
  consolidation_type: string;
  executed_at?: string;
}

export interface PreviousSessionState {
  [tita_id: string]: {
    session_key: string;
    data_sessao: string;
    hora_inicio: string;
  };
}
```

**Checklist**:

- [ ] TypeScript compiles without errors
- [ ] Types exported from `cco-shared/logger.ts`
- [ ] Shared utilities module updated

---

## Sprint 2: Job 1 Enhancement (3-4 dias)

### 2.1 Mutation Detection Logic

**File**: `supabase/functions/cco-sync-tita-sessions/index.ts` (MODIFIED)

**Changes to `syncTITASessions()` function**:

```typescript
/**
 * Enhanced Job 1 with mutation detection
 */
async function syncTITASessions(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  
  // 1. Fetch previous state (snapshot from last sync)
  const previousState = await getPreviousSyncState(supabase);
  console.log(`[Job1] Previous state: ${Object.keys(previousState).length} sessions`);
  
  // 2. Fetch current TITA CSV
  const csvText = await fetchTITACSV();
  const sessions = await parseTITAResponse(csvText);
  console.log(`[Job1] Current TITA has ${sessions.length} sessions`);
  
  // 3. DETECT MUTATIONS
  const mutations = await detectMutations(
    supabase,
    sessions,
    previousState
  );
  console.log(`[Job1] Detected ${mutations.length} mutations`);
  
  // 4. UPSERT sessions (existing logic)
  const upsertedCount = await upsertSessions(supabase, sessions);
  
  // 5. MARK ORPHANS (new logic)
  const orphanedCount = await markOrphans(supabase, previousState, sessions);
  console.log(`[Job1] Marked ${orphanedCount} orphans`);
  
  // 6. Log results
  await logger.finishSuccess(supabase, upsertedCount);
  
  return upsertedCount;
}

/**
 * Detect changes in TITA sessions (mutations)
 */
async function detectMutations(
  supabase: ReturnType<typeof createClient>,
  currentSessions: TITASession[],
  previousState: PreviousSessionState,
): Promise<SessionMutation[]> {
  const mutations: SessionMutation[] = [];
  
  const currentMap = new Map(
    currentSessions.map(s => [
      s.id?.toString(),
      {
        session_key: await buildSessionKey(s.paciente_nome!, s.data_sessao!, s.hora_inicio!),
        data: s.data_sessao,
        hora: s.hora_inicio,
      }
    ])
  );
  
  // Check each previous session for changes
  for (const [titaIdStr, prev] of Object.entries(previousState)) {
    const curr = currentMap.get(titaIdStr);
    
    if (!curr) {
      // Session disappeared from TITA → cancellation
      mutations.push({
        tita_agendamento_id: BigInt(titaIdStr),
        session_key_before: prev.session_key,
        session_key_after: prev.session_key, // No after (deleted)
        mutation_type: 'cancellation',
        data_old: prev.data_sessao,
        data_new: null,
        hora_old: prev.hora_inicio,
        hora_new: null,
        paciente_nome: '', // Will fill from DB lookup
        detected_by: 'job-1-tita'
      });
    } else if (curr.session_key !== prev.session_key) {
      // Session key changed → reschedule or substitution
      const mutationType = 
        curr.data !== prev.data_sessao || curr.hora !== prev.hora_inicio
          ? 'reschedule'
          : 'substitution';
      
      mutations.push({
        tita_agendamento_id: BigInt(titaIdStr),
        session_key_before: prev.session_key,
        session_key_after: curr.session_key,
        mutation_type: mutationType,
        data_old: prev.data_sessao,
        data_new: curr.data,
        hora_old: prev.hora_inicio,
        hora_new: curr.hora,
        paciente_nome: '', // Will fill from DB lookup
        detected_by: 'job-1-tita'
      });
    }
  }
  
  // Log all mutations to database
  if (mutations.length > 0) {
    const { error } = await supabase
      .from('cco.session_mutations')
      .insert(mutations);
    
    if (error) {
      console.error('[Job1] Error logging mutations:', error);
      // Don't throw, just log and continue
    }
  }
  
  return mutations;
}

/**
 * Mark sessions that disappeared from TITA as orphaned
 */
async function markOrphans(
  supabase: ReturnType<typeof createClient>,
  previousState: PreviousSessionState,
  currentSessions: TITASession[],
): Promise<number> {
  const currentTitaIds = new Set(currentSessions.map(s => s.id?.toString()));
  const orphanedTitaIds = Object.keys(previousState)
    .filter(id => !currentTitaIds.has(id))
    .map(id => BigInt(id));
  
  if (orphanedTitaIds.length === 0) return 0;
  
  const { data, error } = await supabase
    .from('cco.atendimentos')
    .update({ orphaned_at: new Date().toISOString() })
    .in('tita_agendamento_id', orphanedTitaIds)
    .select('id')
    .count('exact');
  
  if (error) {
    console.error('[Job1] Error marking orphans:', error);
    throw error;
  }
  
  return data?.length || 0;
}

/**
 * Get previous state snapshot (for mutation detection)
 */
async function getPreviousSyncState(
  supabase: ReturnType<typeof createClient>,
): Promise<PreviousSessionState> {
  const { data, error } = await supabase
    .from('cco.atendimentos')
    .select('tita_agendamento_id, session_key, data_sessao, hora_inicio')
    .not('tita_agendamento_id', 'is', null)
    .gt('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days
  
  if (error) {
    console.error('[Job1] Error fetching previous state:', error);
    return {};
  }
  
  const state: PreviousSessionState = {};
  for (const row of data || []) {
    state[row.tita_agendamento_id.toString()] = {
      session_key: row.session_key,
      data_sessao: row.data_sessao,
      hora_inicio: row.hora_inicio,
    };
  }
  
  return state;
}
```

**Checklist**:

- [ ] `detectMutations()` function implemented
- [ ] `markOrphans()` function implemented
- [ ] `getPreviousSyncState()` function implemented
- [ ] Mutation insert tested on staging
- [ ] Idempotency verified (run twice → same result)
- [ ] Error handling for orphan marking

**Tests**:

```bash
# Test 1: Normal run (no mutations)
curl -X POST https://<url>/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer <key>" -d '{}'
# Expected: rows_processed > 0, 0 mutations detected

# Test 2: Simulate reschedule
# (Manually change date in TITA for 1 session, run Job 1)
# Expected: 1 mutation logged with type='reschedule'

# Test 3: Idempotency
# (Run Job 1 twice in quick succession)
# Expected: First run detects mutation, second run detects same mutation
#           (UNIQUE constraint prevents duplicate)
```

---

### 2.2 Previous State Persistence

**File**: `supabase/functions/cco-sync-tita-sessions/index.ts`

Add snapshot table for performance:

```sql
-- Optional: Snapshot for faster mutation detection
CREATE TABLE IF NOT EXISTS cco.session_sync_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date UNIQUE NOT NULL,
  session_count int,
  snapshot_data jsonb,  -- Compressed previous state
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_snapshot_date ON cco.session_sync_snapshot(snapshot_date DESC);
```

**Benefits**:

- Faster lookup of previous state (don't scan entire table)
- Can revert to previous state if needed

---

## Sprint 3: History Consolidation (3-4 dias)

### 3.1 Consolidation Logic in Engine (Fase 3 Enhancement)

**File**: `supabase/functions/cco-conciliation-engine/index.ts` (NEW FUNCTION)

```typescript
/**
 * Consolidate authorization history when mutation detected
 */
async function consolidateHistoryOnMutation(
  supabase: ReturnType<typeof createClient>,
  logger: JobLogger,
): Promise<number> {
  
  // 1. Find recent mutations that haven't been consolidated
  const { data: mutations, error: mutError } = await supabase
    .from('cco.session_mutations')
    .select('*')
    .in('mutation_type', ['reschedule', 'substitution'])
    .gt('mutation_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('mutation_at', { ascending: false });
  
  if (mutError) {
    throw new Error(`Failed to fetch mutations: ${mutError.message}`);
  }
  
  if (!mutations || mutations.length === 0) {
    console.log('[Engine] No recent mutations to consolidate');
    return 0;
  }
  
  console.log(`[Engine] Found ${mutations.length} mutations to consolidate`);
  
  let consolidatedCount = 0;
  
  for (const mutation of mutations) {
    if (!mutation.session_key_before) continue;
    
    try {
      // 2. Copy authorizations from old to new session
      const copied = await copyAuthorizations(
        supabase,
        mutation.session_key_before,
        mutation.session_key_after
      );
      
      consolidatedCount += copied;
      
      // 3. Log consolidation
      await supabase
        .from('cco.consolidation_log')
        .insert({
          source_session_key: mutation.session_key_before,
          target_session_key: mutation.session_key_after,
          records_copied: copied,
          consolidation_type: 'authorization_copy'
        });
      
      console.log(
        `[Engine] Consolidated ${copied} auths: ${mutation.session_key_before} → ${mutation.session_key_after}`
      );
      
    } catch (err) {
      console.error(`[Engine] Consolidation failed for ${mutation.id}:`, err);
      // Continue with next mutation (non-blocking)
    }
  }
  
  return consolidatedCount;
}

/**
 * Copy authorizations from old session to new
 */
async function copyAuthorizations(
  supabase: ReturnType<typeof createClient>,
  oldSessionKey: string,
  newSessionKey: string,
): Promise<number> {
  
  // 1. Get all authorizations from old session
  const { data: oldAuths, error: getError } = await supabase
    .from('cco.session_authorizations')
    .select('*')
    .eq('session_key', oldSessionKey);
  
  if (getError) {
    throw new Error(`Failed to get old auths: ${getError.message}`);
  }
  
  if (!oldAuths || oldAuths.length === 0) {
    return 0;
  }
  
  // 2. For each auth, check if new session already has it
  let copiedCount = 0;
  
  for (const oldAuth of oldAuths) {
    const { data: existingAuth } = await supabase
      .from('cco.session_authorizations')
      .select('*')
      .eq('session_key', newSessionKey)
      .eq('source', oldAuth.source)
      .single();
    
    if (!existingAuth) {
      // 3. Copy auth to new session with tracking
      const { error: insertError } = await supabase
        .from('cco.session_authorizations')
        .insert({
          ...oldAuth,
          id: undefined,  // Generate new UUID
          session_key: newSessionKey,
          copied_from_session_key: oldSessionKey,
          copied_at: new Date().toISOString(),
        });
      
      if (!insertError) {
        copiedCount++;
      } else {
        console.warn(`[Engine] Failed to copy auth for source=${oldAuth.source}:`, insertError);
      }
    }
  }
  
  return copiedCount;
}
```

**Checklist**:

- [ ] Consolidation logic added to Engine
- [ ] Tested with sample mutations
- [ ] Logging implemented
- [ ] Error handling (non-blocking)
- [ ] Performance acceptable (< 30s total)

---

### 3.2 Cleanup & Retention Jobs (NEW)

**File**: `supabase/functions/cco-retention-orphans/index.ts`

```typescript
serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);
  
  const logger = new JobLogger("cco-retention-orphans");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  
  try {
    let totalDeleted = 0;
    
    // PHASE 1: Soft-delete old orphaned sessions (7+ days)
    const { data: orphanedCount } = await supabase
      .from('cco.atendimentos')
      .select('id', { count: 'exact' })
      .not('orphaned_at', 'is', null)
      .lt('orphaned_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    // PHASE 2: Archive historical data (optional)
    // ... (insert to archive schema)
    
    // PHASE 3: Hard-delete sessions with 30+ days orphaned
    const { count: deletedSessions } = await supabase
      .from('cco.atendimentos')
      .delete()
      .not('orphaned_at', 'is', null)
      .lt('orphaned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .select('id', { count: 'exact' });
    
    // PHASE 4: Resolved occurrences (90+ days, existing)
    const { count: deletedOccurrences } = await supabase
      .from('cco.occurrences')
      .delete()
      .not('resolved_at', 'is', null)
      .lt('resolved_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .select('id', { count: 'exact' });
    
    totalDeleted = (deletedSessions || 0) + (deletedOccurrences || 0);
    
    // Log retention action
    await supabase
      .from('cco.retention_audit')
      .insert({
        deleted_rows: totalDeleted,
        deleted_type: 'orphans_and_resolved',
        reason: 'daily-retention-job'
      });
    
    await logger.finishSuccess(supabase, totalDeleted);
    
    return jsonResponse({
      ok: true,
      job: "cco-retention-orphans",
      rows_deleted: totalDeleted,
    });
    
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await logger.finishError(supabase, error);
    return jsonResponse({ error: error.message }, 500);
  }
});
```

**Cron Schedule**:

```sql
-- Register in migration file
SELECT cron.schedule(
  'cco-retention-orphans',
  '0 2 * * *',  -- 02:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://<supabase-url>/functions/v1/cco-retention-orphans',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
  );
  $$
);
```

**Checklist**:

- [ ] Retention job implemented
- [ ] Cron schedule registered
- [ ] Tested on staging (dry-run first)
- [ ] Audit log working
- [ ] No data loss during test

---

## Sprint 4: Testing & Validation (2-3 dias)

### 4.1 Unit Tests

**File**: `tests/cco-mutations.test.ts`

```typescript
describe('CCO Mutation Detection', () => {
  
  test('should detect reschedule mutation', async () => {
    // Given: Session abc123 with date 2026-06-08
    // When: Job 1 sees same session with date 2026-06-09
    // Then: Mutation logged with type='reschedule'
  });
  
  test('should mark orphans when session disappears', async () => {
    // Given: Session abc123 in cco.atendimentos
    // When: Job 1 runs and TITA CSV doesn't contain it
    // Then: orphaned_at is set to now()
  });
  
  test('should consolidate authorizations on mutation', async () => {
    // Given: Old session abc123 with authorization LIBERADA
    // When: Engine detects mutation abc123 → def456
    // Then: New session def456 has same authorization with copied_from flag
  });
  
  test('should not duplicate mutations (idempotent)', async () => {
    // Given: Mutation already logged
    // When: Engine consolidates the same mutation again
    // Then: No duplicate consolidation log entries
  });
  
  test('should clean orphans after 30 days', async () => {
    // Given: Session marked orphaned_at = now() - 31 days
    // When: Retention job runs
    // Then: Session deleted from cco.atendimentos
  });
});
```

### 4.2 Integration Tests

```bash
# Test Suite: Full Mutation Flow

# Setup
supabase db reset  # Fresh DB with latest migrations

# Test 1: Create Session
curl -X POST https://<url>/functions/v1/cco-sync-tita-sessions -d '{}'
# Verify: cco.atendimentos has 1 row with session_key=abc123

# Test 2: Simulate Reschedule in TITA (manual in apptita.com.br UI)
# Or programmatically mock the TITA response

# Test 3: Run Job 1 Again
curl -X POST https://<url>/functions/v1/cco-sync-tita-sessions -d '{}'
# Verify:
# - cco.atendimentos has 2 rows: abc123 (orphaned_at=set), def456 (new)
# - cco.session_mutations has 1 row: reschedule abc123→def456
# - Processing logs show mutation detection

# Test 4: Run Engine
curl -X POST https://<url>/functions/v1/cco-conciliation-engine -d '{}'
# Verify:
# - cco.session_authorizations consolidated from abc123 to def456
# - cco.consolidation_log has 1 entry
# - Occurrences created for def456 (new session)

# Test 5: Run Retention (after 31 days simulated)
# UPDATE cco.atendimentos SET orphaned_at = now() - interval '31 days'
curl -X POST https://<url>/functions/v1/cco-retention-orphans -d '{}'
# Verify:
# - abc123 deleted from cco.atendimentos
# - cco.retention_audit has 1 row with deleted_rows > 0
```

**Checklist**:

- [ ] All unit tests pass
- [ ] Integration test sequence passes
- [ ] Idempotency verified
- [ ] Performance acceptable (all jobs < 30s)
- [ ] Logs are complete and accurate
- [ ] No data corruption detected

### 4.3 Validation Queries

Run diagnostic queries from `SESSOES_MUTANTES_DIAGNOSTICO.sql`:

```bash
# After implementing all 3 sprints:

# ✅ Test 1: Zero orphans
psql -c "SELECT COUNT(*) FROM cco.occurrences o 
         WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a 
         WHERE a.session_key = o.session_key);"
# Expected: 0

# ✅ Test 2: Consolidation complete
psql -c "SELECT COUNT(*) FROM cco.session_authorizations 
         WHERE copied_from_session_key IS NOT NULL;"
# Expected: > 0 (if mutations occurred)

# ✅ Test 3: Dashboard consistency
psql -c "SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL;
         SELECT COUNT(*) FROM cco.occurrences o
         JOIN cco.atendimentos a ON o.session_key = a.session_key
         WHERE o.resolved_at IS NULL;"
# Expected: Both queries return SAME count
```

---

## Deployment Checklist

### Pre-Production

- [ ] All migrations reviewed and tested
- [ ] Job 1 enhancement tested with real TITA data
- [ ] Engine consolidation logic verified
- [ ] Retention job tested (dry-run)
- [ ] FK constraint changes applied without data loss
- [ ] All indexes created and optimized

### Production Deployment Steps

1. **Backup Database**

   ```bash
   supabase db backup
   ```

2. **Apply Migrations**

   ```bash
   supabase db push
   # Or manually in Supabase SQL Editor
   ```

3. **Deploy Edge Functions** (in order)

   ```bash
   supabase functions deploy cco-sync-tita-sessions  # Updated with mutations
   supabase functions deploy cco-conciliation-engine  # Updated with consolidation
   supabase functions deploy cco-retention-orphans    # New
   ```

4. **Register Cron Job**

   ```sql
   -- Already in migration, but verify:
   SELECT * FROM cron.job WHERE jobname LIKE 'cco-retention%';
   ```

5. **Verify**

   ```bash
   # Monitor first 24 hours
   SELECT * FROM cco.processing_logs 
   WHERE job_name IN ('cco-sync-tita-sessions', 'cco-conciliation-engine')
   ORDER BY started_at DESC LIMIT 10;
   ```

6. **Alert Setup**

   ```sql
   -- If orphaned_count > 50 detected, alert DevOps
   CREATE ALERT ... (optional, via monitoring tool)
   ```

### Rollback Plan

If issues occur:

```bash
# Revert Edge Functions
supabase functions delete cco-retention-orphans

# Revert migrations (in reverse order)
supabase migration unpush  # or manual in SQL Editor
DROP TABLE IF EXISTS cco.session_mutations CASCADE;
DROP TABLE IF EXISTS cco.consolidation_log CASCADE;
DROP TABLE IF EXISTS cco.retention_audit CASCADE;
ALTER TABLE cco.atendimentos DROP COLUMN IF EXISTS orphaned_at, tita_session_chain_id;
ALTER TABLE cco.occurrences DROP COLUMN IF EXISTS orphaned_at;

# Restore from backup if needed
supabase db restore <backup-id>
```

---

## Success Metrics

**After implementation, validate**:

| Metric | Target | Tool |
|---|---|---|
| % Orphaned sessions detected | 100% of mutations | cco.session_mutations count |
| Consolidation rate | 100% of copies | cco.consolidation_log |
| FK integrity | 0 broken references | Query from diagnostic.sql |
| Retention effectiveness | 0 orphans > 30d | cco.atendimentos orphaned_at check |
| Dashboard consistency | Counts match | Query #4.3 above |
| Job performance | < 30s each | cco.processing_logs duration |
| **Data quality score** | **100%** | All metrics passing |

---

## Documentation & Handoff

Prepare for Fase 3:

1. **Update Architecture Docs**
   - Add session mutations flow to architecture.md
   - Document change log table design

2. **Update Engine Spec**
   - Fase 3 engine includes consolidation logic
   - Occurrences now inherit from previous versions

3. **Train Team**
   - Demo mutation detection in action
   - Explain soft-delete strategy
   - Show diagnostic queries for troubleshooting

4. **Create Runbook**
   - How to manually cleanup orphans
   - How to investigate mutation failures
   - How to archive historical data

---

## Timeline Summary

```
Week 1 (Sprint 1-2):
├─ Mon-Tue: Schema + Job 1 mutations (4-6h)
├─ Tue-Wed: Testing & validation (4h)
├─ Wed-Thu: Code review + fixes (2-4h)
└─ Thu-Fri: Staging deployment + monitoring (4h)

Week 2 (Sprint 3-4):
├─ Mon-Tue: Engine consolidation (4-6h)
├─ Tue-Wed: Retention job (4h)
├─ Wed: Integration testing (4h)
├─ Thu: Production deployment (2h)
└─ Fri: Monitoring + documentation (2h)

Total: ~40 hours (10 days, 1 developer)
       OR
       ~28 hours (3-4 days, 2 developers paired)
```

---

**Document Owner**: Tech Lead  
**Status**: Ready for Kick-Off  
**Next Step**: Schedule design review before coding starts
