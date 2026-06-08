# Diagrama Visual: Problema de Sessões Mutantes

## 1. Estado Normal (Sem Mutação)

```
TITA API
┌────────────────────────┐
│ ID: 1234               │
│ João Silva             │
│ Data: 2026-06-08       │
│ Hora: 14:00            │
└────────────────────────┘
          ↓
Job 1: cco-sync-tita-sessions
┌────────────────────────┐
│ Parse CSV              │
│ Compute session_key    │
│ UPSERT by session_key  │
└────────────────────────┘
          ↓
cco.atendimentos
┌──────────────────────────────────┐
│ id: uuid1                        │
│ session_key: abc123 ✅ UNIQUE    │
│ tita_agendamento_id: 1234        │
│ paciente_nome: João Silva        │
│ data_sessao: 2026-06-08          │
│ hora_inicio: 14:00               │
│ synced_at: now()                 │
└──────────────────────────────────┘
          ↓
Engine (Fase 3)
┌────────────────────────┐
│ Check ASSIM            │
│ No authorization found │
│ Create occurrence:     │
│ AUTORIZACAO_PENDENTE   │
└────────────────────────┘
          ↓
cco.occurrences
┌──────────────────────────────────┐
│ id: uuid2                        │
│ session_key: abc123 ✅ FK OK      │
│ tipo: AUTORIZACAO_PENDENTE       │
│ fingerprint: abc123::AP::2026... │
│ created_at: now()                │
│ resolved_at: null                │
└──────────────────────────────────┘

Result: ✅ NORMAL STATE
- 1 session in cco.atendimentos
- 1 occurrence in cco.occurrences
- FK integrity preserved
- Dashboard count: 1
```

---

## 2. Cenário Crítico: Remarcação Simples

```
┌─────────────────────────────────────────────────────────────────┐
│ T0: CREATE SESSION IN TITA                                      │
└─────────────────────────────────────────────────────────────────┘

TITA API (T0: 10:00)
┌────────────────────────┐
│ ID: 1234               │
│ João Silva             │
│ Data: 2026-06-08       │  ← Original
│ Hora: 14:00            │
└────────────────────────┘
          │
          │ (Job 1 runs at T1: 13:05)
          ↓
cco.atendimentos (T1)
┌──────────────────────────────────┐
│ session_key: abc123              │
│ data_sessao: 2026-06-08          │
│ hora_inicio: 14:00               │
└──────────────────────────────────┘
          │
          │ (Engine runs at T2: 13:10)
          ↓
cco.occurrences (T2)
┌──────────────────────────────────┐
│ session_key: abc123 ✅ EXISTS     │
│ tipo: AUTORIZACAO_PENDENTE       │
└──────────────────────────────────┘

═════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│ T3: OPERADOR REMARCA SESSÃO EM TITA                             │
│     (14:00 → 15:00 same day OR next day)                        │
└─────────────────────────────────────────────────────────────────┘

TITA API (T3: 13:50) — AFTER RESCHEDULE
┌────────────────────────┐
│ ID: 1234               │
│ João Silva             │
│ Data: 2026-06-09       │  ← CHANGED!
│ Hora: 14:00            │
└────────────────────────┘
          │
          │ (Job 1 runs AGAIN at T4: 14:05)
          ↓
Job 1: cco-sync-tita-sessions (T4)
     session_key = sha256("joao silva" || "2026-06-09" || "14:00")
                 = def456 (DIFFERENT!)
          │
          ├─ UPSERT: session_key=def456 → INSERT new row
          │
          └─ OLD session_key=abc123 NOT IN CSV
             → NO DELETE happens (job only inserts/updates)
             → abc123 REMAINS IN TABLE (ORPHANED!) ⚠️

cco.atendimentos (T4) — AFTER UPSERT
┌──────────────────────────────────┐
│ session_key: abc123 🚨 ORPHANED   │  ← Still here!
│ data_sessao: 2026-06-08          │     No reason to exist
│ synced_at: old timestamp         │     Not in TITA anymore
│ orphaned_at: NULL (not marked)   │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ session_key: def456 ✅ NEW        │
│ data_sessao: 2026-06-09          │
│ synced_at: now() (T4: 14:05)      │
└──────────────────────────────────┘

cco.occurrences (still from T2)
┌──────────────────────────────────┐
│ session_key: abc123 🚨 BROKEN FK! │
│ tipo: AUTORIZACAO_PENDENTE       │
│ created_at: T2                   │
│ resolved_at: NULL                │
└──────────────────────────────────┘
          │
          │ (Engine runs AGAIN at T5: 14:10)
          ↓
Engine (T5) — FK CONSTRAINT VIOLATION
     Attempts:
     SELECT * FROM cco.occurrences
     WHERE session_key='abc123'
     ↓
     Finds AUTORIZACAO_PENDENTE
     ↓
     Tries JOIN with cco.atendimentos
     WHERE session_key='abc123'
     ↓
     Result: NULL (doesn't exist)
     ↓
     FK CONSTRAINT VIOLATION: ON DELETE RESTRICT
     OR
     Could silently corrupt by soft-deleting orphan ⚠️

═════════════════════════════════════════════════════════════════════

FINAL STATE (T5+):

cco.atendimentos                  cco.occurrences
┌────────────────┐                ┌─────────────────┐
│ abc123 🚨ORP... │◄───FK BROKEN───│ ABC123 OCCURR...│
│ def456 ✅OK    │   (but exists!) │ (no match)      │
└────────────────┘                └─────────────────┘
      │                                │
      └────────────┬───────────────────┘
                   │
            ❌ INCONSISTENT
        (2 states, 1 broken reference)
```

