# Resumo Executivo: Problema de Sessões Mutantes

**Data**: 2026-06-08  
**Severidade**: 🔴 **CRÍTICO**  
**Status**: Descoberto durante revisão de arquitetura CCO  
**Impacto**: Integridade referencial em risco, perda de auditoria potencial

---

## O Que é o Problema?

Quando um operador **remarca uma sessão** em TITA (ex: "Mudar de 08/06 14:00 para 09/06 14:00"), a chave de conciliação `session_key` muda:

- **Antes**: `session_key = sha256("joao silva" || "2026-06-08" || "14:00") = abc123`
- **Depois**: `session_key = sha256("joao silva" || "2026-06-09" || "14:00") = def456`

**Problema**: O sistema não rastreia essa mudança. Resultado:

- ❌ Sessão antiga (abc123) fica órfã em `cco.atendimentos`
- ❌ Ocorrências apontam para `session_key` que desapareceu
- ❌ Histórico de autorizações perdido
- ❌ FK constraint violation (se ON DELETE RESTRICT)

---

## Cenário Real Completo

```
T0 (10:00): Operador cria sessão em TITA
            João Silva, 2026-06-08, 14:00 (ID=1234)
            → cco.atendimentos.session_key = abc123

T1 (13:05): Job 1 sincroniza
            → INSERT cco.atendimentos(abc123)

T2 (13:10): Engine cria ocorrência
            → INSERT cco.occurrences(session_key=abc123, tipo=AUTORIZACAO_PENDENTE)

T3 (13:50): 🚨 Operador remarca em TITA
            João Silva, 2026-06-09, 14:00 (ID=1234 MESMO)
            → TITA interna: ID=1234 agora aponta para data diferente

T4 (14:05): Job 1 sincroniza novamente
            CSV de TITA retorna: João Silva, 2026-06-09, 14:00
            → UPSERT com session_key=def456 (chave DIFERENTE)
            → ❌ abc123 fica orfão (não está mais em TITA)

RESULTADO:
  cco.atendimentos:
    - abc123 (órfão, sem motivo para existir)
    - def456 (nova sessão, sem histórico)
  
  cco.occurrences:
    - AUTORIZACAO_PENDENTE.session_key=abc123 (FK quebrada!)
    
  Dashboard:
    - Conta ambas? Ou apenas def456? (INCONSISTÊNCIA)
```

---

## Taxa de Ocorrência

| Métrica | Estimativa | Base |
|---|---|---|
| % Remarcações/dia | 5-8% | Padrão comportamental de clínicas |
| % Deletações/dia | 1-2% | Cancelamentos + erros operacionais |
| Sessões/dia | 200-400 | Escala PULSAR |
| **Órfãos/mês** | **450-675** | 0.06 × 300 × 25 × 1.5 ocorrências |
| **Órfãos/6 meses** | **2.7K-4K** | Acumula sem limpeza |

---

## Impactos

### 1. Integridade Referencial (🔴 CRÍTICO)

**Cenário**: Ocorrência aponta para `session_key` que não existe mais

```sql
-- Tentativa de listar ocorrências ativas:
SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL;
-- Retorna: 1000 (inflado, inclui órfãs)

-- Tentativa com JOIN:
SELECT COUNT(*) FROM cco.occurrences o
JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE o.resolved_at IS NULL;
-- Retorna: 950 (reduzido, exclui órfãs)
-- INCONSISTÊNCIA! Qual é o número correto?
```

**FK Constraint Atual**: `ON DELETE RESTRICT`

- Se tenta `DELETE FROM cco.atendimentos WHERE session_key='abc123'` **enquanto há ocorrências**
- Operação **FALHA** com FK constraint violation
- Ocorrências ficam **presas forever** (nunca podem ser deletadas)

### 2. Perda de Histórico de Autorização (🟠 ALTO)

Uma sessão foi autorizada em ASSIM para a data original (2026-06-08).
Operador remarca para 2026-06-09.

**Problema**:

- Autorização em `cco.session_authorizations` aponta para `session_key=abc123`
- Nova sessão tem `session_key=def456`
- **Nenhum mecanismo copia a autorização** para a nova sessão
- Resultado: `def456` começa sem autorização (perde contexto)

### 3. Duplicidade de Versões (🟡 MÉDIO)

Se operador cancela a remarcação durante transição:

```
TITA (em transição):
  ├─ João Silva, 2026-06-08 14:00 (versão antiga ainda visível)
  └─ João Silva, 2026-06-08 15:00 (nova versão)

Job 1 insere AMBAS:
  cco.atendimentos:
    ├─ session_key=abc123
    └─ session_key=abc124

Se operador cancela:
  TITA volta a ter só 2026-06-08 14:00
  Job 1 atualiza abc123 (idempotente)
  Mas abc124 NÃO é deletada
  → Fica 2 sessions para "mesma" sessão lógica
```

### 4. Dashboard Não-Confiável (🟡 MÉDIO)

```sql
-- Dashboard snapshot pré-calculado:
SELECT 
  autorizacoes_pendentes,
  sessoes_sem_autorizacao
FROM cco.dashboard_snapshot
WHERE data_ref = CURRENT_DATE;

-- Problema: Count estava inflado?
-- Foram deletadas ocorrências órfãs durante o cálculo?
-- Qual é a métrica de "receita em risco"?

-- Resultado: NÚMEROS INCONSISTENTES ao longo do tempo
```

