# Fase 2 — Sync Jobs (Materialização de Dados)

**Status**: ✅ Implementado  
**Data**: 2026-06-08  
**Objetivo**: 4 jobs idempotentes que materializam dados legados para schema CCO

---

## Arquitetura

### Padrão: Sidecar Materialization

```
┌──────────────────────────────────────────┐
│           LEGACY SOURCES                 │
│                                          │
│  ① API TITA                              │
│  ② autorizacoes_assim                    │
│  ③ fila_autorizacoes                     │
│  ④ controle_terapeutico                  │
└──────────────────────────────────────────┘
              ↓ (read-only)
┌──────────────────────────────────────────┐
│       pg_cron (schedule)                 │
│                                          │
│  Every 5-15 minutes, call Edge Functions │
└──────────────────────────────────────────┘
              ↓ (http_post)
┌──────────────────────────────────────────┐
│       EDGE FUNCTIONS (Deno)              │
│                                          │
│  1. cco-sync-tita-sessions               │
│  2. cco-sync-assim-authorizations        │
│  3. cco-sync-authorization-queue         │
│  4. cco-sync-therapist-control           │
└──────────────────────────────────────────┘
              ↓ (upsert)
┌──────────────────────────────────────────┐
│       SCHEMA CCO (isolated)              │
│                                          │
│  • cco.atendimentos                      │
│  • cco.session_authorizations            │
│  • cco.session_substitutions             │
│  • cco.processing_logs                   │
└──────────────────────────────────────────┘
              ↓ (ready for)
      Fase 3: Conciliation Engine
```

---

## Jobs Implementados

### Job 1: `cco-sync-tita-sessions`

**Schedule**: Every 5 minutes (00, 05, 10, 15, ..., 55)

**Source**: `https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais`

**Destination**: `cco.atendimentos`

**Logic**:
1. Fetch CSV grade from TITA API
2. Parse CSV → extract sessions (paciente_nome, data_sessao, hora_inicio, etc.)
3. Compute `session_key = sha256(unaccent_lower(paciente_nome) || data_sessao || hora_inicio)`
4. Compute `sync_hash` for change detection
5. UPSERT by `session_key` (PostgreSQL UNIQUE constraint handles duplicates)
6. Log to `cco.processing_logs`

**Idempotency**: UPSERT by UNIQUE (session_key) + ON CONFLICT clause

**Errors**:
- TITA API unreachable → logged, retry on next interval
- Parse error → skip malformed rows, continue
- DB error → logged and returned as 500

---

### Job 2: `cco-sync-assim-authorizations`

**Schedule**: Every 5 minutes (01, 06, 11, 16, ..., 56)

**Source**: `autorizacoes_assim` (public schema)

**Destination**: `cco.session_authorizations` with `source='assim'`

**Logic**:
1. Fetch all records from `autorizacoes_assim`
2. For each record: build `session_key` from (paciente_nome, data_sessao, hora_sessao)
3. Map ASSIM status → `authorization_status` (LIBERADA, PENDENTE, GLOSA, CANCELADA, SEM_SOLICITACAO)
4. UPSERT by `(session_key, source='assim')`
5. Log to `cco.processing_logs`

**Key Decisions**:
- `source='assim'` ensures separation from Job 3 (source='fila')
- UPSERT by composite `(session_key, source)` prevents race conditions
- Status mapping: handles various format variations in legacy data

**Idempotency**: UPSERT by UNIQUE (session_key, source) + ON CONFLICT clause

---

### Job 3: `cco-sync-authorization-queue`

**Schedule**: Every 5 minutes (02, 07, 12, 17, ..., 57)

**Source**: `fila_autorizacoes` (public schema)

**Destination**: `cco.session_authorizations` with `source='fila'`

**Logic**:
1. Fetch all records from `fila_autorizacoes`
2. For each record: build `session_key` from (paciente_nome, data_sessao, hora_sessao)
3. Map fila status → `authorization_status`
4. UPSERT by `(session_key, source='fila')`
5. Log to `cco.processing_logs`

**Key Decisions**:
- Separate from Job 2 (different source, different table)
- Tracks "pending" state of authorization requests
- Maps status: PENDENTE, CONCLUIDO, CANCELADA, REJEITADA

**Idempotency**: UPSERT by UNIQUE (session_key, source) + ON CONFLICT clause

---

### Job 4: `cco-sync-therapist-control`

**Schedule**: Every 15 minutes (03, 18, 33, 48)

**Source**: `controle_terapeutico` (public schema)

**Destination**: `cco.session_substitutions`

**Logic**:
1. Fetch all records from `controle_terapeutico`
2. Filter for records with status='falta' or status='substituto' (ignore 'presente')
3. For each: build `session_key` from (paciente_nome, data_sessao, hora_sessao)
4. Extract substitution info (profissional_substituto_nome, status, etc.)
5. UPSERT by `session_key`
6. Log to `cco.processing_logs`

**Key Decisions**:
- Only syncs "falta" and "substituto" records (skips "presente")
- Longer schedule (15 min) because changes are less frequent
- Source of truth for FALTA_TERAPEUTA and SUBSTITUICAO occurrence rules

**Idempotency**: UPSERT by UNIQUE (session_key) + ON CONFLICT clause

---

## Shared Utilities

