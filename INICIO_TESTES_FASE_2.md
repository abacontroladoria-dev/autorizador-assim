# 🧪 FASE 2 — INICIANDO TESTES DE VALIDAÇÃO

**Status atual**: Código implementado ✅ | Correções aplicadas ✅ | Pronto para testes ⏳

---

## 📋 O QUE FOI ENTREGUE

### ✅ Implementação Completa (Fase 1 + Fase 2)

1. **Schema CCO** (`supabase/migrations/20260608000001_cco_schema.sql`)
   - 6 tabelas: atendimentos, session_authorizations, session_substitutions, processing_logs, dashboard_snapshot
   - 10 índices otimizados
   - Constraints UNIQUE para idempotência
   - Política de retenção diária (delete resolved_at > 90d)

2. **4 Sync Jobs** (`supabase/functions/cco-sync-*/index.ts`)
   - Job 1: TITA sessions (CSV parsing com quote handling)
   - Job 2: ASSIM authorizations (status mapping)
   - Job 3: Fila authorizations (queue materialization)
   - Job 4: Therapist control (substitution tracking)
   - Todos com UPSERT atômico, logging, error handling

3. **Shared Utilities** (`supabase/functions/cco-shared/logger.ts`)
   - JobLogger class
   - normalizeDate() com validação completa
   - normalizeTime() com validação completa
   - buildSessionKey() determinístico (SHA-256)
   - computeSHA256() para hash de campos

4. **Cron Job Registration** (`supabase/migrations/20260608000002_cco_cron_jobs.sql`)
   - Job 1: */5 * * * * (a cada 5 minutos)
   - Job 2: 3,8,13,... (offset +3 min)
   - Job 3: 4,9,14,... (offset +4 min)
   - Job 4: 5,20,35,50 (offset +5 min)

### ✅ 8 Correções Críticas Aplicadas

| # | Bug | Impacto | Status |
|---|---|---|---|
| 1 | Hash null collision | Silent data loss | ✅ Corrigido |
| 2 | CSV undefined array | Silently drops rows | ✅ Corrigido |
| 3 | Invalid date validation | DB constraint violation | ✅ Corrigido |
| 4 | CSV quote parsing | Malformed data | ✅ Corrigido |
| 5 | Time normalization | Invalid session_key | ✅ Corrigido |
| 6 | Schedule race condition | Dependency failure | ✅ Corrigido |
| 7 | Redundant .select("id") | Network waste | ✅ Corrigido |
| 8 | Dead code imports | Code clarity | ✅ Corrigido |

### ✅ Documentação de Teste

| Documento | Propósito | Executar |
|---|---|---|
| `FASE_2_QUICK_TEST.md` | 17 testes em SQL | Copy/paste no Supabase |
| `FASE_2_STATUS.md` | Status executivo | Leitura rápida |
| `FASE_2_TROUBLESHOOTING.md` | Diagnóstico de problemas | Quando algo falha |
| `tests/fase2-validation.ts` | Suite automática | `deno run ...` |

---

## 🚀 COMEÇAR OS TESTES (2 OPÇÕES)

### OPÇÃO 1 — Quick Test (Recomendado para começar) ⭐

**Tempo**: ~20 minutos | **Ferramentas**: Supabase SQL Editor + curl

1. **Abra `FASE_2_QUICK_TEST.md`** — tem 17 comandos prontos
2. **Cole cada bloco SQL** no Supabase SQL Editor
3. **Execute o curl** dos jobs (copy/paste, substituir `<URL>` e `<KEY>`)
4. **Marque ✅** conforme cada teste passa

```bash
# Exemplo: Job 1 (TITA Sessions)
curl -X POST https://seu-supabase.supabase.co/functions/v1/cco-sync-tita-sessions \
  -H "Authorization: Bearer sua-service-role-key" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Próximo passo**: Se todos 17 passam → Opção 2

---

### OPÇÃO 2 — Automated Test Suite (Para validação completa)

**Tempo**: ~10 minutos | **Ferramentas**: Deno + curl

```bash
# 1. Navegar para projeto
cd c:\Users\UNIVERSO\projeto_automacao\sistema-pulsar

# 2. Confirmar que functions estão deployed
supabase functions list | grep cco-

# 3. Se não estão, deploy agora
supabase functions deploy cco-sync-tita-sessions --no-verify-jwt
supabase functions deploy cco-sync-assim-authorizations --no-verify-jwt
supabase functions deploy cco-sync-authorization-queue --no-verify-jwt
supabase functions deploy cco-sync-therapist-control --no-verify-jwt

# 4. Rodar suite de testes
deno run --allow-net --allow-env tests/fase2-validation.ts
```

**Output esperado**:
```
✅ Schema CCO exists
✅ Table cco.atendimentos exists
✅ Table cco.session_authorizations exists
...
📊 RESULTS: 17/17 tests passed (100%)
🎉 ALL TESTS PASSED! Ready for Fase 3.
```

---

## ⚠️ PRÉ-REQUISITOS

Antes de começar, **confirme que**:

- [ ] Schema `cco` foi criado (Fase 1)
  ```sql
  SELECT schema_name FROM information_schema.schemata WHERE schema_name='cco';
  -- Deve retornar 1 row
  ```

- [ ] Todas as 4 tabelas existem
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema='cco' ORDER BY table_name;
  -- Deve listar: atendimentos, processing_logs, session_authorizations, session_substitutions
  ```

