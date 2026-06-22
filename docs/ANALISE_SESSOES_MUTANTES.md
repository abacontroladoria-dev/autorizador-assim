# Análise Crítica: Sessões Mutantes no Schema CCO

**Data da Análise**: 2026-06-08  
**Revisor**: Data Warehouse Architect  
**Status**: ⚠️ CRÍTICO — Descoberto risco de integridade referencial e perda de auditoria  
**Severidade**: HIGH

---

## SUMÁRIO EXECUTIVO

O design atual de `cco.atendimentos` usa `session_key` como chave determinística baseada em **paciente + data + hora**. Isso cria um **problema fundamental de rastreabilidade** quando sessões são remarcadas em TITA:

### O Problema em Uma Frase

**Quando um operador remarca uma sessão em TITA, a chave de conciliação muda, criando uma "nova" sessão com zero histórico, enquanto a sessão anterior fica órfã com ocorrências que apontam para um `session_key` que não existe mais.**

### Impactos Imediatos

1. **FK Constraint Violation** — Ocorrências antigas apontam para `session_key` deletado
2. **Perda de Histórico de Autorização** — Nova sessão começa do zero
3. **Duplicidade em Transições** — Até 2 `session_key` para mesma sessão durante remarcação
4. **Reprocessamento Inseguro** — Reprocessar histórico de TITA cria multiplicidade de versões

### Risco Quantificado

- **% de sessões remarcadas/mês**: ~5-8% (baseado em padrões comportamentais típicos)
- **% de sessões deletadas**: ~1-2% (cancelamentos e erros operacionais)
- **Ocorrências órfãs por mês**: ~150-250 registros (se não mitigado)

---

## ANÁLISE DETALHADA

### 1. Como o Cenário Crítico Ocorre

#### Cenário A: Remarcação Simples (MAIS COMUM)

```
Timeline Temporal:
┌─────────────────────────────────────────────────────────────────┐
│ T0: 2026-06-08 10:00 - Operador cria sessão em TITA             │
│   Input: João Silva, 2026-06-08, 14:00                          │
│   TITA ID: 1234 (tita_agendamento_id)                            │
│   session_key_OLD = sha256("joao silva" || "2026-06-08" ||      │
│                             "14:00") = abc123                   │
├─────────────────────────────────────────────────────────────────┤
│ T1: 2026-06-08 13:05 - Job 1 (cco-sync-tita-sessions) executa   │
│   Result: INSERT into cco.atendimentos(session_key=abc123, ...)  │
│   New Row: [id=uuid1, session_key=abc123, data_sessao=          │
│             2026-06-08, hora_inicio=14:00, ...]                │
├─────────────────────────────────────────────────────────────────┤
│ T2: 2026-06-08 13:10 - Engine (Fase 3) executa primeira vez     │
│   Detecta: AUTORIZACAO_PENDENTE em abc123                       │
│   Result: INSERT into cco.occurrences(                          │
│     session_key=abc123,                                         │
│     tipo='AUTORIZACAO_PENDENTE',                                │
│     fingerprint='abc123::AUTORIZACAO_PENDENTE::2026-06-08',     │
│     ...)                                                        │
├─────────────────────────────────────────────────────────────────┤
│ T3: 2026-06-08 13:50 - Operador remarca em TITA UI              │
│   Action: Clica "Remarcar" na sessão 1234                       │
│   New Input: João Silva, 2026-06-09, 14:00                      │
│   TITA ID: 1234 (MESMO ID, MESMA SESSÃO CONCEITUALMENTE)       │
│   session_key_NEW = sha256("joao silva" || "2026-06-09" ||      │
│                             "14:00") = def456  ← CHAVE DIFERENTE│
├─────────────────────────────────────────────────────────────────┤
│ T4: 2026-06-08 14:05 - Job 1 executa novamente (staggered 5m)   │
│   TITA API retorna CSV ATUALIZADO:                              │
│   - REMOVE: João Silva, 2026-06-08, 14:00 (sessão antiga)       │
│   - INCLUDE: João Silva, 2026-06-09, 14:00 (sessão nova)        │
│                                                                 │
│   Job 1 UPSERT:                                                 │
│   1. Processa nova linha → session_key_NEW = def456             │
│      Result: UPSERT cco.atendimentos(session_key=def456, ...)   │
│      INSERT ou UPDATE, mas def456 é NOVO                        │
│                                                                 │
│   2. session_key_OLD (abc123) NÃO está no CSV                   │
│      Result: SEM ação (job não deleta, apenas insere/atualiza)  │
│      → abc123 fica ÓRFÃO em cco.atendimentos                   │
├─────────────────────────────────────────────────────────────────┤
│ T5: 2026-06-08 14:10 - Engine executa segunda vez               │
│   Tenta processar novo def456:                                  │
│   1. Busca SELECT * FROM cco.session_authorizations              │
│      WHERE session_key='def456'                                 │
│      Result: ZERO (nova sessão ainda não tem autorizações)      │
│                                                                 │
│   2. Tenta buscar ocorrências antigas:                          │
│      SELECT * FROM cco.occurrences                             │
│      WHERE session_key='abc123'                                │
│      Result: 1 ocorrência (AUTORIZACAO_PENDENTE de T2)         │
│      Problem: abc123 não existe mais em cco.atendimentos        │
│               FK CONSTRAINT VIOLATION (se ON DELETE RESTRICT)   │
│                                                                 │
│   3. Se tentasse atualizar ocorrência abc123:                   │
│      UPDATE cco.occurrences SET resolved_at=now()               │
│      WHERE session_key='abc123'                                 │
│      Problem: Ocorrência da sessão antiga seria deletada,       │
│               perdendo auditoria (se ON DELETE CASCADE)         │
└─────────────────────────────────────────────────────────────────┘

Estados Resultantes:
┌──────────────────────────────────┬──────────┬─────────────────────┐
│ Tabela                           │ Registro │ Status              │
├──────────────────────────────────┼──────────┼─────────────────────┤
│ cco.atendimentos                 │ abc123   │ ÓRFÃO (sem motivo)  │
│ cco.atendimentos                 │ def456   │ OK (novo)           │
│ cco.occurrences                  │ fk(abc) │ REFERÊNCIA MORTA    │
│ cco.session_authorizations       │ nenhum   │ Ambos vazios         │
└──────────────────────────────────┴──────────┴─────────────────────┘
```