---

## 3. Cenário B: Deleção em Cascata

```
TITA API (Initial)           cco.atendimentos
┌──────────────┐       T0    ┌───────────────────┐
│ ID: 1234     │   ──────→   │ session_key: abc  │
│ João Silva   │             │ tita_id: 1234     │
│ 2026-06-08   │             └───────────────────┘
└──────────────┘                      ↓
                            cco.occurrences
                            ┌───────────────────┐
                    T1-T3    │ [1] ABC::PENDING  │
                   ─────→    │ [2] ABC::EVOLUTION
                            │ [3] ABC::ABSENCE │
                            └───────────────────┘

                            TITA API (Operador deleta)
                            ┌──────────────────────┐
                    T3       │ DELETE ID 1234       │
                   ─────→    │ CSV no longer has it │
                            └──────────────────────┘

Job 1 (T4)
CSV processing:
  ├─ ID 1234: NOT FOUND in CSV
  └─ Action: NONE (no UPSERT, no DELETE)
             abc123 stays in cco.atendimentos (orphaned)

Result (T4+):
     
     cco.atendimentos              cco.occurrences
     ┌─────────────────┐           ┌──────────────┐
     │ session_key:    │ ◄─FK OK?─→ │ [1] ABC:PEND │
     │ abc123 🚨ORPHAN │  But...    │ [2] ABC:EVOL │
     │ tita_id: NULL   │  session   │ [3] ABC:FALT │
     │ updated_at: old │  no longer │              │
     │ orphaned_at: ?  │  exists    └──────────────┘
     └─────────────────┘            in TITA!

Can cleanup?
├─ If ON DELETE RESTRICT: FAILS (can't delete abc123 due to FK)
│  Result: 3 occurrences trapped forever
│
├─ If ON DELETE CASCADE: SUCCEEDS but LOSES AUDIT TRAIL!
│  Result: Occurrences deleted, lost history
│
└─ If soft-delete: PENDING (requires manual audit review)
```

---

## 4. Cenário C: Transição (Deux Versions Simultanées)