- [ ] Variáveis de ambiente estão configuradas
  ```bash
  supabase secrets list | grep -E "SUPABASE_|TITA_"
  # Deve mostrar: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TITA_TOKEN
  ```

- [ ] Você tem acesso ao Supabase SQL Editor
  - Login em supabase.com → projeto → SQL Editor
  - Teste: `SELECT NOW();` (deve retornar timestamp)

---

## 📊 O QUE SERÁ TESTADO

### Teste 1-4: Invocação de Jobs
```
Job 1 (TITA)        → rows_processed > 0
Job 2 (ASSIM)       → rows_processed ≥ 0  
Job 3 (Fila)        → rows_processed ≥ 0
Job 4 (Therapist)   → rows_processed ≥ 0
```

### Teste 5-6: Idempotência
```
Re-run Job 1        → Não cria duplicatas
Composite key       → (session_key, source) previne dupes
```

### Teste 7-12: Validação de Dados
```
Session keys        → Determinísticos (sem colisões)
Datas               → YYYY-MM-DD válidos
Tempos              → HH:MM válidos
Status              → 5 valores do enum
FK Authorizations   → Todas referem sessão existente
FK Substitutions    → Todas referem sessão existente
```

### Teste 13-14: Performance
```
Job execution       → < 20s média (< 30s máximo)
Index usage         → Indexes sendo utilizados
```

### Teste 15-16: Logging
```
Processing logs     → Registra cada execução
Error handling      → Erros capturados com mensagem
```

### Teste 17: Integração
```
Data consistency    → total > 0, with_auth < total, with_subs < total
Cross-table refs    → Todas valid
```

---

## ✅ CRITÉRIOS DE ACEITE

**Fase 2 é considerada CONCLUÍDA quando**:

- [ ] **17/17 testes passam** (100% taxa)
- [ ] **Nenhuma duplicação** (COUNT(DISTINCT) == COUNT(*))
- [ ] **Sem orphaned records** (todas as FK válidas)
- [ ] **Performance OK** (jobs < 30s, dashboard < 500ms)
- [ ] **Logging completo** (todos registram em processing_logs)
- [ ] **Sem alteração em tabelas legadas** (public.* untouched)

**Taxa esperada**: 100% (nenhum teste deve falhar)

---

## 🆘 SE ALGO FALHAR

### Passo 1: Verificar o erro
```sql
SELECT job_name, status, error_message 
FROM cco.processing_logs 
WHERE status = 'error' 
ORDER BY started_at DESC 
LIMIT 1;
```

### Passo 2: Procurar solução
- Erros comuns em `FASE_2_TROUBLESHOOTING.md`
- Procure por: nome do erro, função, tipo

### Passo 3: Aplicar fix
- Se for código: editar arquivo, redeploy
- Se for dados: SQL cleanup, rerun teste

### Passo 4: Reexecutar teste
- Confirmar que fix funcionou

---

## 🎯 PRÓXIMOS PASSOS

### Se todos 17 testes passam ✅
```
1. ✅ Commit Fase 2 no git
2. 📋 Atualizar FASE_2_STATUS.md como VALIDADO
3. ⏭️ Iniciar Fase 3 — Conciliation Engine
```

### Se algum teste falha ❌
```
1. 🔍 Diagnosticar com troubleshooting guide
2. 🔧 Fixar o código/dados
3. 🔄 Rerun teste específico
4. ⏳ Voltar ao passo "Se todos passam"
```

---

## 📚 ARQUIVOS IMPORTANTES

```
Sistema PULSAR/
├── FASE_2_QUICK_TEST.md              ← Execute isto PRIMEIRO
├── FASE_2_STATUS.md                  ← Status geral
├── FASE_2_TROUBLESHOOTING.md         ← Se algo falhar
├── tests/fase2-validation.ts         ← Suite automática (opcional)
│
├── supabase/migrations/
│   ├── 20260608000001_cco_schema.sql    ← Fase 1 (já aplicada)
│   └── 20260608000002_cco_cron_jobs.sql ← Fase 2 jobs (já aplicada)
│
└── supabase/functions/
    ├── cco-shared/logger.ts              ← Utilities
    ├── cco-sync-tita-sessions/index.ts   ← Job 1 (COM FIXES)
    ├── cco-sync-assim-authorizations/index.ts ← Job 2 (COM FIXES)
    ├── cco-sync-authorization-queue/index.ts  ← Job 3 (COM FIXES)
    └── cco-sync-therapist-control/index.ts    ← Job 4 (COM FIXES)
```

---

## 📞 RESUMO EXECUTIVO

| Item | Status |
|---|---|
| **Código Implementado** | ✅ Completo |
| **Bugs Corrigidos** | ✅ 8/8 críticos |
| **Documentação de Teste** | ✅ Pronto |
| **Pré-requisitos** | ⏳ Você verifica |
| **Execução de Testes** | ⏳ Você executa |
| **Validação** | ⏳ Aguardando |

**Próxima ação**: Abra `FASE_2_QUICK_TEST.md` e comece pelo Check 1.

---

**Estimativa de tempo para completar testes**: 20-30 minutos  
**Taxa de sucesso esperada**: 100%  
**Bloqueadores conhecidos**: Nenhum

Boa sorte! 🍀
