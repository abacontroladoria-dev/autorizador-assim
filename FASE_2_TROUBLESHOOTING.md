# 🔧 FASE 2 — Troubleshooting Guide

Guia rápido para resolver problemas durante execução dos testes.

---

## ❌ Job retorna erro 404 ou 500

### Causa: Edge Function não deployada
```bash
# Verificar se function existe
supabase functions list

# Se não existir, deploy
supabase functions deploy cco-sync-tita-sessions --no-verify-jwt
supabase functions deploy cco-sync-assim-authorizations --no-verify-jwt
supabase functions deploy cco-sync-authorization-queue --no-verify-jwt
supabase functions deploy cco-sync-therapist-control --no-verify-jwt
```

### Causa: Erro no código TypeScript
```sql
-- Verificar logs do Supabase
-- Functions → Logs (última execução)
-- Procurar por: [cco-sync-*] Error:
```

**Fix comum**: Imports faltantes
```typescript
// ❌ Errado
import { JobLogger } from "../logger.ts"

// ✅ Correto
import { JobLogger } from "../cco-shared/logger.ts"
```

---

## ❌ Erro: "TITA API returned 401"

### Causa: Token TITA inválido ou expirado
```bash
# Verificar token no Supabase
supabase secrets list

# Se `TITA_TOKEN` estiver vazio ou incorreto
supabase secrets set TITA_TOKEN="seu_novo_token_aqui"
```

**Testar conectividade**:
```bash
curl -H "X-INTEGRACAO-TOKEN: SEU_TOKEN" \
  https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais
# Deve retornar CSV, não 401
```

---

## ❌ Erro: "Failed to fetch autorizacoes_assim: relation does not exist"

### Causa: Tabela legacy não existe ou está em outro schema
```sql
-- Verificar que a tabela existe
SELECT * FROM public.autorizacoes_assim LIMIT 1;
-- Se erro: table doesn't exist, falta criar fixture ou está em schema diferente

-- Conferir schema
SELECT table_schema, table_name FROM information_schema.tables 
WHERE table_name LIKE '%autorizacao%';
```

**Fix**: Atualizar nome da tabela no job:
```typescript
// ❌ Se estiver errado
.from("autorizacoes_assim")

// ✅ Se em schema diferente
.from("legacy.autorizacoes_assim")
```

---

## ❌ Erro: "Key (session_key)=(hash123) already exists"

### Causa: Constraint UNIQUE violado (não é idempotente)
```sql
-- Verificar se UPSERT está correto
SELECT COUNT(*) as duplicate_keys
FROM cco.atendimentos
GROUP BY session_key
HAVING COUNT(*) > 1
LIMIT 1;

-- Se encontrou duplicatas, o UPSERT não funcionou
```

**Fix**: Verificar que linha tem `ON CONFLICT`:
```typescript
// ❌ Errado (INSERT sem UPSERT)
.insert(batch)

// ✅ Correto
.upsert(batch, { onConflict: "session_key" })
```

---

## ❌ Erro: "column 'hora_inicio' is of type time without time zone but expression is of type text"

### Causa: Campo não está sendo convertido para o tipo correto
```sql
-- Verificar tipo da coluna
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='cco' AND table_name='atendimentos' AND column_name='hora_inicio';
-- Deve ser: time without time zone
```

**Fix**: Garantir normalizeTime() retorna string válida:
```typescript
// ✅ Correto
const hora = normalizeTime("14:30")  // retorna "14:30"
// PostgreSQL auto-converte string para time
```

---

## ❌ Erro: "Invalid date 2026-02-30"

### Causa: normalizeDate() não está validando data inválida
```sql
-- Teste rápido do validador
-- Função deve rejeitar fevereiro 30
```

**Fix**: Verificar que normalizeDate() usa `new Date()`:
```typescript
// ✅ Correto (já implementado)
const date = new Date(`${year}-${month}-${day}`)
if (isNaN(date.getTime())) {
  throw new Error(`Invalid date: ${input}`)
}
```

---

## ❌ Job demora > 30s (timeout)

### Causa: Tabela muito grande ou query ineficiente
```sql
-- Medir tempo de fetch
EXPLAIN ANALYZE
SELECT COUNT(*) FROM public.controle_terapeutico;

-- Se Seq Scan demora > 5s, tabela provavelmente muito grande
-- Solução: Adicionar índice
CREATE INDEX idx_ct_status ON public.controle_terapeutico(status);
```

### Causa: Network latency ao TITA API
```bash
# Testar conectividade com TITA
time curl -H "X-INTEGRACAO-TOKEN: TOKEN" \
  https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais \
  -w "Time: %{time_total}s\n"
# Se > 10s, issue é com TITA, não com código
```

---

## ❌ processing_logs vazio

### Causa: JobLogger não está registrando
```sql
-- Verificar logs
SELECT * FROM cco.processing_logs ORDER BY started_at DESC LIMIT 5;
-- Se tabela vazia, nenhum job rodou ou error antes de log
```

**Fix**: Verificar que cada job chama `logger.finishSuccess()`:
```typescript
// ✅ Correto
try {
  const count = await syncTITASessions(...)
  await logger.finishSuccess(supabase, count)  // ← Obrigatório
  return jsonResponse({ ok: true, rows_processed: count })
} catch (err) {
  await logger.finishError(supabase, err)  // ← Obrigatório
  return jsonResponse({ error: err.message }, 500)
}
```

---