```
T0: Create session 1234 → session_key=abc123
    cco.atendimentos: [abc123]

T1: Operador remarca in UI → João Silva 2026-06-08 15:00
    (same date, different hour)

T2: DURING TRANSITION, TITA API returns BOTH old and new

T3: Job 1 processes CSV
    ├─ Row 1: João Silva, 2026-06-08 14:00 → session_key=abc123 (old)
    └─ Row 2: João Silva, 2026-06-08 15:00 → session_key=abc124 (new)
    
    Result: UPSERT both rows
    cco.atendimentos: [abc123, abc124]

T4: Engine runs twice
    ├─ Process abc123 → occurrences
    └─ Process abc124 → occurrences (same day, different hour)
    
    Result: 2 sets of occurrences for "same logical session"
    cco.occurrences: [ABC123::PENDING::2026-06-08, ABC124::PENDING::2026-06-08]

T5: Operador cancela reschedule → Back to 2026-06-08 14:00

T6: Job 1 runs again
    CSV contains: João Silva, 2026-06-08 14:00 → session_key=abc123
    
    UPSERT: Updates abc123 (idempotent)
    But: abc124 NOT IN CSV, NOT DELETED
         → Remains in table (orphaned)

Final State:
    cco.atendimentos
    ┌──────────────┐
    │ abc123 ✅OK  │  ← Current version
    │ abc124 🚨ORP │  ← Orphaned (from failed transition)
    └──────────────┘
            ↓
    cco.occurrences
    ┌──────────────────────┐
    │ ABC123::PENDING      │  ← Current
    │ ABC124::PENDING      │  ← Orphaned
    │ (both same day)      │
    └──────────────────────┘
            
    Dashboard: Counts DUPLICATED!
    Count=2 (should be 1)
```

---

## 5. Data Flow Diagram: Current vs Proposed

### CURRENT (Fase 1-2)

```
TITA API CSV
    │
    ├─ data_sessao=2026-06-08
    ├─ hora_inicio=14:00
    └─ paciente=João Silva
         ↓
    Job 1: Hash → session_key
         ↓ UPSERT by session_key
    cco.atendimentos
    (abc123)
         │
         ├─ tita_agendamento_id (stored but not used as key) 🚨
         └─ data_sessao, hora_inicio (used to derive key) 🚨
              │
              ↓ When Operador remarcas:
              │ Data changes → 2026-06-09
              │ Hash changes → def456
              │
              ├─ Job 1 inserts def456 (new)
              ├─ abc123 remains (orphaned)
              └─ NO WAY TO CONNECT abc123 → def456 ❌

    cco.occurrences
         │
         ├─ Old: session_key=abc123 (OK)
         │
         ├─ New: session_key=def456 (OK)
         │
         └─ No history consolidation ❌

Dashboard
    └─ Count both abc123 and def456 separately
       (inflated count of occurrences)
```

### PROPOSED (Fase 2-B+3)

```
TITA API CSV
    │
    ├─ tita_agendamento_id (ID 1234) ← PRIMARY IDENTIFIER ✅
    ├─ data_sessao=2026-06-08
    ├─ hora_inicio=14:00
    └─ paciente=João Silva
         │
         ├─ Previous state lookup:
         │  "What was tita_id 1234 before?"
         │   → session_key=abc123, data=2026-06-08
         │
         ├─ Current: session_key=def456, data=2026-06-09
         │
         └─ Detect change!
              ↓
    cco.session_mutations (NEW TABLE)
    INSERT:
    ├─ tita_agendamento_id=1234
    ├─ session_key_before=abc123
    ├─ session_key_after=def456
    ├─ mutation_type='reschedule'
    ├─ data_old=2026-06-08
    ├─ data_new=2026-06-09
    └─ detected_by='job-1-tita' ✅
         │
         ↓
    Job 1: UPSERT to cco.atendimentos
    ├─ session_key=def456 (insert new)
    ├─ session_key=abc123 (mark orphaned_at=now()) ✅
    └─ Link via tita_session_chain_id ✅
         │
         ├─────────────────────────────────┐
         │                                 │
         ↓                                 ↓
    Engine: History Consolidation      Engine: New Session Setup
    ├─ Find auths from abc123          ├─ Apply rules
    ├─ Copy to def456 with mark        ├─ Create occurrences
    │  copied_from_session_key=abc123  │
    ├─ Log consolidation               └─ Link to chain
    └─ Mark abc123 as "incorporated"
              │
              ↓
    cco.occurrences
    ├─ Old: abc123 (resolved, kept for audit)
    ├─ New: def456 (active, same rules apply)
    ├─ Consolidated auth history in def456 ✅
    └─ Traceable via session_mutations ✅

Dashboard
    ├─ Count occurrences where orphaned_at IS NULL ✅
    ├─ Only count abc123 if still active
    ├─ Show consolidation in audit trail
    └─ Accurate counts ✅
```

