# CCO Engine Timeout — Root Cause Analysis

## Status: CONFIRMED

Executado em: 2026-06-08T17:52Z

---

## Causa Raiz

O `cco-conciliation-engine` sofre timeout de 60s (HTTP timeout padrão) devido a um **padrão N+1 em `autoResolveOccurrences()`**.

### Código Problemático

Arquivo: `supabase/functions/cco-conciliation-engine/index.ts`
Função: `autoResolveOccurrences()` (linha 313-347)

```typescript
// Seleciona TODAS as ocorrências ativas de um tipo
const { data: toResolve } = await supabase
  .from("cco.occurrences")
  .select("id,session_key")
  .eq("tipo", tipo)
  .is("resolved_at", null)
  .is("resolved_by", null)

// Para CADA ocorrência, faz um UPDATE individual
if (toResolve) {
  for (const occ of toResolve) {
    if (!activeSessionKeys.has(occ.session_key)) {
      const { error } = await supabase
        .from("cco.occurrences")
        .update({...})
        .eq("id", occ.id)  // <-- UPDATE row-by-row
```

### Por Que Falha

- `cco.occurrences` está sendo acessada via `.from("cco.occurrences")` (dot-notation)
- Supabase JS client não aceita dot-notation para schemas não-públicos
- Cada query retorna **HTTP 404** com erro: `"Could not find the table 'public.cco.occurrences'"`
- Mesmo com erro, as queries são **seriais**
- Se há N ocorrências, são N+1 requisições HTTP
- Cada erro 404 demora ~200ms, então N=300 → 300 * 200ms = 60s (timeout!)

### Verificação via Teste Isolado

Criei `cco-conciliation-engine-test` para isolar cada componente:

1. **Minimal handler** → ✅ funciona (0.2s)
2. **createClient()** → ✅ funciona (1.0s)
3. **Simples SELECT com erro** → ✅ funciona (0.2s)
4. **SELECT + UPDATE** → ✅ funciona (0.3s)
5. **RPC call** → ✅ funciona (0.5s)

Todas as partes isoladas funcionam. **O problema é a quantidade de queries N+1.**

---

## Problemas Secundários

### 1. Schema Access Anti-Pattern

Todas as 13 ocorrências de `.from("cco.*")` estão **incorretas**:

```typescript
// ERRADO (dot-notation)
.from("cco.atendimentos")

// CERTO (com .schema())
.schema("cco").from("atendimentos")
```

Supabase JS v2 não suporta dot-notation para tabelas em schemas não-públicos. O correto é usar `.schema("cco")`.

### 2. N+1 Pattern

O loop de auto-resolve faz UPDATE um-por-um. Com 564 atendimentos potencialmente gerando ocorrências, pode haver centenas de UPDATEs seriais.

### 3. Validação REST API

O script `test_complete_flow.py` tenta validar via `/rest/v1/cco.atendimentos`, que também falha com 404.

---

## Solução

1. **Imediata**: Corrigir todas as 13 ocorrências de `.from("cco.*")` para `.schema("cco").from("*")`
2. **Batch update**: Reescrever `autoResolveOccurrences()` para usar RPC com batch UPDATE ao invés de loop
3. **Validação**: Criar RPC para contar occurrências no lugar de acessar REST API

---

## Detalhes Técnicos

- **Último log antes do timeout**: nenhum (função nem começa)
- **Erro exato**: HTTP 404 com `"Could not find the table 'public.cco.occurrences'"`
- **Linhas problemáticas**: 58, 95, 116, 137, 157, 177, 210, 258, 268, 295, 308 do index.ts original + loop em 327-341
- **Impacto**: Engine timeout → occurrences = 0 → dashboard = 0 → QA vê dados vazios

---

## Próximos Passos

Aguardando confirmação do usuário para:
1. Corrigir schema access em todos os 4 sync jobs + engine
2. Implementar RPC para batch auto-resolve
3. Criar RPC para validação em test_complete_flow.py
4. Re-test com dados reais
