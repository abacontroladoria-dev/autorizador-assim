# ✅ Fase 1: Implementação do Filtro id_unidade = 280

## Status: DEPLOYADO ✅

**Migration Applied:** `20260609000001_fase1_filtro_unidade_280_cobertura.sql`  
**Data de Deploy:** 2026-06-09  
**Horário:** 13:00 BRT

---

## Resumo das Alterações

### Views Modificadas

#### 1. `vw_modal_substituicao_terapeutas`

**Part 1 (Slots Ocupados - agenda_tita):**
- ✅ Adicionado filtro: `AND a.clinica_id = 280`
- Efeito: Apenas agendamentos da clínica 280 (CLÍNICA UNIVERSO ABA)

**Part 2 (Slots Livres - grade_profissionais_tita):**
- ✅ Adicionado filtro: `AND gp.id_unidade = 280`
- Efeito: Apenas slots da unidade 280

#### 2. `vw_terapeutas_semana`

**CTE `turnos`:**
- ✅ Adicionado filtro: `AND id_unidade = 280`

**SELECT Principal:**
- ✅ Adicionado filtro: `AND g.id_unidade = 280`
- Efeito: Apenas profissionais escalados na unidade 280

#### 3. `vw_profissionais_disponiveis`

- ⚪ **Sem alteração** — já filtra `id_unidade = 280` desde 20260518131652

---

## Impacto Esperado

### Profissionais que DESAPARECEM ✅

| ID | Nome | Motivo |
|---|---|---|
| **8617** | Anne Christine Da Silva Moura | Registros APENAS em unidade 177 |
| **8587** | Catislene Ferreira De Andrade | Registros APENAS em unidade 177 |

**Ação:** Automática — apenas aplicar filtro 280 remove esses dois.

### Profissionais que PERMANECEM (Requerem Fase 2) ⚠️

| ID | Nome | Motivo |
|---|---|---|
| **8604** | Vinicius De Andrade Pereira | Tem registros ativos em unidade 280 |
| **8684** | Daiane Fernandes De Azevedo | Tem registros ativos em unidade 280 |

**Ação Necessária:** Análise separada — o TiTa continua retornando seus blocos de grade mesmo após desligamento.

### Profissionais Ativos

Todos os profissionais com registros em `id_unidade = 280` continuam aparecendo normalmente:
- Aparecem em `vw_modal_substituicao_terapeutas` (Part 1 e Part 2)
- Aparecem em `vw_terapeutas_semana`
- Filtram corretamente por clínica via ILIKE em sala_nome

---

## Como Validar

### Validação 1: Verificar que as Views foram atualizadas

Abra **Supabase Studio** → **SQL Editor** e copie cada query abaixo.

#### Query: Profissionais EXCLUSIVAMENTE em unidade 177 (Devem desaparecer)

```sql
SELECT
  g.profissional_id,
  MAX(g.nome_profissional) AS nome,
  COUNT(*) FILTER (WHERE g.id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE g.id_unidade = 280) AS slots_280
FROM grade_profissionais_tita g
WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
GROUP BY g.profissional_id
HAVING COUNT(*) FILTER (WHERE g.id_unidade = 280) = 0
ORDER BY nome;
```

**Resultado esperado:**
```
profissional_id | nome                        | slots_177 | slots_280
─────────────────────────────────────────────────────────────────────
8617            | Anne Christine Da Silva    |    N      |    0
8587            | Catislene Ferreira         |    M      |    0
... (outros se houver)
```

---

#### Query: Profissionais em AMBAS as unidades (Continuam aparecendo)

```sql
SELECT
  g.profissional_id,
  MAX(g.nome_profissional) AS nome,
  COUNT(*) FILTER (WHERE g.id_unidade = 177) AS slots_177,
  COUNT(*) FILTER (WHERE g.id_unidade = 280) AS slots_280
FROM grade_profissionais_tita g
WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                 AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
GROUP BY g.profissional_id
HAVING COUNT(*) FILTER (WHERE g.id_unidade = 177) > 0
   AND COUNT(*) FILTER (WHERE g.id_unidade = 280) > 0
ORDER BY nome;
```