### `cco-shared/logger.ts`

**Functions**:
- `JobLogger` class: logs job execution (start, end, status, error, row count)
- `normalizePatientName()`: unaccent + lowercase + trim
- `normalizeTime()`: convert to HH:MM
- `normalizeDate()`: convert DD/MM/YYYY to YYYY-MM-DD
- `computeSHA256()`: crypto API-based hash
- `buildSessionKey()`: compute deterministic session_key

**Pattern**:
```typescript
const logger = new JobLogger("job-name")
try {
  const count = await doWork()
  await logger.finishSuccess(supabase, count)
} catch (err) {
  await logger.finishError(supabase, err)
}
```

---

## Cron Schedule

```sql
-- Job 1: TITA (every 5 min, start at :00)
*/5 * * * *

-- Job 2: ASSIM (every 5 min, start at :01)
1,6,11,16,21,26,31,36,41,46,51,56 * * * *

-- Job 3: Fila (every 5 min, start at :02)
2,7,12,17,22,27,32,37,42,47,52,57 * * * *

-- Job 4: Control (every 15 min, start at :03)
3,18,33,48 * * * *
```

**Why staggered offsets?**
- Prevents thundering herd (all jobs at :00)
- Distributes database load evenly
- Rate-limits TITA API (max 12 calls/hour per job)
- Leaves room for manual execution or other jobs

---

## Error Handling

### Network Errors
- TITA API unreachable → logged with status "error", retry next interval
- Edge Function endpoint not found → retry with backoff
- Database connection error → logged, job fails gracefully

### Data Errors
- Malformed CSV from TITA → skip rows, continue processing
- Missing required fields (paciente_nome, data_sessao, hora_inicio) → skip, log warning
- Session_key computation failure → skip row, continue
- UPSERT fails (DB constraint) → entire batch rolls back, logged

### Logging
All jobs write to `cco.processing_logs`:
- `job_name`: identifier (cco-sync-tita-sessions, etc.)
- `started_at`: timestamp when job started
- `finished_at`: timestamp when job ended (NULL if error)
- `status`: 'running', 'success', or 'error'
- `rows_processed`: count of successful UPSERT rows
- `error_message`: error detail (if status='error')

---

## Idempotency Guarantees

### UPSERT Pattern
```typescript
await supabase
  .from("cco.atendimentos")
  .upsert(batch, { onConflict: "session_key" })
  .select("id")
```

**Safe re-execution**:
- Job 1 runs twice in 5 min → second UPSERT updates existing rows, no duplicates
- Network failure, retry → UPSERT idempotent, same effect as first attempt
- Manual re-run → same result, no data corruption

### Composite Keys
- Jobs 2 & 3 use `(session_key, source)` as unique key
- Prevents one source overwriting another (ASSIM vs fila)
- Each source has independent UPSERT path

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **TITA API rate-limit** | Job fails, delays cascade | Staggered offsets, max 12 calls/hour |
| **Session_key collision** | Occurrences mixed across sessions | Deterministic hash, tested for edge cases |
| **Concurrent upserts** | Race condition on database | Advisory locks planned for Fase 3 |
| **Network timeout** | Partial sync, stale data | Retry on next interval, idempotent |
| **Schema change** | Job breaks if column renamed | Comments document required fields |
| **Missing paciente_nome** | Session_key computation fails | Rows skipped, logged as warning |

---

## Deployment Checklist

- [ ] Deploy Edge Functions:
  - `cco-sync-tita-sessions`
  - `cco-sync-assim-authorizations`
  - `cco-sync-authorization-queue`
  - `cco-sync-therapist-control`
  
- [ ] Apply migration: `20260608000002_cco_cron_jobs.sql`

- [ ] Verify cron jobs registered:
  ```sql
  SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'cco-%';
  ```

- [ ] Test each job manually:
  ```bash
  curl -X POST https://<supabase-url>/functions/v1/cco-sync-tita-sessions \
    -H "Authorization: Bearer <service-role-key>" \
    -H "Content-Type: application/json" \
    -d '{}'
  ```

- [ ] Monitor logs:
  ```sql
  SELECT * FROM cco.processing_logs ORDER BY started_at DESC LIMIT 10;
  ```

---

## Files Created

```
supabase/functions/
  ├─ cco-shared/
  │  └─ logger.ts                           (shared utilities)
  ├─ cco-sync-tita-sessions/
  │  └─ index.ts                           (Job 1)
  ├─ cco-sync-assim-authorizations/
  │  └─ index.ts                           (Job 2)
  ├─ cco-sync-authorization-queue/
  │  └─ index.ts                           (Job 3)
  └─ cco-sync-therapist-control/
     └─ index.ts                           (Job 4)

supabase/migrations/
  └─ 20260608000002_cco_cron_jobs.sql      (pg_cron registration)
```

---

## Next Phase

**Fase 3** will implement the conciliation engine:
- Read materialized data from `cco.*` tables
- Apply 7 business rules
- Generate occurrences in `cco.occurrences`
- Update dashboard snapshot
- Log to `cco.processing_logs`

Jobs 1-4 will call the engine upon completion (fire-and-forget with advisory lock guard).

---

## Testing & Validation

See: [CCO Sync Jobs Validation Guide](./FASE_2_CCO_VALIDATION.md)