#### Cenário B: Deleção de Sessão (PERDA IRREVERSÍVEL)

```
T0: Operador cria sessão em TITA → session_key=abc123
T1: Engine cria 3 ocorrências com fingerprints xyz, xyz2, xyz3
T2: Operador deleta sessão em TITA (clica "Deletar")
T3: Job 1 roda → CSV não contém essa sessão → Nenhuma ação
    Result: abc123 permanece em cco.atendimentos (órfão)
T4: Próximo reprocessamento ou limpeza manual de orphans:
    DELETE FROM cco.atendimentos WHERE session_key='abc123'
    ↓
    Se FK é ON DELETE CASCADE:
      → Deleta automaticamente as 3 ocorrências (perde auditoria)
    Se FK é ON DELETE RESTRICT:
      → DELETE falha, abc123 fica preso (pode ser nunca deletado)
    Se FK é ABSENT (não existe):
      → Ocorrências ficam órfãs (fantasmas no dashboard)
```

#### Cenário C: Remarcação para Mesma Data, Hora Diferente (TRANSIÇÃO SIMULTÂNEA)

```
T0: João Silva, 2026-06-08 14:00 → session_key='abc123' em TITA
T1: Operador remarca em TITA → João Silva, 2026-06-08 15:00
    → session_key='abc124' (hora diferente, mesma data)
T2: Durante transição, TITA API pode retornar AMBAS as versões:
    - João Silva, 2026-06-08 14:00 (versão antiga ainda visível)
    - João Silva, 2026-06-08 15:00 (versão nova)
T3: Job 1 processa CSV → Insere AMBAS: abc123 E abc124
    Result: 2 rows em cco.atendimentos para "mesma sessão lógica"
T4: Engine trata como 2 sessões distintas
    Result: 2 sets de ocorrências (duplicidade de contexto)
T5: Operador cancela remarcação em TITA
    → Voltamos para João Silva, 2026-06-08 14:00
T6: Job 1 roda novamente → TITA retorna apenas abc123
    UPSERT: Atualiza abc123, mas NÃO deleta abc124
    Result: Fica com 2 session_keys (órfã + inativo)
```

---

### 2. Estado Atual do Schema CCO

#### Constraint de FK em cco.atendimentos

```sql
-- Atual (de FASE_1_CCO_VALIDATION.md):
CREATE TABLE cco.session_authorizations (
  id uuid PRIMARY KEY,
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  ...
);

CREATE TABLE cco.occurrences (
  id uuid PRIMARY KEY,
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  ...
);

CREATE TABLE cco.session_substitutions (
  id uuid PRIMARY KEY,
  session_key text NOT NULL REFERENCES cco.atendimentos(session_key) ON DELETE RESTRICT,
  ...
);
```

**Problema**: Constraint `ON DELETE RESTRICT` significa:

- Se você tenta `DELETE FROM cco.atendimentos WHERE session_key='abc123'` e existem ocorrências com `session_key='abc123'`
- **A operação FALHA** com erro de constraint
- **abc123 fica preso** — nunca pode ser deletado sem deletar manualmente as ocorrências
- **Acumula orphans** — tabela cresce indefinidamente com "lixo"

---

### 3. Quantificação do Risco

#### Taxa de Remarcações (Estimativa)

Baseado em padrões operacionais de clínicas:

- **Remarcações diárias**: ~5-8% das sessões agendadas
- **Deletações**: ~1-2% (cancelamentos, erros)
- **Sessões por dia**: ~200-400 (baseado em escala de PULSAR)

**Cálculo**:

```
Remarcações/mês = 0.06 (avg) × 300 (sessões/dia) × 25 (dias úteis)
                = 450 remarcações/mês

Órfãos por mês = 450 (remarcações) × 1.5 (ocorrências/sessão avg)
               = 675 registros órfãos/mês

Sem mitigação, após 6 meses:
  675 × 6 = 4,050 registros órfãos acumulados
```

#### Impacto no Dashboard

Se FK é `RESTRICT` e ocorrência aponta para session_key deletado:

```sql
-- Dashboard tenta contar ocorrências ativas:
SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL;
-- Problema 1: Retorna número INFLADO (inclui órfãs)

-- Dashboard tenta jointar com sessions:
SELECT COUNT(*) FROM cco.occurrences o
JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE o.resolved_at IS NULL;
-- Problema 2: Retorna número REDUZIDO (exclui órfãs)
-- → Inconsistência de contagem!
```

---

### 4. Questões Críticas Respondidas

#### Q1: Como Detectar que abc123 foi Remarcado para def456?

**Resposta Atual**: ❌ **IMPOSSÍVEL COM DESIGN ATUAL**

O `tita_agendamento_id` (ID que TITA mantém) é o verdadeiro identificador único. Mas o schema usa `session_key` (derivado de nome+data+hora).

**Mapping Perdido**:

```sql
-- Schema atual:
cco.atendimentos(
  id uuid,
  session_key text UNIQUE,           -- Derivado: sha256(nome||data||hora)
  tita_agendamento_id bigint,        -- ID TITA real, mas NÃO é chave
  ...
)

-- Problema:
-- Se remarcamos tita_agendamento_id=1234 de 2026-06-08 14:00 
--   para 2026-06-09 14:00:
-- - TITA_ID 1234 continua o mesmo (TITA rastreia)
-- - session_key MUDA de abc123 para def456 (derivado muda)
-- - Nenhuma coluna conecta abc123 a def456 ou ambas a TITA_ID=1234

-- Tentativa de rastrear:
SELECT session_key, tita_agendamento_id 
FROM cco.atendimentos 
WHERE tita_agendamento_id = 1234;
-- Resultado: Apenas def456 (abc123 não tem mais tita_id)
--            ou ambas se não deletarmos (ver cenário C)
```

#### Q2: Como Consolidar Histórico de Autorização?

**Resposta**: 🚨 **ATUALMENTE NÃO EXISTE MECANISMO**

```sql
-- Ocorrência criada em T2:
INSERT INTO cco.occurrences 
VALUES (
  session_key='abc123',
  tipo='AUTORIZACAO_PENDENTE',
  created_at=2026-06-08 13:10,
  ...
);

-- Sessão remarcada em T4, nova chave=def456
-- Pergunta: A autorização de abc123 é VÁLIDA em def456?
-- Resposta: Schema não tem resposta

-- Modelo necessário:
-- 1. Versioning: abc123 (v1) → def456 (v2) com referência entre elas
-- 2. OU: Copiar autorizações de abc123 → def456 (auditoria de cópia)
-- 3. OU: Manter histórico em tabela separada (event sourcing)
```

#### Q3: Como Limpar Ocorrências Órfãs?

**Resposta**: ⚠️ **ATUAL CRIA TRILEMA**

```
Opção 1: ON DELETE RESTRICT (ATUAL)
├─ Benefício: Não deleta acidentalmente
└─ Problema: Ocorrência fica presa, nunca limpa
   SQL: DELETE FROM cco.occurrences WHERE session_key='abc123'
   Resultado: ERROR (FK constraint violated)

Opção 2: ON DELETE CASCADE
├─ Benefício: Cleanup automático
└─ Problema: Perde auditoria (foi o ponto de registrar!)
   SQL: DELETE FROM cco.atendimentos WHERE session_key='abc123'
   Resultado: Deleta automaticamente cco.occurrences com abc123
   Loss: Não sabe mais que AUTORIZACAO_PENDENTE ocorreu

Opção 3: SOFT DELETE (não implementado)
├─ Benefício: Auditoria preservada
└─ Problema: Requer nova coluna + lógica de filtro
   SQL: UPDATE cco.occurrences SET deleted_at=now() 
        WHERE session_key='abc123'
   Resultado: Ocorrência marca como deletada mas stays
```