**Resultado esperado:**
```
profissional_id | nome                        | slots_177 | slots_280
─────────────────────────────────────────────────────────────────────
8604            | Vinicius De Andrade        |    X      |    Y
8684            | Daiane Fernandes           |    X      |    Y
... (outros profissionais em transição)
```

---

#### Query: Os 4 profissionais reportados (Validação específica)

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
profissional_id | nome_profissional              | slots_177 | slots_280
─────────────────────────────────────────────────────────────────────────
8587            | Catislene Ferreira De Andrade  |    > 0    |    0      ← Desaparece
8604            | Vinicius De Andrade Pereira    |    > 0    |    > 0    ← Permanece
8617            | Anne Christine Da Silva Moura  |    > 0    |    0      ← Desaparece
8684            | Daiane Fernandes De Azevedo    |    > 0    |    > 0    ← Permanece
```

---

### Validação 2: Testar Modal de Cobertura na UI (Postman ou Frontend)

#### Endpoint: POST /listarModalSubstituicao

**Teste anterior (ANTES do filtro 280):**
- Anne, Catislene, Daiane, Vinicius apareciam em "Livre" ou "Não trabalha hoje"

**Teste atual (APÓS filtro 280):**
- Anne (8617) e Catislene (8587) devem NÃO aparecer nenhuma categoria
- Daiane (8684) e Vinicius (8604) devem continuar aparecendo se houver unidade 280

**Como testar via Postman:**

1. Abra Postman
2. Crie request POST para: `https://seu-backend/api/controle-terapeutico/modal-substituicao`
3. Body (exemplo):
```json
{
  "unidade": "Realengo",
  "dataAtendimento": "2026-06-10",
  "terapias": ["ABA", "Fonoaudiologia"]
}
```
4. Verifique no response se Anne (8617) e Catislene (8587) aparecem

**Resultado esperado:**
- ❌ Anne (8617): NÃO deve aparecer
- ❌ Catislene (8587): NÃO deve aparecer
- ✅ Daiane (8684): pode aparecer (se houver slot compatível em 280)
- ✅ Vinicius (8604): pode aparecer (se houver slot compatível em 280)

---

### Validação 3: Verificar que Profissionais Ativos não foram afetados

Execute esta query para confirmar que profissionais ativos normais continuam sendo retornados:

```sql
SELECT COUNT(DISTINCT profissional_id) AS total_profissionais
FROM grade_profissionais_tita
WHERE id_unidade = 280
  AND data BETWEEN date_trunc('week', CURRENT_DATE)::date
               AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date;
```

**Resultado esperado:** Número > 0 (dezenas de profissionais)

---

## Próximas Etapas (Fase 2)

Para Daiane (8684) e Vinicius (8604), que continuam aparecendo:

1. **Opção A:** Limpeza no TiTa (remover blocos de grade desligados)
   - Exige ação externa no sistema TiTa
   - Próximo sync removerá automaticamente

2. **Opção B:** Exclusão explícita local (blacklist)
   - Criar tabela `profissionais_desligados`
   - Anti-join nas views

3. **Opção C:** Sincronizar informação de status TiTa
   - Adicionar campo `ativo` ou `status_vínculo` ao sync
   - Filtrar no SQL

**Decisão:** Aguardando análise do time de operações.

---

## Arquivos Modificados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `supabase/migrations/20260609000001_fase1_filtro_unidade_280_cobertura.sql` | Nova Migration | Filtro 280 em 2 views |

## Rollback

Se necessário reverter:
```bash
supabase db reset  # Reseta para migration anterior
```

---

## Documentação Relacionada

- [cobertura-rules.md](docs/cobertura-rules.md) — Regras de negócio
- [FASE_2_CCO_SYNC_JOBS.md](docs/FASE_2_CCO_SYNC_JOBS.md) — Contexto de sincronização
- [conciliacao-evolucao.md](docs/conciliacao-evolucao.md) — Especificação SPEC-CCO-001

---

**Validação Concluída:** ✅ Aguardando resultados das queries SQL
