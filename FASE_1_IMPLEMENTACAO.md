# 🚀 Fase 1: Implementação do Filtro Operacional de Unidade 280

## Status: ✅ IMPLEMENTADO E DEPLOYADO

**Commit:** `6a92d20` — feat: implementar filtro id_unidade=280 na Cobertura Clínica (Fase 1)  
**Data:** 2026-06-09  
**Migration:** `20260609000001_fase1_filtro_unidade_280_cobertura.sql`

---

## O Que Foi Alterado

### Regra Operacional Implementada

> **"Todas as funcionalidades de Cobertura Clínica devem considerar exclusivamente a unidade 280 (CLÍNICA UNIVERSO ABA). A unidade 177 (BASE INATIVA DE DADOS) é histórica e não participa de processos operacionais atuais."**

### Views Modificadas

#### ✏️ `vw_modal_substituicao_terapeutas`

**Antes:**
```sql
-- Part 1: slots ocupados SEM FILTRO de unidade
FROM public.agenda_tita a
WHERE a.ativo = TRUE
  AND a.profissional_id IS NOT NULL
  AND a.terapia_nome IS NOT NULL
  -- ❌ Retornava profissionais de qualquer clínica

-- Part 2: slots livres SEM FILTRO de unidade
FROM public.grade_profissionais_tita gp
WHERE a.tita_agendamento_id IS NULL
  -- ❌ Retornava profissionais de qualquer unidade
```

**Depois:**
```sql
-- Part 1: slots ocupados COM FILTRO clinica_id=280
FROM public.agenda_tita a
WHERE a.ativo = TRUE
  AND a.profissional_id IS NOT NULL
  AND a.terapia_nome IS NOT NULL
  AND a.clinica_id = 280          -- ✅ NOVO
  -- Apenas clínica 280

-- Part 2: slots livres COM FILTRO id_unidade=280
FROM public.grade_profissionais_tita gp
WHERE a.tita_agendamento_id IS NULL
  AND gp.id_unidade = 280         -- ✅ NOVO
  -- Apenas unidade 280
```

---

#### ✏️ `vw_terapeutas_semana`

**Antes:**
```sql
WITH turnos AS (
  SELECT profissional_id, ...
  FROM public.grade_profissionais_tita
  WHERE data BETWEEN ... AND ...
  -- ❌ Sem filtro de unidade
  GROUP BY profissional_id
)

SELECT ...
FROM public.grade_profissionais_tita g
WHERE g.data BETWEEN ...
  AND g.nome_terapia IS NOT NULL
  -- ❌ Retornava profissionais de qualquer unidade
```

**Depois:**
```sql
WITH turnos AS (
  SELECT profissional_id, ...
  FROM public.grade_profissionais_tita
  WHERE data BETWEEN ... AND ...
    AND id_unidade = 280           -- ✅ NOVO
  GROUP BY profissional_id
)

SELECT ...
FROM public.grade_profissionais_tita g
WHERE g.data BETWEEN ...
  AND g.id_unidade = 280           -- ✅ NOVO
  AND g.nome_terapia IS NOT NULL
  -- Apenas unidade 280
```

---

#### ⚪ `vw_profissionais_disponiveis`

**Status:** Sem alteração (já filtra `id_unidade = 280` desde 20260518131652)

```sql
CREATE OR REPLACE VIEW public.vw_profissionais_disponiveis AS
SELECT ...
FROM public.grade_profissionais_tita
WHERE status_agendamento = 'Livre'
  AND id_unidade = 280             -- ✅ Já existia
```

---

## Impacto Imediato

### 📊 Matriz de Resultado

| Profissional | ID | Unidade | Slots 177 | Slots 280 | Resultado |
|---|---|---|---|---|---|
| Anne Christine | 8617 | 177 | > 0 | 0 | ❌ DESAPARECE |
| Catislene | 8587 | 177 | > 0 | 0 | ❌ DESAPARECE |
| Vinicius | 8604 | 177+280 | > 0 | > 0 | ⚠️ PERMANECE |
| Daiane | 8684 | 177+280 | > 0 | > 0 | ⚠️ PERMANECE |

### ✅ Resultado Esperado

**Categoria "Livre" da Cobertura:**

```diff
Antes (sem filtro 280):
- Anne Christine (unidade 177) ← indevido
- Catislene (unidade 177) ← indevido
- Daiane (unidade 280) ← correto
- Vinicius (unidade 280) ← correto
- (+ outros profissionais de ambas unidades)

Depois (com filtro 280):
+ Anne Christine (unidade 177) ← REMOVIDA ✅
+ Catislene (unidade 177) ← REMOVIDA ✅
- Daiane (unidade 280) ← continua
- Vinicius (unidade 280) ← continua
- (+ apenas profissionais de unidade 280)
```

---

## Como Validar Agora

### 1️⃣ Opção Simples: Supabase Studio SQL Editor

Copie esta query no **Supabase Studio** → **SQL Editor**:

```sql
-- Validação: 4 profissionais reportados
SELECT
  profissional_id,
  nome_profissional,
  COUNT(*) FILTER (WHERE id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE id_unidade = 280) AS slots_280
FROM grade_profissionais_tita
WHERE profissional_id IN (8617, 8587, 8604, 8684)
  AND data >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY profissional_id, nome_profissional
ORDER BY profissional_id;
```