---

## 6. FK Constraint Comparison

```
┌────────────────────────────────────────────────────────────────┐
│                    FK CONSTRAINT OPTIONS                       │
└────────────────────────────────────────────────────────────────┘

CURRENT: ON DELETE RESTRICT
┌─────────────────────────────────────┐
│ cco.occurrences.session_key         │
│ REFERENCES cco.atendimentos.session │
│ ON DELETE RESTRICT                  │
└─────────────────────────────────────┘
        │
        ├─ When DELETE cco.atendimentos WHERE session_key='abc123'
        │  AND occurrences point to 'abc123':
        │
        ├─ Result: ❌ CONSTRAINT VIOLATION
        │
        └─ Problem:
           - Occurrence TRAPPED (can't delete)
           - Session TRAPPED (can't delete)
           - Both accumulate as ORPHANS
           - No cleanup possible
           - Grows forever ⚠️ CRITICAL

═════════════════════════════════════════════════════════════════════

ALTERNATIVE 1: ON DELETE CASCADE
┌──────────────────────────────────────┐
│ ON DELETE CASCADE                    │
│ ↓ When DELETE session:               │
│ Automatically DELETE all occurrences │
└──────────────────────────────────────┘
        │
        └─ Problem:
           - 🚨 LOSES AUDIT TRAIL!
           - Occurrence was created for reason
           - Deleting it erases history
           - Can't audit why it was marked
           - NEVER recommended for audit tables ❌

═════════════════════════════════════════════════════════════════════

ALTERNATIVE 2: ON DELETE SET NULL
┌──────────────────────────────────────┐
│ ON DELETE SET NULL                   │
│ ↓ When DELETE session:               │
│ Occurrences.session_key → NULL       │
└──────────────────────────────────────┘
        │
        ├─ Benefit:
        │  - Can delete sessions
        │  - Occurrences remain (audit preserved)
        │
        └─ Problem:
           - session_key becomes NULL
           - Can't identify WHICH session
           - Dashboard: Unknown orphans
           - Not fully traceable ⚠️

═════════════════════════════════════════════════════════════════════

RECOMMENDED: ON DELETE SET NULL + SOFT DELETE
┌──────────────────────────────────────┐
│ ON DELETE SET NULL                   │
│ + orphaned_at timestamptz            │
│ + always filter WHERE orphaned_at    │
│   IS NULL in queries                 │
└──────────────────────────────────────┘
        │
        ├─ Workflow:
        │  1. Detect orphan: UPDATE...SET orphaned_at=now()
        │  2. Grace period: Wait 30 days
        │  3. Archive (optional): INSERT into history schema
        │  4. Delete: DELETE WHERE orphaned_at < 30d
        │
        ├─ Benefits:
        │  ✅ Audit trail preserved
        │  ✅ Traceable via cco.session_mutations
        │  ✅ Grace period for investigation
        │  ✅ Soft-delete hides from queries
        │  ✅ Can be archived before deletion
        │
        └─ No problems!
```

---

## 7. Timeline: Normal vs Mutant Session

