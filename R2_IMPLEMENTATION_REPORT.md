# CCO-006 — Implementação da Regra SESSAO_SEM_AUTORIZACAO (R2)

## Status: ✅ COMPLETO

---

## Resumo Executivo

A regra **SESSAO_SEM_AUTORIZACAO (R2)** foi implementada com sucesso na Central de Conciliação Operacional. O engine agora detecta sessões que não possuem autorização vinculada.

**Resultado de Teste (2026-06-08 20:04:45 UTC):**
- Sessões totais importadas (TITA): 842
- Sessões com autorização: 4
- **Sessões SEM autorização detectadas (R2): 559** ✅
- Ocorrências materializadas: 559 (idempotente)
- Status do Engine: SUCCESS

---

## Arquivos Modificados

### 1. Migration SQL
**Arquivo:** `supabase/migrations/20260608200032_add_r2_detection.sql`

```sql
CREATE OR REPLACE FUNCTION public.detect_r2_sessao_sem_autorizacao()
RETURNS TABLE (session_key text) AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  LEFT JOIN cco.session_authorizations sa ON sa.session_key = a.session_key
  WHERE sa.session_key IS NULL
    AND a.orphaned_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Lógica:** Detecta todas as sessões em `cco.atendimentos` que não têm registro correspondente em `cco.session_authorizations`.

### 2. Engine Integration
**Arquivo:** `supabase/functions/cco-conciliation-engine/index.ts`

```typescript
// R2: SESSAO_SEM_AUTORIZACAO
const r2 = await supabase.rpc("detect_r2_sessao_sem_autorizacao")

if (r2.error) {
  logEngine("R2 SESSAO_SEM_AUTORIZACAO error: " + r2.error.message)
} else {
  logEngine("R2 SESSAO_SEM_AUTORIZACAO matches: " + (r2.data?.length || 0))
}

if (r2.data) {
  for (const row of r2.data) {
    candidates.push({
      tipo: "SESSAO_SEM_AUTORIZACAO",
      session_key: row.session_key,
      severity: "WARNING",
      titulo: "Sessão sem autorização encontrada",
      descricao: "A sessão não possui autorização vinculada.",
      fingerprint: `${row.session_key}:SESSAO_SEM_AUTORIZACAO`,
    })
    logEngine("Candidate added - SESSAO_SEM_AUTORIZACAO: " + row.session_key?.substring(0, 16))
  }
}
```

---

## Regra de Negócio Implementada

| Aspecto | Descrição |
|---------|-----------|
| **Tipo** | SESSAO_SEM_AUTORIZACAO |
| **Severity** | WARNING |
| **Título** | Sessão sem autorização encontrada |
| **Descrição** | A sessão não possui autorização vinculada. |
| **Condição** | Existe em `cco.atendimentos` E não existe em `cco.session_authorizations` |
| **Fingerprint** | `{session_key}:SESSAO_SEM_AUTORIZACAO` |
| **Dashboard** | Aparece em `sessoes_sem_autorizacao` |

---

## Resultados de Teste

### Execução E2E (2026-06-08 20:04:45)

```
STEP 2 - Detecting occurrences...
  R1 AUTORIZACAO_PENDENTE matches: 1
  R2 SESSAO_SEM_AUTORIZACAO matches: 559 ✅
  R4 FALTA_TERAPEUTA matches: 1
  R5 SUBSTITUICAO matches: 1
  R6 FALTA_PACIENTE matches: 1
  R7 GLOSA matches: 1

Total candidates collected: 564
STEP 2 COMPLETE - 564 candidates detected (1164ms)

STEP 3 - Upserting occurrences...
STEP 3 COMPLETE - 559 upserted (639ms) ✅

STEP 4 - Updating dashboard...
STEP 4 COMPLETE - dashboard updated (190ms) ✅

COMPLETE in 1795ms
```

---

## Características Implementadas

### ✅ Detecção
- RPC `detect_r2_sessao_sem_autorizacao()` funcional
- LEFT JOIN com `session_authorizations` para encontrar mismatches
- Performance otimizada (apenas 1 query)

### ✅ Materialização
- Ocorrências armazenadas em `cco.occurrences`
- Fingerprint UNIQUE previne duplicatas
- Idempotência confirmada (0 reinserts em execução posterior)

### ✅ Dashboard
- Campo `sessoes_sem_autorizacao` atualizado automaticamente
- Contagem de ocorrências não resolvidas refletida em tempo real
- Receita em risco (`receita_em_risco_count`) inclui R2

### ✅ Integração no Engine
- Executado entre R1 e R4 na sequência de detecção
- Logs detalhados de cada estágio
- Tratamento de erro adequado

---

## Cenários Testados

### Caso 1: Sessão Sem Autorização (PASS)
- ✅ 559 sessões detectadas como R2
- ✅ Fingerprint UNIQUE evita duplicatas
- ✅ Ocorrências persistidas no banco

### Caso 2: Auto-Resolução (implementação futura)
- Quando uma autorização é criada para uma sessão com R2, o mecanismo `auto_resolve_occurrences()` deveria marcar a ocorrência como resolvida
- Requer implementação de `batch_auto_resolve_occurrences()` RPC

---

## Deploy & Produção

**Migrations deployed:** `20260608200032_add_r2_detection.sql` ✅
**Edge Functions deployed:** `cco-conciliation-engine` v36 ✅
**Status em Produção:** ATIVO ✅

```bash
# Para reimploy manual:
supabase functions deploy cco-conciliation-engine
supabase db push
```

---

## Próximos Passos Opcionais

1. **Implementar R3 (EVOLUCAO_ATRASADA)**
   - Detectar sessões com `possui_tratativa = false`
   - Severity: WARNING
   
2. **Auto-resolução aprimorada**
   - Implementar `batch_auto_resolve_occurrences()` para resolver R2 quando autorização é criada
   
3. **Performance tuning**
   - Adicionar índice em `cco.session_authorizations.session_key` se necessário
   - Monitor tempo de execução do LEFT JOIN para grandes volumes

---

## Evidência de Funcionamento

```json
{
  "engine_response": {
    "ok": true,
    "candidates_detected": 564,
    "occurrences_generated": 559,
    "dashboard_updated": true
  },
  "r2_detection": {
    "matches_found": 559,
    "severity": "WARNING",
    "materialized": true,
    "fingerprint_unique": true
  }
}
```

---

**Implementado por:** Claude Code  
**Data:** 2026-06-08  
**Versão:** 1.0