#### Q4: O Dashboard Conta Ocorrências Órfãs?

**Resposta Atual**: ⚠️ **SIM, COM INCONSISTÊNCIA**

```sql
-- Snapshot (dashboard_snapshot) é pré-calculado:
-- Se usou COUNT sem JOIN:
SELECT COUNT(*) FROM cco.occurrences WHERE tipo='AUTORIZACAO_PENDENTE';
-- Resultado: INCLUI órfãs (abc123::AUTORIZACAO_PENDENTE mesmo se orphan)

-- Mas se Fase 3 (engine) fizer:
SELECT COUNT(*) FROM cco.occurrences o
JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE o.tipo='AUTORIZACAO_PENDENTE' AND o.resolved_at IS NULL;
-- Resultado: EXCLUI órfãs (abc123 não existe em cco.atendimentos)

-- Inconsistência: Dois snapshots diferentes!
```

#### Q5: Qual É o Modelo de Retenção?

**Resposta Atual**: ⚠️ **PARCIAL**

```sql
-- Implementado (FASE_1):
DELETE FROM cco.occurrences 
WHERE resolved_at IS NOT NULL 
  AND resolved_at < now() - interval '90 days'

-- Problema 1: Ocorrências órfãs (resolved_at=NULL) NUNCA são deletadas
-- Problema 2: Se operador não marca como "resolvida", ocorrência fica forever
-- Problema 3: Sessão remarcada deixa registros antigos acumulando

-- Modelo de retenção ideal seria:
DELETE FROM cco.occurrences 
WHERE (
  resolved_at IS NOT NULL 
  AND resolved_at < now() - interval '90 days'
) OR (
  created_at < now() - interval '90 days'
  AND tipo IN ('AUTORIZACAO_PENDENTE', 'EVOLUCAO_ATRASADA')  -- resolvem naturalmente
)
```

#### Q6: Reprocessamento com Mudança

**Resposta**: 🚨 **CRIA MULTIPLICIDADE INSEGURA**

```
Cenário: Reprocessar últimos 30 dias de TITA
├─ T0: TITA retorna histórico de 30 dias
├─ T1: Dentro desses 30 dias, sessão 1234 foi remarcada 3x
│      - 1234: João Silva, 2026-05-08 14:00 → session_key=abc1
│      - 1234: João Silva, 2026-05-15 14:00 → session_key=abc2
│      - 1234: João Silva, 2026-06-08 14:00 → session_key=abc3
├─ T2: Job 1 processa 30 dias → Insere/atualiza abc1, abc2, abc3
├─ T3: Agora cco.atendimentos tem 3 rows para mesma TITA_ID=1234
│      ├─ abc1 (data=2026-05-08) — ORPHAN (não está mais em TITA)
│      ├─ abc2 (data=2026-05-15) — ORPHAN (não está mais em TITA)
│      └─ abc3 (data=2026-06-08) — CURRENT (está em TITA)
└─ T4: Engine roda → 3 sets de ocorrências para "mesma sessão"
       Resultado: Dashboard mostra TRIPLICADO de AUTORIZACAO_PENDENTE

Pergunta: Quem é responsável por cleanup?
Resposta: ❌ Ninguém (não implementado em FASE 1-2)
```

---

## 5. Arquitetura de Rastreamento Proposta

### Solução Recomendada: HYBRID APPROACH

Combinar 3 técnicas para máxima segurança:

#### 5.1 Change Log Table (Nova Tabela)

```sql
-- NOVA TABELA: cco.session_mutations
-- Tracks remarcações, permuta de session_key, e mudanças de status

CREATE TABLE cco.session_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tita_agendamento_id bigint NOT NULL,
  session_key_before text,        -- Chave antiga (NULL se creation)
  session_key_after text NOT NULL, -- Chave nova
  mutation_type text NOT NULL CHECK (mutation_type IN (
    'creation',      -- Sessão criada
    'reschedule',    -- Data/hora mudou
    'substitution',  -- Profissional mudou
    'cancellation',  -- Deletada em TITA
    'reactivation'   -- Reativada após exclusão
  )),
  data_old date,                   -- Data anterior
  data_new date,                   -- Data nova
  hora_old time,                   -- Hora anterior
  hora_new time,                   -- Hora nova
  paciente_nome text NOT NULL,
  mutation_at timestamptz DEFAULT now(),
  detected_by text,                -- 'job-1-tita', 'manual', etc
  UNIQUE (tita_agendamento_id, mutation_at, mutation_type)
);

CREATE INDEX idx_mutations_tita_id 
  ON cco.session_mutations(tita_agendamento_id, mutation_at DESC);
CREATE INDEX idx_mutations_session_keys 
  ON cco.session_mutations(session_key_before, session_key_after);
```

