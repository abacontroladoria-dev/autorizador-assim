# Próximos Passos Imediatos

**Data**: 2026-06-08  
**Urgência**: 🔴 **ALTA** (Bloqueador para Fase 3)  
**Responsável**: Tech Lead + Data Warehouse Team

---

## 🎯 Ações para as Próximas 24-48 Horas

### 1️⃣ Comunicação com Stakeholders (2h)

**Objetivo**: Aprovar inclusão de Fase 2-B no roadmap

**Destinatários**:
- [ ] Tech Lead (aprovação de escopo)
- [ ] Product Manager (impacto em timeline)
- [ ] QA Lead (recursos para testes)
- [ ] DevOps (deployment preparado)

**Mensagem Padrão**:
```
Assunto: CRÍTICO - Descoberto problema de integridade em CCO 
         (bloqueador para Fase 3)

Contexto:
- Revisão de arquitetura CCO identificou risco crítico
- Quando operador remarca sessão em TITA, chave de conciliação muda
- Sistema atual não rastreia essa mudança
- Resultado: Ocorrências órfãs, FK quebrada, história perdida

Impacto:
- Fase 3 (Engine) será executado sobre dados corrompidos se não mitigarmos
- ~5-8% de sessões remarcadas/dia → 450-675 órfãos/mês
- Em 6 meses: ~4K registros órfãos acumulados

Solução Proposta:
- Fase 2-B (1-2 semanas): Adicionar mutation tracking
- Custo: ~40 horas de desenvolvimento
- Benefício: 100% rastreabilidade, zero orphans, auditoria completa

Próximo Passo:
- Kick-off meeting segunda-feira 10h
- Design review de código
- Aprovação final de escopo

Documentação:
- ANALISE_SESSOES_MUTANTES.md (completa, 50+ páginas)
- SESSOES_MUTANTES_RESUMO_EXECUTIVO.md (2 páginas)
- SESSOES_MUTANTES_DIAGRAMA.md (fluxos visuais)
```

**Entregáveis para apresentação**:
- [ ] Resumo Executivo (2 páginas)
- [ ] Timeline (1 semana, 40h)
- [ ] Exemplos de dados corrompidos (queries)
- [ ] ROI (custo vs risco de não fazer)

---

### 2️⃣ Kick-Off Meeting (2h)

**Agenda**:

```
🕐 10:00 - 10:10: Context
  └─ Problema visualizado
  └─ Cenários críticos

🕐 10:10 - 10:25: Deep Dive (15 min)
  ├─ Demo: Current orphan state (SQL query)
  ├─ Demo: FK constraint violation (quando happens)
  └─ Demo: History loss (authorization consolidation missing)

🕐 10:25 - 10:40: Proposed Solution (15 min)
  ├─ Change Log Table
  ├─ Soft Delete Strategy
  └─ History Consolidation in Engine

🕐 10:40 - 10:50: Timeline & Effort (10 min)
  ├─ 3 sprints: 1-2 weeks
  ├─ 40 hours total
  └─ Blockeador para Fase 3

🕐 10:50 - 11:00: Q&A & Decisions
  ├─ Approval to proceed?
  ├─ Resource allocation?
  └─ Start date?
```

**Deck Points**:
1. **The Problem**: Visual diagram (cenário crítico)
2. **The Impact**: % de dados afetados, timeline de acúmulo
3. **The Solution**: 3 tabelas novas, mutation tracking, consolidation
4. **The Timeline**: Sprint breakdown, 40 hours
5. **The Approval**: Decision requested

---

### 3️⃣ Risk Assessment Document (1h)

**Criar** `SESSOES_MUTANTES_RISK_ASSESSMENT.md`:

```markdown
# Risk Assessment: Não Implementar Fase 2-B

## Cenários de Risco

### Risk 1: Data Corruption (6 meses)
- Probabilidade: 100% (vai acontecer)
- Impacto: 4K+ orphan records
- Remediação: Manual audit + cleanup (10-20h labor)
- Custo: $500-1000 + downtime

### Risk 2: Dashboard Unreliability
- Probabilidade: 80% (queries com JOIN vs sem)
- Impacto: C-Suite vê contagens diferentes
- Remediação: Recalculate todos snapshots (4h labor)
- Custo: $200 + reputação

### Risk 3: FK Constraint Blocking Production
- Probabilidade: 20% (durante cleanup)
- Impacto: Cannot delete orphans, tables grow forever
- Remediação: Manual DB intervention (2-4h downtime)
- Custo: $1000+ (emergency support)

### Risk 4: Audit Trail Loss
- Probabilidade: 100% (se not documented)
- Impacto: Cannot prove what happened to sessions
- Remediação: Impossible (data already lost)
- Custo: Regulatory risk

## Cost-Benefit Analysis

Não fazer (status quo):
- Development cost: $0
- Risk cost (6 months): $2K-3K (incident management + labor)
- Reputational cost: Medium
- Total: $2K-3K + risk

Fazer (Fase 2-B):
- Development cost: $2K (40h × $50/h)
- Risk cost: $0 (mitigated)
- Reputational cost: None
- Benefit: 100% auditability for future
- Total: $2K (one-time)

**Recommendation**: **FAZER AGORA** (1-time cost vs ongoing risk)
```

