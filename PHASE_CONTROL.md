# 📋 Controle de Fases — Profissionais Desligados na Cobertura Clínica

**Iniciado:** 2026-06-09  
**Status Geral:** FASE 1 CONCLUÍDA | FASE 2 SUSPENSA

---

## 🔵 FASE 1: Aplicar Filtro Operacional (id_unidade = 280)

### Status: ✅ CONCLUÍDA

| Aspecto | Status |
|---|---|
| Objetivo | Restringir Cobertura à unidade operacional 280 |
| Implementação | ✅ Migration criada e deployada |
| Validação | ⏳ Aguardando execução de queries |
| Rollback | Disponível (supabase db reset) |

---

### O Que Foi Implementado

**Migration:** `20260609000001_fase1_filtro_unidade_280_cobertura.sql`

**Alterações:**
```
vw_modal_substituicao_terapeutas (Part 1):  + AND a.clinica_id = 280
vw_modal_substituicao_terapeutas (Part 2):  + AND gp.id_unidade = 280
vw_terapeutas_semana (CTE):                 + AND id_unidade = 280
vw_terapeutas_semana (SELECT):              + AND g.id_unidade = 280
vw_profissionais_disponiveis:               SEM ALTERAÇÃO (já tinha 280)
```

---

### Resultado Esperado

| ID | Nome | Unidade 177 | Unidade 280 | Resultado |
|---|---|---|---|---|
| **8617** | Anne Christine | ✅ Sim | ❌ Não | **DESAPARECE** ✅ |
| **8587** | Catislene | ✅ Sim | ❌ Não | **DESAPARECE** ✅ |
| **8604** | Vinicius | ✅ Sim | ✅ Sim | **PERMANECE** ⚠️ |
| **8684** | Daiane | ✅ Sim | ✅ Sim | **PERMANECE** ⚠️ |

---

### Como Validar a Fase 1

**Query de Validação:**

Copie no Supabase Studio → SQL Editor:

```sql
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
ID   | Nome                        | slots_177 | slots_280
─────┼─────────────────────────────┼───────────┼──────────
8587 | Catislene Ferreira...       |    > 0    |    0     ← DESAPARECE
8604 | Vinicius De Andrade...      |    > 0    |   > 0    ← PERMANECE
8617 | Anne Christine Da Silva...  |    > 0    |    0     ← DESAPARECE
8684 | Daiane Fernandes...         |    > 0    |   > 0    ← PERMANECE
```

---

### Implicação para Profissionais Ativos

✅ **Nenhum impacto negativo esperado**

- Profissionais ativos com registros em unidade 280 continuam aparecendo normalmente
- Profissionais ativos com registros em unidade 177 que usam ILIKE (sala com nome de clínica) não são afetados pela regra 280
- Apenas profissionais desligados EXCLUSIVAMENTE em unidade 177 desaparecem (comportamento esperado)

---

## 🟠 FASE 2: Investigar Desligados em Unidade 280

### Status: ⏸️ SUSPENSA

| Aspecto | Status |
|---|---|
| Objetivo | Investigar Daiane (8684) e Vinicius (8604) |
| Critério de abertura | Confirmação que continuam após validação Fase 1 |
| Bloqueante | Fase 1 deve ser validada primeiro |
| Impacto | SEM ESTIMATIVA (depende da solução escolhida) |

---

### O Problema que Fase 2 Resolverá

**Constatação:** Daiane e Vinicius têm registros em `id_unidade = 280` e continuarão aparecendo após a Fase 1.

**Raiz:** O TiTa continua retornando blocos de grade para esses profissionais desligados, mesmo que não tenham pacientes atendidos.

**Evidência do Postman:**
- `grade_profissionais` (GET): Daiane e Vinicius aparecem com slots
- `csv_grade_profissionais` (POST): Daiane e Vinicius NÃO aparecem (sem sessões com paciente)

---

### Cenários Possíveis na Fase 2

#### Cenário A: Daiane/Vinicius NÃO aparecem após validação Fase 1
- **Ação:** Fechar Fase 2 — problema resolvido por regressão de dados ou cleanup no TiTa
- **Evidência:** Query SQL retorna `slots_280 = 0`

#### Cenário B: Daiane/Vinicius CONTINUAM aparecendo após validação Fase 1
- **Ação:** Abrir Fase 2 — analisar qual solução aplicar (A, B ou C)
- **Soluções:**
  - **A: Limpeza no TiTa** → Remover blocos de grade direto no TiTa
  - **B: Blacklist local** → Tabela `profissionais_desligados` com anti-join
  - **C: Campo de status** → Adicionar `ativo` ao sync `sync_tita_grade`

---

### Quando Fase 2 Abrirá

Após confirmação via SQL:

```sql
SELECT COUNT(*)
FROM grade_profissionais_tita
WHERE profissional_id IN (8604, 8684)
  AND id_unidade = 280
  AND data >= CURRENT_DATE - INTERVAL '7 days';
```

**Se > 0 linhas:** Abre Fase 2  
**Se = 0 linhas:** Fase 2 não necessária (problema resolvido)

---

## 📅 Timeline

| Data | Evento | Status |
|---|---|---|
| 2026-06-09 | Fase 1 implementada | ✅ Concluída |
| 2026-06-09 | Migration aplicada | ✅ Concluída |
| ⏳ | Validação SQL Fase 1 | ⏳ Aguardando |
| ⏳ | Decisão sobre Fase 2 | ⏳ Dependente Fase 1 |

---

## 📋 Documentação Relacionada

- [FASE_1_IMPLEMENTACAO.md](FASE_1_IMPLEMENTACAO.md) — Documentação visual da Fase 1
- [VALIDATION_PHASE_1.md](VALIDATION_PHASE_1.md) — Queries de validação completas
- [C:\Users\UNIVERSO\.claude\plans\foi-identificado-um-problema-synchronous-token.md](../../../.claude/plans/foi-identificado-um-problema-synchronous-token.md) — Plano geral

---

## 🔗 Como Usar Este Documento

1. **Entender status:** Veja a tabela no início
2. **Validar Fase 1:** Execute a query de validação no Supabase Studio
3. **Abrir Fase 2:** Se Daiane/Vinicius continuarem, este documento terá informações sobre soluções
4. **Rollback:** Se necessário reverter, execute `supabase db reset`

---

**Atualizado:** 2026-06-09  
**Responsável:** Time de Engenharia