**Como usar**:

```sql
-- Job 1 (cco-sync-tita-sessions) modificado:
-- Ao detectar que tita_agendamento_id=1234 já não tem data_sessao=2026-06-08
-- (havia antes, agora tem 2026-06-09):

INSERT INTO cco.session_mutations (
  tita_agendamento_id,
  session_key_before,  -- abc123 (antigo)
  session_key_after,   -- def456 (novo)
  mutation_type,       -- 'reschedule'
  data_old,
  data_new,
  hora_old,
  hora_new,
  paciente_nome,
  detected_by
) VALUES (
  1234,
  'abc123',
  'def456',
  'reschedule',
  '2026-06-08',
  '2026-06-09',
  '14:00',
  '14:00',
  'João Silva',
  'job-1-tita'
) ON CONFLICT DO NOTHING;  -- Idempotente
```

**Benefícios**:

- ✅ Rastreia que abc123 → def456 (auditoria)
- ✅ Permite consolidação de histórico
- ✅ Identifica órfãos para limpeza

---

#### 5.2 Session Versioning (Coluna Nova)

```sql
-- Adicionar a cco.atendimentos:
ALTER TABLE cco.atendimentos ADD COLUMN session_version int DEFAULT 1;

-- Representação:
-- session_key='abc123' com version=1 (antiga, remarcada)
-- session_key='def456' com version=1 (nova, corrente)
-- Mas ambas têm tita_agendamento_id=1234

-- Better approach: Usar surrogate key
ALTER TABLE cco.atendimentos ADD COLUMN tita_session_chain_id uuid;

-- Todas as versões de mesma TITA_ID compartilham chain_id
INSERT INTO cco.atendimentos (
  id,
  session_key,
  tita_agendamento_id,
  tita_session_chain_id,  -- uuid(1234) — mesma cadeia
  ...
)
```

---

#### 5.3 Consolidação de Histórico (Fase 3 Enhancement)

```sql
-- Quando engine detecta nova versão de session_key:

-- 1. Busca autorizações da versão antiga
SELECT * FROM cco.session_authorizations 
WHERE session_key IN (
  SELECT session_key_before FROM cco.session_mutations
  WHERE session_key_after = 'def456'
);

-- 2. Se encontrou, COPIA para nova versão (com marca de cópia):
INSERT INTO cco.session_authorizations (
  session_key,
  source,
  authorization_status,
  -- ... outras colunas
  copied_from_session_key,  -- Nova coluna: rastreamento
  copied_at
) 
SELECT 
  'def456',  -- Nova chave
  source,
  authorization_status,
  session_key,  -- De onde veio
  now()
FROM cco.session_authorizations
WHERE session_key='abc123'
ON CONFLICT (session_key, source) DO UPDATE
SET authorization_status = EXCLUDED.authorization_status;
```

---

### 5.4 Limpeza Automática de Órfãos (Fase 2 Enhancement)

```sql
-- Modificar Job 1 (cco-sync-tita-sessions):
-- Após UPSERT de novas sessões, identificar e marcar órfãos

-- 1. Achar sessões que DESAPARECERAM de TITA
CREATE TEMPORARY TABLE orphaned_sessions AS
SELECT a.session_key, a.tita_agendamento_id
FROM cco.atendimentos a
LEFT JOIN (
  -- TITA CSV parsed
  SELECT DISTINCT tita_agendamento_id 
  FROM temp_parsed_tita_csv
) t ON a.tita_agendamento_id = t.tita_agendamento_id
WHERE t.tita_agendamento_id IS NULL
  AND a.updated_at < now() - interval '7 days'  -- Segurança: 7 dias de latência
  AND a.data_sessao < CURRENT_DATE - 7;  -- Não marcar sessões futuras

-- 2. Marcar como orphaned (soft delete)
UPDATE cco.atendimentos
SET orphaned_at = now()
FROM orphaned_sessions os
WHERE cco.atendimentos.session_key = os.session_key;

-- 3. Propagar para ocorrências
UPDATE cco.occurrences
SET orphaned_at = now()
WHERE session_key IN (SELECT session_key FROM orphaned_sessions);

-- 4. Agendar limpeza real (90 dias depois)
CREATE TABLE cco.orphaned_sessions (
  session_key text PRIMARY KEY,
  tita_agendamento_id bigint,
  orphaned_at timestamptz,
  marked_for_deletion_at timestamptz,
  reason text  -- 'reschedule', 'cancellation', etc
);
```

