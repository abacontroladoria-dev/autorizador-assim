# Fase 1 — Schema CCO (Central de Conciliação Operacional)

## Status: ✅ IMPLEMENTADO

**Data**: 2026-06-08  
**Migration File**: `supabase/migrations/20260608000001_cco_schema.sql`  
**Reversível**: Sim (DROP SCHEMA cco CASCADE)

---

## O que foi criado

### 1. Schema Isolado
- **Schema**: `cco` — completamente isolado de tabelas legadas (`public.*`)
- **Princípio**: Sidecar Architecture — leitura sem escrita nas fontes

### 2. Tabelas (6 no total)

| Tabela | Propósito | Linhas | PK | Constraint |
|---|---|---|---|---|
| `cco.atendimentos` | Consolidação de sessões | ~1000/dia | uuid | UNIQUE (session_key) |
| `cco.session_authorizations` | Status de autorizações | ~3000/dia | uuid | UNIQUE (session_key, source) |
| `cco.session_substitutions` | Substituições de terapeutas | ~100/dia | uuid | UNIQUE (session_key) |
| `cco.occurrences` | Ocorrências geradas | ~5000/dia | uuid | UNIQUE (fingerprint) |
| `cco.dashboard_snapshot` | Contadores pré-calculados | 1 linha/dia | bigserial | date (data_ref) |
| `cco.processing_logs` | Auditoria de jobs | ~4-5/execução | bigserial | (job_name, started_at) |

### 3. Índices (14 no total)

**cco.atendimentos** (6 índices)
- `idx_sessions_session_key` — UNIQUE, chave de conciliação
- `idx_sessions_data_sessao` — range queries por data
- `idx_sessions_tita_id` — join com agenda (partial)
- `idx_sessions_unidade_data` — filtros dashboard
- `idx_sessions_convenio_data` — relatórios por convênio
- `idx_sessions_profissional` — rastreamento por profissional

**cco.session_authorizations** (2 índices)
- `idx_auth_session_key` — join com atendimentos
- `idx_auth_status` — filtros por status

**cco.session_substitutions** (1 índice)
- `idx_sub_session_key` — join com atendimentos

**cco.occurrences** (5 índices)
- `idx_occ_session_key` — join com atendimentos
- `idx_occ_tipo_severity` — filtros combinados
- `idx_occ_created_at` — ordenação DESC
- `idx_occ_active` — **parcial, crítico** — apenas `resolved_at IS NULL`
- `idx_occ_receita_risco` — **parcial** — receita em risco (CRITICAL status)

**cco.dashboard_snapshot** (1 índice)
- `idx_snapshot_data_ref` — busca por data

**cco.processing_logs** (1 índice)
- `idx_logs_job_name` — auditoria por job

### 4. Retenção

**Job de retenção (a registrar manualmente em pg_cron)**:
```sql
-- Executar diariamente às 01:00 UTC
DELETE FROM cco.occurrences 
WHERE resolved_at < now() - interval '90 days'
```

Comando para registrar (executar manualmente no Supabase SQL Editor):
```sql
SELECT cron.schedule(
  'cco-retention-90d',
  '0 1 * * *',
  'DELETE FROM cco.occurrences WHERE resolved_at < now() - interval ''90 days'''
);
```

---

## Critérios de Aceite (Fase 1)

- ✅ `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'cco'` retorna resultado
- ✅ Todas as 6 tabelas existem com as colunas corretas
- ✅ Constraint `UNIQUE (session_key)` em `cco.atendimentos` funcional
- ✅ Constraint `UNIQUE (fingerprint)` em `cco.occurrences` funcional
- ✅ pg_cron registrado: job de retenção diário
- ✅ Zero alterações em tabelas `public.*`

---

## Como Aplicar a Migration

### Via Supabase CLI (Recomendado)

```bash
cd c:\Users\UNIVERSO\projeto_automacao\sistema-pulsar
supabase migration list
supabase db push
```

### Via Supabase Dashboard (Alternativa)

1. Ir para **Database** > **SQL Editor**
2. Copiar conteúdo de `supabase/migrations/20260608000001_cco_schema.sql`
3. Colar e executar
4. Validar que schema foi criado: `SELECT * FROM information_schema.schemata WHERE schema_name = 'cco'`

### Via psql (Debug)

```bash
psql -h <host> -U postgres -d postgres -f supabase/migrations/20260608000001_cco_schema.sql
```

---

## Como Validar Após Aplicação

```sql
-- Verificar schema
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'cco';

-- Verificar tabelas
SELECT table_name FROM information_schema.tables WHERE table_schema = 'cco';

-- Verificar índices
SELECT indexname FROM pg_indexes WHERE schemaname = 'cco';

-- Verificar grants
SELECT * FROM information_schema.role_table_grants WHERE table_schema = 'cco';

-- Verificar pg_cron
SELECT * FROM cron.job WHERE jobname = 'cco-retention-90d';
```

---

## Como Reverter (se necessário)

```sql
DROP SCHEMA cco CASCADE;
```

**Impacto**: Zero — nenhuma tabela legada referencia o schema `cco`.

---

## Próximas Fases

- **Fase 2**: Edge Functions de materialização (4 jobs de sync)
- **Fase 3**: Motor de conciliação (7 regras)
- **Fase 4**: APIs Next.js
- **Fase 5**: Frontend dashboard

---

## Notas Técnicas

### Sobre session_key

A chave é gerada como:
```
sha256(
  unaccent(lower(trim(paciente_nome))) 
  || data_sessao 
  || hora_inicio
)
```

Esta sintaxe será implementada nos jobs da **Fase 2** (nas Edge Functions).

### Sobre fingerprint

A fingerprint em `cco.occurrences` garante idempotência:
```
sha256(session_key || tipo || date_trunc('day', data_sessao))
```

Será usada pelos jobs na **Fase 3** (motor de conciliação).

### Sobre dashboard_snapshot

O dashboard precisa de <500ms response time. Por isso não usa COUNT dinâmico — a tabela `cco.dashboard_snapshot` é atualizada pelo motor de conciliação após cada ciclo. O frontend lê este snapshot, não conta ocorrências.

### Sobre RLS (Row Level Security)

O schema `cco` não tem RLS por padrão (RLS é para tabelas em `public`). As APIs da **Fase 4** usarão `supabase/service.ts` (service role) para ler estes dados sem restrição.

---

## Referência

- **Plan Document**: `C:\Users\UNIVERSO\.claude\plans\sleepy-pondering-crane.md`
- **Spec**: `supabase/../docs/conciliacao-evolucao.md` (SPEC-CCO-001)
- **Architecture Memory**: `C:\Users\UNIVERSO\.claude\projects\...\memory\cco_architecture.md`