**Resultado esperado:**
```
profissional_id | nome_profissional              | slots_177 | slots_280
─────────────────────────────────────────────────────────────────────────
          8587  | Catislene Ferreira De Andrade  |     12    |     0     ← Desaparece
          8604  | Vinicius De Andrade Pereira    |     15    |    8      ← Permanece
          8617  | Anne Christine Da Silva Moura  |     10    |     0     ← Desaparece
          8684  | Daiane Fernandes De Azevedo    |     20    |    6      ← Permanece
```

---

### 2️⃣ Opção com Postman: Testar Modal de Substituição

**Endpoint:** POST `https://seu-backend/api/controle-terapeutico/listarModalSubstituicao`

**Request Body:**
```json
{
  "unidade": "Realengo",
  "dataAtendimento": "2026-06-10",
  "terapias": ["ABA"]
}
```

**Antes da mudança (❌):**
```json
{
  "livre": [
    { "profissional_id": 8617, "profissional_nome": "Anne Christine..." },
    { "profissional_id": 8587, "profissional_nome": "Catislene..." },
    { "profissional_id": 8604, "profissional_nome": "Vinicius..." },
    { "profissional_id": 8684, "profissional_nome": "Daiane..." }
  ],
  "ocupado": [...],
  "nao_trabalha_hoje": [...]
}
```

**Depois da mudança (✅):**
```json
{
  "livre": [
    // ❌ Anne Christine REMOVIDA
    // ❌ Catislene REMOVIDA
    { "profissional_id": 8604, "profissional_nome": "Vinicius..." },
    { "profissional_id": 8684, "profissional_nome": "Daiane..." }
  ],
  "ocupado": [...],
  "nao_trabalha_hoje": [...]
}
```

---

### 3️⃣ Validação Completa: Todas as 3 Queries

Veja o arquivo [VALIDATION_PHASE_1.md](VALIDATION_PHASE_1.md) para as 3 queries SQL completas.

---

## Por que Anne e Catislene Desaparecem Automaticamente

```
┌─────────────────────────────────┐
│ Dados no Banco (grade_profissionais_tita) │
├─────────────────────────────────┤
│ Anne Christine:                 │
│  - 12 registros em id_unidade=177 │
│  - 0 registros em id_unidade=280  │
└─────────────────────────────────┘
                 ↓
         [Filtro id_unidade=280]
                 ↓
┌─────────────────────────────────┐
│ Resultado em vw_modal_substituicao │
│ Part 2 (slots livres)           │
├─────────────────────────────────┤
│ Anne Christine: 0 registros     │
│ → NÃO APARECE NO MODAL ✅       │
└─────────────────────────────────┘
```

---

## Por que Daiane e Vinicius CONTINUAM Aparecendo

```
┌─────────────────────────────────┐
│ Dados no Banco (grade_profissionais_tita) │
├─────────────────────────────────┤
│ Daiane:                         │
│  - 20 registros em id_unidade=177 │
│  - 6 registros em id_unidade=280  │
└─────────────────────────────────┘
                 ↓
         [Filtro id_unidade=280]
                 ↓
┌─────────────────────────────────┐
│ Resultado em vw_modal_substituicao │
│ Part 2 (slots livres)           │
├─────────────────────────────────┤
│ Daiane: 6 registros (280 apenas)│
│ → APARECE NO MODAL ⚠️           │
│ (Problema: TiTa ainda retorna   │
│  blocos de grade para ela)      │
└─────────────────────────────────┘
```

**Conclusão:** O filtro 280 resolve metade do problema (Anne/Catislene).  
Para Daiane/Vinicius, precisamos da **Fase 2** (decisão sobre como tratar profissionais desligados que ainda têm registros ativos em unidade 280).

---

## Próximas Etapas (Fase 2)

### Decisão Pendente: Como resolver Daiane e Vinicius?

**Opção A: Limpeza no TiTa** (Recomendada)
- Remove os blocos de grade direto no TiTa
- Próximo sync apaga automaticamente
- Exige coordenação com operação

**Opção B: Blacklist local** (Rápida)
- Cria tabela `profissionais_desligados`
- Anti-join nas 3 views afetadas
- Requer manutenção manual

**Opção C: Campo de status** (Escalável)
- Adiciona `ativo` ao sync `sync_tita_grade`
- Filtra por `ativo=true` no SQL

---

## Documentação Relacionada

- 📄 [VALIDATION_PHASE_1.md](VALIDATION_PHASE_1.md) — Queries de validação completas
- 📄 [docs/cobertura-rules.md](docs/cobertura-rules.md) — Regras de negócio
- 📄 [supabase/migrations/20260609000001_...](supabase/migrations/20260609000001_fase1_filtro_unidade_280_cobertura.sql) — Migration completa

---

## Resumo Executivo

| Aspecto | Status |
|---|---|
| **Implementação** | ✅ Concluída |
| **Deploy** | ✅ Ativo no Supabase |
| **Anne (8617) deve desaparecer** | ✅ Sim (apenas unidade 177) |
| **Catislene (8587) deve desaparecer** | ✅ Sim (apenas unidade 177) |
| **Vinicius (8604) deve permanecer** | ⚠️ Sim (tem unidade 280) |
| **Daiane (8684) deve permanecer** | ⚠️ Sim (tem unidade 280) |
| **Validação necessária** | ⏳ Executar queries SQL |
| **Fase 2** | ⏳ Pendente (Daiane + Vinicius) |

---

**Próximo passo:** Execute as queries do [VALIDATION_PHASE_1.md](VALIDATION_PHASE_1.md) no Supabase Studio e compartilhe os resultados para confirmar o impacto real.