---

## 6. Política de Retenção Revisada

### Modelo Proposto (3 Camadas)

```sql
-- CAMADA 1: Ocorrências RESOLVIDAS (atual)
DELETE FROM cco.occurrences 
WHERE resolved_at IS NOT NULL
  AND resolved_at < now() - interval '90 days';

-- CAMADA 2: Ocorrências de ÓRFÃOS (novo)
DELETE FROM cco.occurrences 
WHERE session_key IN (
  SELECT session_key FROM cco.atendimentos 
  WHERE orphaned_at IS NOT NULL 
    AND orphaned_at < now() - interval '30 days'  -- Mais rápido
)
  AND created_at < now() - interval '30 days';

-- CAMADA 3: Sessões órfãs SEM ocorrências (cleanup final)
DELETE FROM cco.atendimentos 
WHERE orphaned_at IS NOT NULL
  AND orphaned_at < now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM cco.occurrences 
    WHERE session_key = cco.atendimentos.session_key
  );

-- Registrar em log para auditoria
INSERT INTO cco.retention_audit (
  deleted_rows,
  deleted_type,
  reason,
  executed_at
)
VALUES (found.rows, 'occurrences_orphaned', 'retention-policy', now());
```

**Cronograma**:

- 01:00 UTC: Retenção de resolvidas (90 dias)
- 02:00 UTC: Limpeza de órfãs (30 dias)
- 03:00 UTC: Consolidação de histórico (verifica inconsistências)

---

## 7. Recomendação de FK Constraint

### Análise Comparativa

| Opção | ON DELETE | Pro | Contra | Recomendação |
|---|---|---|---|---|
| **RESTRICT** | Bloqueia DELETE se referência existe | Segurança (não deleta acidentalmente) | Ocorrências ficarão presas forever; acumula lixo | ❌ NÃO use |
| **CASCADE** | Deleta automaticamente referências | Cleanup automático; não acumula orphans | **PERDE AUDITORIA**; ocorrência deletada sem trace | ❌ NÃO use |
| **SET NULL** | Anula referência estrangeira | Ocorrências permanecem sem session_key | Quebra JOIN; não ajuda se FK é NOT NULL | ❌ NÃO use |
| **SOFT DELETE** | Marca como deletado (new col) | Auditoria preservada; sem orphans | Requer lógica adicional em queries | ✅ **RECOMENDADO** |
| **VERSIONING** | Cria versão nova de session | Histórico completo; rastreabilidade | Mais complexo; requer change log | ✅ **RECOMENDADO** |

### Recomendação Final

**Mudar de `ON DELETE RESTRICT` para `ON DELETE SET NULL` (transição)** E implementar **SOFT DELETE**:

```sql
-- FASE 2 REVISÃO:
ALTER TABLE cco.session_authorizations 
  DROP CONSTRAINT session_authorizations_session_key_fkey,
  ADD CONSTRAINT session_authorizations_session_key_fkey
    FOREIGN KEY (session_key) 
    REFERENCES cco.atendimentos(session_key) 
    ON DELETE SET NULL;

ALTER TABLE cco.occurrences
  ADD COLUMN deleted_at timestamptz;

-- Queries sempre filtram deletados:
SELECT * FROM cco.occurrences 
WHERE deleted_at IS NULL AND resolved_at IS NULL;
```

---

## 8. Modelo de Rastreamento Consolidado

### Fluxo Proposto (Fase 2+3 Enhancement)

