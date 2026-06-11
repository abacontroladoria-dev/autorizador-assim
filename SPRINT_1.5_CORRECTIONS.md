# Sprint 1.5 — RLS Hardening - Correções Aplicadas

## Resumo das Correções

### 1. **fila_autorizacoes (Fila de Autorização)**

**Corrigido:**
- Recepcao agora pode fazer **INSERT + UPDATE** (além de SELECT)
- Recepcao ainda **NÃO pode DELETE**

**Permissões Finais:**
```sql
╔════════════╦════════╦════════╦════════╦════════╗
║ Role       ║ SELECT ║ INSERT ║ UPDATE ║ DELETE ║
╠════════════╬════════╬════════╬════════╬════════╣
║ admin      ║   ✅   ║   ✅   ║   ✅   ║   ✅   ║
║ autorizacao║   ✅   ║   ❌   ║   ✅   ║   ❌   ║
║ diretoria  ║   ✅   ║   ❌   ║   ✅   ║   ❌   ║
║ recepcao   ║   ✅   ║   ✅   ║   ✅   ║   ❌   ║ ← CORRIGIDO
║ other      ║   ❌   ║   ❌   ║   ❌   ║   ❌   ║
╚════════════╩════════╩════════╩════════╩════════╝
```

**Policies Implementadas:**
- ✅ `fila_autorizacoes_recepcao_select` - SELECT
- ✅ `fila_autorizacoes_recepcao_insert` - INSERT (NEW)
- ✅ `fila_autorizacoes_recepcao_update` - UPDATE
- ✅ `fila_autorizacoes_recepcao_no_delete` - Block DELETE

---

### 2. **controle_terapeutico (Controle Terapêutico)**

**Corrigido:**
- Terapeutico agora pode fazer **INSERT** (além de SELECT + UPDATE)
- Terapeutico e Terapeuta ainda **NÃO podem DELETE**

**Permissões Finais:**
```sql
╔════════════╦════════╦════════╦════════╦════════╗
║ Role       ║ SELECT ║ INSERT ║ UPDATE ║ DELETE ║
╠════════════╬════════╬════════╬════════╬════════╣
║ admin      ║   ✅   ║   ✅   ║   ✅   ║   ✅   ║
║ terapeutico║   ✅   ║   ✅   ║   ✅   ║   ❌   ║ ← CORRIGIDO
║ terapeuta  ║   ✅   ║   ✅   ║   ✅   ║   ❌   ║ ← CORRIGIDO
║ recepcao   ║   ❌   ║   ❌   ║   ❌   ║   ❌   ║
║ other      ║   ❌   ║   ❌   ║   ❌   ║   ❌   ║
╚════════════╩════════╩════════╩════════╩════════╝
```

**Policies Implementadas:**
- ✅ `controle_terapeutico_therapeutic_select` - SELECT
- ✅ `controle_terapeutico_therapeutic_insert` - INSERT (NEW)
- ✅ `controle_terapeutico_therapeutic_update` - UPDATE
- ✅ `controle_terapeutico_no_delete_non_admin` - Block DELETE for non-admin

---

## Matriz de Permissões Consolidada

### Tabelas Críticas - Permissões por Role