---

### 4️⃣ Data Audit (3-4h)

**Executar queries de diagnóstico** enquanto sistema está em produção:

```bash
# Run on production DB (READ-ONLY)
psql -h <prod-db> -U readonly -d postgres -f SESSOES_MUTANTES_DIAGNOSTICO.sql

# Output: Save to CSV for analysis
psql ... > orphan_audit_2026-06-08.csv
```

**Analisar resultados**:
- [ ] Quantos órfãos existem AGORA?
- [ ] Quantas remarcações foram detectadas?
- [ ] Dashboard inconsistency está ocorrendo?

**Usar para**:
- Justificar urgência (% real de dados afetados)
- Baseline para comparação pós-implementação
- Identificar sessions específicas para investigate

---

### 5️⃣ Design Review Prep (2h)

**Preparar código antes de coding**:

**Tarefa 1**: Review migration DDL

```bash
# Create draft migration file
touch supabase/migrations/20260610000001_cco_mutations_tracking.sql

# Use template from ROADMAP_IMPLEMENTACAO.md
# Have Tech Lead review before applying
```

**Tarefa 2**: Outline Job 1 changes

```bash
# Create feature branch
git checkout -b feature/cco-mutations-tracking

# Create TODO file with function signatures
cat > TODO_JOB1_MUTATIONS.md << 'EOF'
## Job 1 Enhancement Tasks

- [ ] detectMutations(currentSessions, previousState) → SessionMutation[]
  └─ Logic: Compare previous state with current CSV
  └─ Output: Array of detected changes

- [ ] markOrphans(previousState, currentSessions) → int
  └─ Logic: Find sessions that disappeared from TITA
  └─ Output: Count of marked orphans

- [ ] getPreviousSyncState() → Map<tita_id, SessionState>
  └─ Logic: Load last 7 days of sessions from DB
  └─ Output: Previous state snapshot

- [ ] insertMutations(mutations) → void
  └─ Logic: Log mutations to cco.session_mutations table
  └─ Handle: Idempotency (UNIQUE constraint)
EOF
```

**Tarefa 3**: Outline Engine changes

```bash
# Create design doc
cat > DESIGN_ENGINE_CONSOLIDATION.md << 'EOF'
## Engine Consolidation Logic

When mutation detected (abc123 → def456):

1. Find authorizations from abc123
   ```
   SELECT * FROM cco.session_authorizations
   WHERE session_key='abc123'
   ```

2. For each auth, check if def456 already has it
   ```
   SELECT * FROM cco.session_authorizations
   WHERE session_key='def456' AND source=?
   ```

3. If not, copy with tracking
   ```
   INSERT INTO cco.session_authorizations (
     session_key=def456,
     copied_from_session_key=abc123,
     copied_at=now(),
     ... (other columns from abc123 auth)
   )
   ```

4. Log consolidation
   ```
   INSERT INTO cco.consolidation_log (
     source=abc123,
     target=def456,
     records_copied=1
   )
   ```

Performance: O(n) where n=# of old auths (typically 1-2 per session)
Idempotency: UNIQUE (session_key, source) prevents duplicates
Error handling: Non-blocking (continue if one auth fails)
EOF
```

---

## 🚀 Ações para Semana de 10-14 de Junho

### Sprint 1 (Seg-Ter): Schema Foundation

**Segunda (10/06)**:
- [ ] Kick-off meeting (10:00)
- [ ] Data audit results discussed
- [ ] Final approval on scope
- [ ] Developer assignment
- [ ] Start migration DDL development

**Terça (11/06)**:
- [ ] Migration DDL completed
- [ ] Code review on DDL
- [ ] Test migration on staging DB
- [ ] Begin Job 1 enhancement

### Sprint 2 (Qua-Qui): Job 1 & Engine

**Quarta (12/06)**:
- [ ] Job 1 mutation detection complete
- [ ] Unit tests passing
- [ ] Integration test setup

**Quinta (13/06)**:
- [ ] Engine consolidation logic complete
- [ ] Full integration test running
- [ ] Retention job basic implementation

### Sprint 3 (Sex): Testing & Staging

**Sexta (14/06)**:
- [ ] All code reviewed
- [ ] Staging deployment
- [ ] Full test cycle
- [ ] Readiness for production deployment