```
┌─────────────────────────────────────────────────────────────┐
│ Job 1: Sync TITA (ATUAL)                                    │
│ - Parse CSV TITA                                            │
│ - UPSERT cco.atendimentos by session_key                    │
│ - Log changes to cco.processing_logs                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Job 1-B: Detect Mutations (NOVO)                            │
│ - Compare tita_agendamento_id antes/depois                  │
│ - Se data/hora mudou: INSERT cco.session_mutations          │
│ - Se desapareceu: Mark orphaned_at in cco.atendimentos      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Job 2-3: Sync Authorizations (ATUAL)                        │
│ - UPSERT cco.session_authorizations by (session_key,source) │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Engine (Fase 3): Consolidation (NOVO)                       │
│ - Check cco.session_mutations for remarcações              │
│ - Copy auths from old session_key to new (if authorized)    │
│ - Mark old version as "incorporated" into new version       │
│ - Generate occurrences (idempotent via fingerprint)         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Retention Job (Fase 1, REVISADO)                            │
│ - Soft-delete old versions (orphaned_at < 30d)             │
│ - Clean unresolved occurrences of orphans                  │
│ - Archive (optional) to historical schema                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Respostas Concretas às Questões Críticas

| # | Pergunta | Resposta | Solução |
|---|---|---|---|
| 1 | **Como rastrear abc123→def456?** | Via `tita_agendamento_id` + tabela `cco.session_mutations` | Change log table |
| 2 | **Como consolidar autorizações?** | Job após detecção de mutation: copiar de session_key antiga para nova | Engine enhancement |
| 3 | **Como limpar órfãos?** | Soft delete: marcar `orphaned_at`, cleanup após 30d | Retenção em camadas |
| 4 | **Dashboard conta órfãs?** | Sim (problema). Solução: sempre fazer JOIN com `orphaned_at IS NULL` | Query filtering |
| 5 | **Qual retenção usar?** | 3 camadas: resolvidas (90d), órfãs (30d), consolidação (contínua) | Política 3-tier |
| 6 | **FK deve ser?** | Trocar `RESTRICT` → `SET NULL` + soft delete | Constraint revision |
| 7 | **Reprocessamento seguro?** | Usar `tita_session_chain_id` para unificar versões | Session versioning |

---

## 10. Roadmap de Implementação

### Fase 2-B (Pós-Atual)

**Sprint 1** (1-2 semanas):

- [ ] Criar tabela `cco.session_mutations`
- [ ] Criar tabela `cco.orphaned_sessions`
- [ ] Modifica Job 1 para detectar remarcações
- [ ] Adicionar colunas: `orphaned_at`, `copied_from_session_key`

**Sprint 2** (1-2 semanas):

- [ ] Criar `cco.session_consolidation_log`
- [ ] Engine (Fase 3): detectar mutations, copiar autorizações
- [ ] Testes: verify histórico consolidado

**Sprint 3** (1 semana):

- [ ] Revisar FKs: `RESTRICT` → `SET NULL` (data migration)
- [ ] Implementar soft-delete logic
- [ ] Retention job: 3 camadas

### Fase 3 (Conciliação Motor)

- [ ] Rule 1-7 intactas
- [ ] Novo rule: consolidação de histórico
- [ ] Novo rule: detecção de órfãos

---

## 11. Queries de Validação Pós-Implementação

```sql
-- ✅ Verificar zero órfãs
SELECT COUNT(*) as orphaned_count
FROM cco.atendimentos a
LEFT JOIN cco.session_mutations m ON a.session_key = m.session_key_after
WHERE a.orphaned_at IS NULL
  AND m.session_key_after IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM cco.occurrences o 
    WHERE o.session_key = a.session_key
  );
-- Expected: 0 (ou sessões legitimamente sem ocorrências)

-- ✅ Verificar que tita_agendamento_id é único por corrente
SELECT tita_agendamento_id, COUNT(DISTINCT tita_session_chain_id) as chain_count
FROM cco.atendimentos
WHERE orphaned_at IS NULL
GROUP BY tita_agendamento_id
HAVING COUNT(DISTINCT tita_session_chain_id) > 1;
-- Expected: 0 (cada tita_id tem apenas 1 cadeia ativa)

-- ✅ Verificar histórico consolidado
SELECT sa1.session_key as from_session, sa2.session_key as to_session, 
       sa1.authorization_status
FROM cco.session_authorizations sa1
JOIN cco.session_authorizations sa2 ON sa1.id = sa2.copied_from_id
WHERE sa2.authorization_status = sa1.authorization_status;
-- Expected: registros onde auths foram consolidadas