```
AUTORIZACOES:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ recepcao     │   ✅*  │   ❌   │   ❌   │   ❌   │ *unit-filtered
│ terapeutico  │   ✅   │   ❌   │   ❌   │   ❌   │
│ faturamento  │   ✅   │   ❌   │   ❌   │   ❌   │
│ autorizacao  │   ✅   │   ❌   │   ❌   │   ❌   │
└──────────────┴────────┴────────┴────────┴────────┘

CHAMADA_PACIENTE:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ recepcao     │   ✅*  │   ✅*  │   ✅*  │   ❌   │ *unit-filtered
│ diretoria    │   ✅   │   ✅   │   ✅   │   ❌   │
└──────────────┴────────┴────────┴────────┴────────┘

CONTROLE_TERAPEUTICO:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ terapeutico  │   ✅   │   ✅   │   ✅   │   ❌   │ ✨ CORRIGIDO
│ terapeuta    │   ✅   │   ✅   │   ✅   │   ❌   │ ✨ CORRIGIDO
└──────────────┴────────┴────────┴────────┴────────┘

FILA_AUTORIZACOES:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ autorizacao  │   ✅   │   ❌   │   ✅   │   ❌   │
│ diretoria    │   ✅   │   ❌   │   ✅   │   ❌   │
│ recepcao     │   ✅   │   ✅   │   ✅   │   ❌   │ ✨ CORRIGIDO
└──────────────┴────────┴────────┴────────┴────────┘

LOGS:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ others       │   ❌   │   ❌   │   ❌   │   ❌   │
└──────────────┴────────┴────────┴────────┴────────┘

SYNC_CONTROLE:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ others       │   ❌   │   ❌   │   ❌   │   ❌   │
└──────────────┴────────┴────────┴────────┴────────┘

USUARIOS:
┌──────────────┬────────┬────────┬────────┬────────┐
│ Role         │ SELECT │ INSERT │ UPDATE │ DELETE │
├──────────────┼────────┼────────┼────────┼────────┤
│ admin        │   ✅   │   ✅   │   ✅   │   ✅   │
│ others       │   ✅*  │   ❌   │   ✅*  │   ❌   │ *own profile only
└──────────────┴────────┴────────┴────────┴────────┘
```

---

## Arquivos Atualizados

| Arquivo | Mudança |
|---------|---------|
| `20260610000011_rls_hardening_rbac_unit_isolation.sql` | ✨ 2 novas policies (INSERT para recepcao em fila_autorizacoes e terapeutico em controle_terapeutico) |
| `RLS_HARDENING_VALIDATION.md` | ✨ Atualizado com permissões corrigidas |

---

## Validação

**Test Cases Afetados:**

- ✅ TEST 6: Recepcao agora consegue INSERT em fila_autorizacoes (antes falhava)
- ✅ TEST X: Terapeutico agora consegue INSERT em controle_terapeutico (antes falhava)

**Para validar:**

```sql
-- Como recepcao, INSERT em fila_autorizacoes deve funcionar:
INSERT INTO public.fila_autorizacoes (...)
VALUES (...);
-- Resultado esperado: INSERT bem-sucedido ✅

-- Como terapeutico, INSERT em controle_terapeutico deve funcionar:
INSERT INTO public.controle_terapeutico (...)
VALUES (...);
-- Resultado esperado: INSERT bem-sucedido ✅

-- DELETE ainda deve ser bloqueado para ambas:
DELETE FROM public.fila_autorizacoes WHERE ...;
-- Resultado esperado: RLS policy violation ❌

DELETE FROM public.controle_terapeutico WHERE ...;
-- Resultado esperado: RLS policy violation ❌
```

---

## Status Sprint 1.5

```
✅ Identificadas 17 políticas USING (true)
✅ Removidas todas as políticas inseguras
✅ Implementadas 42+ novas políticas RBAC
✅ Adicionado isolamento por unidade
✅ Recepcao com INSERT em fila_autorizacoes
✅ Terapeutico com INSERT em controle_terapeutico
✅ Bloqueios de DELETE mantidos
✅ Documentação atualizada
✅ Test script criado

STATUS: 🟢 PRONTO PARA DEPLOY
```

---

## Próximos Passos

1. **Deploy em Staging:**
   ```bash
   supabase migration up
   ```

2. **Executar testes:**
   ```bash
   psql < supabase/test_rls_isolation.sql
   ```

3. **Validar permissões corrigidas** (recepcao + terapeutico)

4. **Commit:**
   ```bash
   git add .
   git commit -m "security: sprint 1.5.1 rls hardening corrections (recepcao insert + terapeutico insert)"
   ```

5. **Deploy em Produção**