---

## 📋 Decision Gates

### Gate 1: Approval to Proceed (TODAY)
```
[ ] Tech Lead: Aprova incluir na roadmap?
[ ] Product: Ok com timeline?
[ ] QA: Tem recursos?
[ ] DevOps: Deployment preparado?
```

### Gate 2: Code Review Complete (12/06)
```
[ ] Migration DDL reviewed
[ ] Job 1 mutations logic reviewed
[ ] Engine consolidation reviewed
[ ] All tests passing
```

### Gate 3: Staging Validation (14/06)
```
[ ] Full integration test successful
[ ] Performance acceptable (< 30s per job)
[ ] No data corruption
[ ] Logs complete
```

### Gate 4: Go-Live Approval (15/06)
```
[ ] Staging sign-off
[ ] Backup tested
[ ] Rollback plan ready
[ ] Alert configured
[ ] Team trained
```

---

## 🔧 Mitigação Imediata (Enquanto Código em Dev)

**Para reduzir risco durante desenvolvimento**:

### Ação 1: Daily Orphan Monitoring

```sql
-- Executar DIARIAMENTE enquanto aguarda Fase 2-B
SELECT 
  COUNT(*) as orphaned_occurrences,
  MAX(created_at) as most_recent,
  'CRITICAL' as severity
FROM cco.occurrences o
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a 
  WHERE a.session_key = o.session_key
);

-- Se > 50: Alert team
```

### Ação 2: Weekly Audit Report

```bash
#!/bin/bash
# Run weekly (fridays 17:00)
psql -f SESSOES_MUTANTES_DIAGNOSTICO.sql > report_$(date +%Y-%m-%d).csv

# Email to: tech-lead@universo, dw-team@universo
# Attach: report_*.csv
```

### Ação 3: Manual Cleanup (Last Resort)

Se muitos órfãos acumularem antes de Fase 2-B:

```sql
-- MANUAL CLEANUP (executor com cuidado!)
-- 1. Backup antes
-- 2. Test em staging
-- 3. Executar apenas se orphaned_count > 500

BEGIN;

-- Identify orphans
CREATE TEMPORARY TABLE orphans_to_clean AS
SELECT o.session_key, COUNT(*) as occ_count
FROM cco.occurrences o
LEFT JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE a.session_key IS NULL
GROUP BY o.session_key;

-- Delete occurrences (or mark as resolved)
DELETE FROM cco.occurrences
WHERE session_key IN (SELECT session_key FROM orphans_to_clean);

-- Delete sessions
DELETE FROM cco.atendimentos
WHERE session_key IN (SELECT session_key FROM orphans_to_clean);

-- Log action
INSERT INTO cco.retention_audit 
VALUES (
  uuid_generate_v4(),
  (SELECT COUNT(*) FROM orphans_to_clean),
  'occurrences + sessions',
  'MANUAL cleanup (emergency)',
  now()
);

COMMIT;
```

⚠️ **WARNING**: Only for emergency! Prefer Fase 2-B solution.

---

## 📞 Escalation Path

Se houver bloqueadores:

**Level 1** (Developer): Tech Lead
**Level 2** (Tech): CTO / Architecture Lead
**Level 3** (Business): Product Lead
**Level 4** (Urgent)**: VP Engineering

---

## ✅ Final Checklist

**Antes de começar coding**:
- [ ] Stakeholder approval received (email)
- [ ] Data audit completed (CSV results)
- [ ] Risk assessment documented
- [ ] Kick-off meeting done
- [ ] Design reviewed (migration + functions)
- [ ] Staging DB ready
- [ ] Team trained on problem/solution
- [ ] Definition of Done criado

**Antes de staging deployment**:
- [ ] All unit tests passing (100%)
- [ ] Integration test successful
- [ ] Code reviewed + approved
- [ ] Performance tested (< 30s per job)
- [ ] Security review done (if needed)

**Antes de production**:
- [ ] Staging sign-off
- [ ] Backup tested
- [ ] Rollback plan executed (dry-run)
- [ ] Team on-call prepared
- [ ] Alert monitoring configured
- [ ] Communication plan ready (status updates)

---

## 📊 Success Criteria

**After Fase 2-B is live**:

```
✅ 0 orphaned occurrences
✅ 0 broken FK references
✅ 100% mutation detection rate
✅ 100% history consolidation rate
✅ Dashboard counts consistent
✅ All jobs run < 30s
✅ Retention working (deletes 30+ day orphans)
✅ Audit trail complete (cco.session_mutations populated)
```

---

**Document Owner**: Tech Lead  
**Last Updated**: 2026-06-08  
**Next Review**: After Kick-Off Meeting  
**Distribution**: Tech Team + Product + QA + DevOps