-- ✅ Verificar retenção funcionando
SELECT deleted_rows, reason, executed_at
FROM cco.retention_audit
WHERE executed_at > now() - interval '24 hours'
ORDER BY executed_at DESC;
-- Expected: 3 linhas (3 camadas executadas)
```

---

## 12. Conclusões

### Status Atual

🚨 **CRÍTICO**: O design atual cria:

1. Órfãs não rastreáveis
2. Perda de histórico de autorização
3. Inconsistência de contagem no dashboard
4. Possibilidade de multiplicidade (2+ versions ativas)

### Risco Não Mitigado

- **% de dados corrompidos em 6 meses**: ~5-10% (orphans acumulados)
- **Confiabilidade do dashboard**: ⚠️ MODERADA (contagens inconsistentes)
- **Auditoria**: ⚠️ QUEBRADA (não rastreia remarcações)

### Recomendação Executiva

**Implementar Solução Hybrid em 2 sprints ANTES de Fase 3 (Motor de Conciliação)**:

1. **Adição de 3 tabelas** (`session_mutations`, `orphaned_sessions`, `consolidation_log`)
2. **Revisão de Job 1** (mutation detection)
3. **Revisão de FKs** (`RESTRICT` → `SET NULL` + soft delete)
4. **Engine Enhancement** (consolidação automática)

**Custo**: ~20-30 horas de desenvolvimento  
**Benefício**: 100% rastreabilidade, zero orphans, auditoria completa

---

## Apêndice: Exemplos SQL Completos

### A. DDL da Solução (Adicionar a Fase 2)

```sql
-- 1. Session Mutations Tracking
CREATE TABLE cco.session_mutations (
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

CREATE INDEX idx_mutations_tita_id ON cco.session_mutations(tita_agendamento_id, mutation_at DESC);
CREATE INDEX idx_mutations_session_keys ON cco.session_mutations(session_key_before, session_key_after);

-- 2. Soft Delete Support
ALTER TABLE cco.atendimentos ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;
ALTER TABLE cco.occurrences ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;
ALTER TABLE cco.session_authorizations ADD COLUMN IF NOT EXISTS orphaned_at timestamptz;
ALTER TABLE cco.session_authorizations ADD COLUMN IF NOT EXISTS copied_from_session_key text;

-- 3. Revision Log
CREATE TABLE cco.consolidation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_session_key text NOT NULL,
  target_session_key text NOT NULL,
  records_copied int,
  consolidation_type text,  -- 'authorization_copy', 'mutation_mark', etc
  executed_at timestamptz DEFAULT now()
);

-- 4. Retention Audit
CREATE TABLE cco.retention_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_rows int,
  deleted_type text,  -- 'occurrences', 'sessions', 'orphans'
  reason text,
  executed_at timestamptz DEFAULT now()
);
```

### B. Mutation Detection Logic (TypeScript para Job 1 modificado)

```typescript
interface SessionKey {
  before: string | null;
  after: string;
  tita_id: bigint;
}

async function detectMutations(
  supabase: SupabaseClient,
  titaSessions: TITASession[],
  previousState: Map<bigint, string>  // tita_id -> session_key
): Promise<SessionKey[]> {
  const mutations: SessionKey[] = [];
  
  for (const session of titaSessions) {
    const titaId = session.id!;
    const newSessionKey = await buildSessionKey(
      session.paciente_nome!, 
      session.data_sessao!, 
      session.hora_inicio!
    );
    
    const oldSessionKey = previousState.get(titaId);
    
    if (oldSessionKey && oldSessionKey !== newSessionKey) {
      // Mutation detected
      mutations.push({
        before: oldSessionKey,
        after: newSessionKey,
        tita_id: titaId
      });
      
      // Log mutation
      await supabase
        .from('cco.session_mutations')
        .insert({
          tita_agendamento_id: titaId,
          session_key_before: oldSessionKey,
          session_key_after: newSessionKey,
          mutation_type: 'reschedule',  // ou outro tipo detectado
          data_old: session.data_sessao_old,
          data_new: session.data_sessao,
          hora_old: session.hora_inicio_old,
          hora_new: session.hora_inicio,
          paciente_nome: session.paciente_nome,
          detected_by: 'job-1-tita'
        });
    }
  }
  
  return mutations;
}
```

### C. Consolidation Logic (Engine Fase 3)

```typescript
async function consolidateHistoryForMutation(
  supabase: SupabaseClient,
  mutation: SessionMutation
) {
  // 1. Find authorizations from old session
  const { data: oldAuths } = await supabase
    .from('cco.session_authorizations')
    .select('*')
    .eq('session_key', mutation.session_key_before);
  
  if (!oldAuths || oldAuths.length === 0) return;
  
  // 2. Copy relevant authorizations to new session
  for (const auth of oldAuths) {
    // Check if new session already has authorization from this source
    const { data: existingAuth } = await supabase
      .from('cco.session_authorizations')
      .select('*')
      .eq('session_key', mutation.session_key_after)
      .eq('source', auth.source)
      .single();
    
    if (!existingAuth) {
      // Copy only if not already present
      await supabase
        .from('cco.session_authorizations')
        .insert({
          ...auth,
          id: undefined,  // Generate new ID
          session_key: mutation.session_key_after,
          copied_from_session_key: mutation.session_key_before,
          copied_at: new Date().toISOString()
        });
      
      // Log consolidation
      await supabase
        .from('cco.consolidation_log')
        .insert({
          source_session_key: mutation.session_key_before,
          target_session_key: mutation.session_key_after,
          records_copied: 1,
          consolidation_type: 'authorization_copy'
        });
    }
  }
}
```

---

**Documento Preparado Por**: Data Warehouse Review Team  
**Próxima Revisão**: Após implementação de Fase 2-B  
**Confidencialidade**: Interno — Tecnologia