```
═══════════════════════════════════════════════════════════════════
NORMAL SESSION (No Remarcação)
═══════════════════════════════════════════════════════════════════

T1 ──────── T2 ──────── T3 ──────── T4 ──────── T5
10:00      13:05      13:10      14:30      18:00

 │          │          │          │          │
 ├─ Create  ├─ Job 1   ├─ Engine  ├─ Manual  ├─ Resolved
 │  in TITA │  Syncs   │  Creates │  resolut │  aged out
 │          │  abc123  │  occur   │  e occur │  (90d ret)
 │          │          │rence    │  rence   │
 │          │          │          │          │
 ▼          ▼          ▼          ▼          ▼

cco.atendimentos: abc123 (1 version)
cco.occurrences: AUTORIZACAO_PENDENTE (1 record)

Status: ✅ CLEAN

═══════════════════════════════════════════════════════════════════
MUTANT SESSION (With Remarcação)
═══════════════════════════════════════════════════════════════════

T1 ──────── T2 ──────── T3 ──────── T4 ──────── T5 ──────── T6
10:00      13:05      13:10      13:50      14:05      14:10
Create     Job 1      Engine     Remarca    Job 1      Engine
in TITA    Syncs      Creates    in TITA    Syncs      Tries
abc123     abc123     PENDING    abc123→    def456     to link
                                def456               (FAILS!)
│          │          │          │          │          │
│          ├─────────────────────┤          │          │
│          │ Occurrence created  │          │          │
│          │ session_key=abc123  │          │          │
│          │ (pointing to old)   │          │          │
│          │                     │          │          │
│          │                     ├─────────────────────┤
│          │                     │ Remarcação         │
│          │                     │ (not tracked!)     │
│          │                     │                    │
│          │                     │                    ├──────┐
│          │                     │                    │      │
│          │                     │          Job 1 inserts  │
│          │                     │          def456        │
│          │                     │          abc123 ORPHANed│
│          │                     │                        │
│          │                     │          Engine:       │
│          │                     │          BROKEN FK! ❌  │
│          │                     │          engine crash or
│          │                     │          silent corruption
│          │                     │
│          │                     │
▼          ▼                     ▼          ▼          ▼
cco.atendimentos:
  abc123 🚨 ORPHANED
  def456 ✅ OK
  
  Problem: abc123 has no reason to exist
           (not in TITA, no link to def456)

cco.occurrences:
  AUTORIZACAO_PENDENTE.session_key = abc123
  └─ FK BROKEN (abc123 still exists but orphaned)
     OR
     Occurrence soft-deleted without audit

cco.session_mutations: (if implemented)
  RESCHEDULE: abc123 → def456
  └─ Allows retroactive cleanup and consolidation

Status: 🚨 CORRUPTED (without session_mutations solution)
        ✅ RECOVERABLE (with session_mutations + consolidation)
```

---

## 8. Solution State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                   SESSION STATE MACHINE                         │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   DELETED   │ (in TITA)
                    └─────────────┘
                           │
                           │ Operador creates new
                           │ appointment
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                       CREATED STATE                            │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ cco.atendimentos: session_key=abc123 (new)             │   │
│   │ cco.occurrences: (none yet)                            │   │
│   │ cco.session_mutations: (creation logged)               │   │
│   │                                                        │   │
│   └────────────────────────────────────────────────────────┘   │
│                           │                                    │
│                           ├─► [ACTIVE] (rules apply daily)     │
│                           │                                    │
│                           └─► [MUTATED] (operador reschedules) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
              (Operador remarcas session)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                       MUTATED STATE                            │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ cco.atendimentos:                                      │   │
│   │   - abc123 (old, orphaned_at=now())                   │   │
│   │   - def456 (new, current)                             │   │
│   │                                                        │   │
│   │ cco.session_mutations:                                 │   │
│   │   - RESCHEDULE: abc123 → def456 (RECORDED!) ✅        │   │
│   │   - data_old, data_new, hora_old, hora_new           │   │
│   │                                                        │   │
│   │ cco.consolidation_log:                                 │   │
│   │   - Auths copied from abc123 to def456               │   │
│   │   - Old occurrences marked as "incorporated"         │   │
│   │                                                        │   │
│   │ Result: FULLY TRACEABLE ✅                            │   │
│   │                                                        │   │
│   └────────────────────────────────────────────────────────┘   │
│                           │                                    │
│                           ├─► [ACTIVE-NEW] (def456 active)     │
│                           │   Rules re-apply to new session    │
│                           │   History consolidated from old    │
│                           │                                    │
│                           └─► [COMPLETION]                    │
│                               (session happens, archived)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
              (Session completed or cancelled)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                    ARCHIVED STATE                              │
│   ┌────────────────────────────────────────────────────────┐   │
│   │ cco.atendimentos: (soft-deleted)                       │   │
│   │   - archived_at timestamp                              │   │
│   │   - moved to cco_archive schema (optional)             │   │
│   │                                                        │   │
│   │ cco.occurrences: (soft-deleted)                        │   │
│   │   - archived_at timestamp                              │   │
│   │   - all history preserved in archive                   │   │
│   │                                                        │   │
│   │ cco.session_mutations: (retained for audit trail)      │   │
│   │   - full history of changes                            │   │
│   │                                                        │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Retention: 90 days → 7-year legal archive (optional)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Risk Matrix