## ❌ Teste de idempotência falha (segunda execução cria duplicatas)

### Causa: UPSERT não está usando chave correta
```sql
-- Verificar constraint UNIQUE
SELECT constraint_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema='cco' AND table_name='session_authorizations';
-- Deve ter: UNIQUE (session_key, source)
```

**Fix**: Verificar `onConflict` matches constraint:
```typescript
// ❌ Errado (ignora source)
.upsert(batch, { onConflict: "session_key" })

// ✅ Correto (respeita composite key)
.upsert(batch, { onConflict: "session_key,source" })
```

---

## ❌ CSV parsing quebra com campos que contêm aspas

### Teste
```
INPUT: "Silva, João"
PARSED: Silva, João  ← correto

INPUT: Silva, "João da Silva"
PARSED: ??? ← pode quebrar se parser não é quote-aware
```

**Fix**: Verificar que parseCSVLine() está sendo usado:
```typescript
// ✅ Correto (já implementado)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let insideQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"'
        i++  // skip escaped quote
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}
```

---

## ❌ Nenhum dado aparece em cco.atendimentos mesmo após Job 1

### Causa 1: TITA API vazia (nenhuma agenda hoje)
```bash
# Testar manualmente
curl -H "X-INTEGRACAO-TOKEN: TOKEN" \
  https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais

# Se retorna CSV com < 2 linhas (header + 0 dados), é esperado
```

### Causa 2: Dados estão lá mas validação rejeita
```sql
-- Contar quantos registros passam validação
SELECT COUNT(*) as parsed FROM (
  SELECT 1 FROM (
    VALUES 
      ('João', '2026-06-08', '14:00'),
      ('Maria', '2026-06-08', '15:00')
  ) AS t(nome, data, hora)
  WHERE nome IS NOT NULL AND data IS NOT NULL AND hora IS NOT NULL
) x;
```

**Debug**: Adicionar logs:
```typescript
// Em parseTITAResponse():
console.log(`[DEBUG] Row ${i}: paciente=${session.paciente_nome}, data=${session.data_sessao}, hora=${session.hora_inicio}`)
// Se vê log mas nada inserido, validação está rejeitando
```

---

## ❌ Datas parseadas incorretamente (01/02/2026 vira 2026-02-01 em vez de 2026-01-02)

### Causa: Ambiguidade DD/MM vs MM/DD
```typescript
// ❌ Errado: assume MM/DD (American)
const [month, day, year] = input.split('/')

// ✅ Correto: assume DD/MM (Brazilian)
const [day, month, year] = input.split('/')
```

**Verificar**: normalizeDate() em logger.ts deve usar DD/MM:
```typescript
const [day, month, year] = input.split('/')
// Validar: month 1-12, day 1-31
// Construir: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
```

---

## ❌ Teste de performance falha (job demora 50s)

### Causa 1: Batch size muito grande
```typescript
// ❌ Errado
for (let i = 0; i < rows.length; i += 1000) {  // batches de 1000
  const batch = rows.slice(i, i + 1000)
  await supabase.from("cco.atendimentos").upsert(batch)
}

// ✅ Correto (já implementado)
for (let i = 0; i < rows.length; i += 100) {  // batches de 100
  const batch = rows.slice(i, i + 100)
  await supabase.from("cco.atendimentos").upsert(batch)
}
```

### Causa 2: Query N+1 em loop
```typescript
// ❌ Errado
for (const session of sessions) {
  const key = await buildSessionKey(...)  // N queries
  rows.push(...)
}

// ✅ Correto (já implementado)
const rows = sessions.map(session => ({
  session_key: buildSessionKey(...),  // Sincronous
  ...
}))
```

---

## ✅ CHECKLIST DE TROUBLESHOOTING

Se um teste falha:

- [ ] Verificar `cco.processing_logs` para erro exato
- [ ] Confirmar Edge Functions estão deployed: `supabase functions list`
- [ ] Confirmar variáveis de ambiente: `supabase secrets list`
- [ ] Verificar conectividade TITA: `curl ... https://apiv2.apptita.com.br/api/...`
- [ ] Verificar tabelas legacy existem: `SELECT * FROM public.autorizacoes_assim LIMIT 1`
- [ ] Confirmar schema CCO: `SELECT schema_name FROM information_schema.schemata WHERE schema_name='cco'`
- [ ] Re-deploy function afetada: `supabase functions deploy cco-sync-*`
- [ ] Executar teste de novo após fix

---

## 📞 ESCALAÇÃO

Se nenhuma das soluções acima funcionar:

1. **Coletar evidência**:
```sql
-- Error log
SELECT * FROM cco.processing_logs 
WHERE status = 'error' 
ORDER BY started_at DESC LIMIT 1;

-- Data sample
SELECT * FROM cco.atendimentos LIMIT 5;
SELECT * FROM cco.session_authorizations LIMIT 5;

-- Schema check
SELECT table_name FROM information_schema.tables WHERE table_schema='cco';
```

2. **Verificar código**:
```bash
# Check TypeScript no arquivo
cat supabase/functions/cco-sync-tita-sessions/index.ts | grep -A 5 "normalizeDate"

# Check imports
grep "import {" supabase/functions/cco-sync-tita-sessions/index.ts
```

3. **Documentar**:
   - Teste que falhou (1-17)
   - Erro exato
   - Passos para reproduzir
   - Output do processamento_logs

Então solicitar assistência com todos esses dados.