---

## Por Que Acontece?

### Design Atual (Fase 1-2)

```
cco.atendimentos tem:
├─ session_key (TEXT, UNIQUE)        ← Chave de conciliação
│  Derivada: sha256(nome || data || hora)
│  PROBLEMA: Muda quando data/hora mudam
│
└─ tita_agendamento_id (BIGINT)      ← ID de TITA
   PROBLEMA: Não é usada como chave
              Não tem index UNIQUE
              Apenas armazenado, não utilizado para rastreamento
```

**Fluxo de sincronização**:

1. Job 1 recebe CSV de TITA
2. Computa `session_key` baseado em nome+data+hora
3. UPSERT por `session_key`
4. **Nunca detecta que tita_agendamento_id mudou** de versão

**Resultado**: Remarcação não rastreada, órfãos acumulam.

---

## Solução Proposta

### Três Componentes

#### 1️⃣ **Change Log Table** (New)

```sql
CREATE TABLE cco.session_mutations (
  tita_agendamento_id bigint,
  session_key_before text,    -- abc123 (old)
  session_key_after text,     -- def456 (new)
  mutation_type text,         -- 'reschedule', 'cancellation', etc
  data_old date,
  data_new date,
  hora_old time,
  hora_new time,
  mutation_at timestamptz,
  detected_by text            -- 'job-1-tita'
);
```

**Benefício**: Rastreia abc123 → def456 (auditoria completa)

#### 2️⃣ **Soft Delete** (New Column)

```sql
ALTER TABLE cco.atendimentos ADD COLUMN orphaned_at timestamptz;
ALTER TABLE cco.occurrences ADD COLUMN orphaned_at timestamptz;
```

**Workflow**:

1. Detectar que `session_key=abc123` desapareceu de TITA
2. `UPDATE cco.atendimentos SET orphaned_at=now() WHERE session_key='abc123'`
3. Esconder de queries: `WHERE orphaned_at IS NULL`
4. Aguardar 30 dias
5. Depois: Hard-delete para arquivo histórico

#### 3️⃣ **History Consolidation** (Engine Enhancement)

Quando detecta mutação (abc123 → def456):

1. Buscar autorizações de abc123
2. Copiar para def456 (com marca `copied_from_session_key`)
3. Garantir def456 herda contexto de abc123

---

## Estimativa de Esforço

| Componente | Esforço | Complexidade |
|---|---|---|
| 1. Criar tabela `session_mutations` | 1-2h | 🟢 Baixa |
| 2. Modificar Job 1 para detectar mudanças | 4-6h | 🟡 Média |
| 3. Adicionar colunas soft-delete | 1-2h | 🟢 Baixa |
| 4. Implementar consolidação no Engine | 6-8h | 🟡 Média |
| 5. Criar cleanup job (retenção 3-tier) | 4-6h | 🟡 Média |
| 6. Testes e validação | 6-8h | 🟡 Média |
| **TOTAL** | **22-32h** | **Sprint: 1 semana** |

---

## Recomendações

### 🔴 Crítico: Implementar ANTES de Fase 3 (Engine)

**Motivo**: Fase 3 rodará 7 regras de conciliação. Se dados estão corrompidos (orphans), será lixo dentro de lixo.

**Timeline**:

- ✅ Fase 1 (Schema): COMPLETO
- ✅ Fase 2 (Sync Jobs): COMPLETO
- 🔧 **Fase 2-B (Mutation Tracking): CRÍTICO — 1-2 semanas**
- ⏳ Fase 3 (Engine): Após 2-B estar stable

### 🟡 Mitigação Imediata (sem código)

Enquanto código está em desenvolvimento:

```sql
-- Query para identificar órfãos (executar diariamente):
SELECT session_key, COUNT(*) as occurrences
FROM cco.occurrences o
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a 
  WHERE a.session_key = o.session_key
);

-- Se achar resultados: investigar via Job 1 logs
-- Correlacionar timestamps com remarcações em TITA
```

### 🟢 Longo Prazo

- Implementar `cco_archive` schema para dados > 90 dias
- Dashboard: sempre usar `WHERE orphaned_at IS NULL`
- Alertas: se > 10 órfãs detectados num dia → investigar

---

## Approval

**Stakeholders**:

- [ ] Tech Lead: Aprova incluir Fase 2-B no roadmap?
- [ ] Product: Impacta SLA de remarcações? (Não, é backend)
- [ ] QA: Pode começar testes após código?
- [ ] DevOps: Pode fazer deploy após Fase 2?

**Próximo Passo**: Kick-off meeting para Fase 2-B (design review de código).

---

## Documentação Adicional

Ver arquivos complementares:

- **`ANALISE_SESSOES_MUTANTES.md`** — Análise completa com SQL concreto
- **`SESSOES_MUTANTES_DIAGNOSTICO.sql`** — Queries de validação e cleanup
- **`SESSOES_MUTANTES_DIAGRAMA.md`** — Fluxos visuais e state machines

---

**Preparado por**: Data Warehouse Review Team  
**Data**: 2026-06-08  
**Confidencialidade**: Interno — Tecnologia