```
┌──────────────────────────────────────┬──────────┬──────────────┐
│ Risk                                 │ Current  │ w/ Solution  │
│                                      │ (Fase 1) │ (Fase 2-B)   │
├──────────────────────────────────────┼──────────┼──────────────┤
│ Orphaned sessions accumulate        │ 🔴 HIGH  │ 🟢 LOW       │
│ (no cleanup, forever)               │          │ (marked, aged)│
├──────────────────────────────────────┼──────────┼──────────────┤
│ Broken FK references                │ 🔴 HIGH  │ 🟢 LOW       │
│ (dashboard queries fail or inflate)  │          │ (soft-delete)│
├──────────────────────────────────────┼──────────┼──────────────┤
│ Lost history on remarcação          │ 🔴 HIGH  │ 🟢 LOW       │
│ (authorization consolidation fails)  │          │ (auto-copy)  │
├──────────────────────────────────────┼──────────┼──────────────┤
│ Untraced session mutations          │ 🔴 HIGH  │ 🟢 LOW       │
│ (no way to connect abc123→def456)   │          │ (mutations   │
│                                      │          │  table)      │
├──────────────────────────────────────┼──────────┼──────────────┤
│ Duplicated session versions         │ 🟡 MEDIUM│ 🟢 LOW       │
│ (same TITA ID with 2+ session_keys) │          │ (chain id)   │
├──────────────────────────────────────┼──────────┼──────────────┤
│ Dashboard count inflation           │ 🟡 MEDIUM│ 🟢 LOW       │
│ (counts orphans as active)          │          │ (filter)     │
├──────────────────────────────────────┼──────────┼──────────────┤
│ Unresolved occurrences aging        │ 🟢 LOW   │ 🟢 LOW       │
│ (retention already works)            │          │ (improved)   │
└──────────────────────────────────────┴──────────┴──────────────┘

Current Risk Score (Fase 1-2): 🔴 CRITICAL
  - 3 HIGH risks
  - 2 MEDIUM risks
  - Data corruption after 6 months
  - Dashboard unreliable
  - Audit trail broken

With Proposed Solution (Fase 2-B+3): 🟢 LOW
  - 0 HIGH risks (all mitigated)
  - 0 MEDIUM risks (all addressed)
  - Full auditability
  - Dashboard reliable
  - 100% traceable mutations
```

---

## 10. Implementation Timeline

```
PHASE TIMING

Fase 1 (DONE): Schema ✅
├─ cco schema created
├─ 6 tables initialized
└─ No mutations tracking (not needed yet)

Fase 2 (CURRENT): Sync Jobs ✅
├─ Job 1-4 implemented (idempotent)
├─ No mutation detection (PROBLEM)
└─ No history consolidation (RISK)

Fase 2-B (PROPOSED): Mutation Tracking 🔧
├─ Add cco.session_mutations table
├─ Detect remarcações in Job 1
├─ Mark orphans (orphaned_at)
├─ Cost: 2 weeks, ~200 lines code
└─ Risk mitigation: 80%

Fase 3 (CURRENT): Conciliation Engine ⏳
├─ 7 business rules
├─ Generate occurrences (idempotent via fingerprint)
├─ ENHANCEMENT: Consolidate history
│  (copy auths from old→new session)
└─ Risk mitigation: +15%

Fase 3-B (PROPOSED): Cleanup Job 🧹
├─ Soft-delete orphaned sessions
├─ Archive historical data
├─ Hard-delete after retention period
└─ Risk mitigation: +5%

Fase 4 (FUTURE): APIs ✅
├─ Read cco.* tables
├─ (no writes via API)

Fase 5 (FUTURE): Frontend 📊
├─ Dashboard with filtered counts
└─ Audit trail viewer

═════════════════════════════════════════════════════════════════════
CRITICAL PATH: Do Fase 2-B BEFORE Fase 3
(Otherwise Fase 3 engine will process corrupted data)
═════════════════════════════════════════════════════════════════════
```

---

**Fim do Diagrama Visual**

> Este documento deve ser apresentado em reunião com stakeholders para aprovação antes de iniciar Fase 2-B.
