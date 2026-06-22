# Análise Crítica: Sessões Mutantes em CCO

> ⚠️ **CRÍTICO** — Descoberto problema de integridade de dados no schema CCO  
> Status: 🔴 **Bloqueador para Fase 3**  
> Data: 2026-06-08

---

## TL;DR (2 minutos)

**O Problema**: Quando operador remarca sessão em TITA (ex: 08/06 → 09/06), a chave de conciliação muda. Sistema não rastreia isso.

**O Resultado**: Sessões antigas ficam órfãs, ocorrências apontam para chaves deletadas, histórico perdido.

**A Solução**: 3 tabelas novas + mutation tracking em Job 1 + consolidation no Engine.

**O Esforço**: 40 horas, 1-2 semanas.

**A Recomendação**: Implementar Fase 2-B ANTES de Fase 3.

---

## 📚 Documentação

Há **6 documentos** neste pacote. Comece por onde faz sentido para seu papel:

### 👔 Para C-Suite / Product

```
1. Leia: SESSOES_MUTANTES_RESUMO_EXECUTIVO.md (5 min)
2. Veja: SESSOES_MUTANTES_DIAGRAMA.md > Risk Matrix (5 min)
3. Decida: Aprovar Fase 2-B?
```

### 👨‍💼 Para Tech Lead

```
1. Leia: SESSOES_MUTANTES_RESUMO_EXECUTIVO.md (5 min)
2. Leia: SESSOES_MUTANTES_PROXIMOS_PASSOS.md (15 min)
3. Estude: SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md (30 min)
4. Agende: Kick-off meeting
```

### 👨‍💻 Para Developers

```
1. Veja: SESSOES_MUTANTES_DIAGRAMA.md (25 min)
2. Estude: SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md (45 min)
3. Use: SESSOES_MUTANTES_DIAGNOSTICO.sql (validar)
4. Implemente: Sprint 1-4
```

### 👨‍🔬 Para Arquitetos

```
1. Leia: ANALISE_SESSOES_MUTANTES.md (60 min)
2. Valide: Schema DDL (ROADMAP > Sprint 1)
3. Execute: DIAGNOSTICO.sql em staging
4. Aprove: Design
```

### 🧪 Para QA/Testers

```
1. Veja: SESSOES_MUTANTES_DIAGRAMA.md > Cenários A-C (20 min)
2. Estude: SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md > Sprint 4 (20 min)
3. Use: SESSOES_MUTANTES_DIAGNOSTICO.sql (test cases)
4. Crie: Test plan
```

---

## 📄 Descrição dos Documentos

### 1. **SESSOES_MUTANTES_RESUMO_EXECUTIVO.md** ⭐

   **Tamanho**: 2 páginas  
   **Tempo**: 5-10 min  
   **Para**: Todos  
   **Contém**: Problema, impactos, solução, timeline, aprovação  
   **Comece AQUI**

### 2. **ANALISE_SESSOES_MUTANTES.md** 📖

   **Tamanho**: 50+ páginas  
   **Tempo**: 60-90 min  
   **Para**: Arquitetos, revisor crítico  
   **Contém**: Análise técnica profunda, SQL concreto, seções 1-12  
   **Para entender TUDO**

### 3. **SESSOES_MUTANTES_DIAGRAMA.md** 🎨

   **Tamanho**: 20 páginas  
   **Tempo**: 15-25 min  
   **Para**: Todos (visual learning)  
   **Contém**: Fluxos, state machines, risk matrix, timelines  
   **Para comunicação com não-técnicos**

### 4. **SESSOES_MUTANTES_DIAGNOSTICO.sql** 🔍

   **Tamanho**: 400+ linhas SQL  
   **Tempo**: 5 min (skim) / 30 min (run)  
   **Para**: DBAs, Data Engineers  
   **Contém**: 11 seções com queries de validação  
   **Para auditar estado ATUAL**

### 5. **SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md** 🛣️

   **Tamanho**: 30 páginas  
   **Tempo**: 30-45 min  
   **Para**: Tech Lead, Developers  
   **Contém**: 4 Sprints, DDL, TypeScript, testes, deployment  
   **Para IMPLEMENTAR a solução**

### 6. **SESSOES_MUTANTES_PROXIMOS_PASSOS.md** ⚡

   **Tamanho**: 15 páginas  
   **Tempo**: 10-15 min  
   **Para**: Tech Lead, Product, QA, DevOps  
   **Contém**: Ações 24-48h, kick-off, gates, checklists  
   **Para COMEÇAR já**

### 7. **SESSOES_MUTANTES_INDEX.md** 📇

   **Tamanho**: 10 páginas  
   **Tempo**: 5 min  
   **Para**: Navegação  
   **Contém**: Como usar cada doc, leitura personalizada  
   **Para NAVEGAR a documentação**

---

## 🎯 Quick Navigation

| Pergunta | Resposta |
|----------|----------|
| Qual é o problema? | RESUMO_EXECUTIVO p.1 |
| Por que é crítico? | DIAGRAMA > Risk Matrix |
| Quanto vai custar? | RESUMO_EXECUTIVO > Esforço |
| Qual é a solução? | ANALISE > Seção 6 |
| Como implemento? | ROADMAP > Sprints 1-4 |
| Como testo? | DIAGNOSTICO.sql > Seção 4 |
| O que faço agora? | PROXIMOS_PASSOS > Ações 24-48h |

---

## ⚡ Ações Imediatas

**Hoje (2026-06-08)**:

- [ ] Tech Lead: Leia RESUMO_EXECUTIVO
- [ ] Tech Lead: Compartilhe com stakeholders
- [ ] Equipe: Leia DIAGRAMA

**Amanhã (2026-06-09)**:

- [ ] Tech Lead: Agende kick-off meeting (segunda 10:00)
- [ ] DBA: Execute DIAGNOSTICO.sql seção 1 (orphan audit)
- [ ] Product: Aprove inclusão de Fase 2-B no roadmap

**Segunda (2026-06-10)**:

- [ ] Kick-off meeting (10:00)
- [ ] Revisão de design (ANALISE > Seção 6)
- [ ] Aprovação final
- [ ] Designação de developer

**Semana de 10-14**:

- [ ] Sprint 1: Schema DDL
- [ ] Sprint 2: Job 1 mutations
- [ ] Sprint 3: Engine consolidation
- [ ] Sprint 4: Testing

**Antes de Fase 3**:

- [ ] Fase 2-B estável em produção
- [ ] Diagnostico validando zero orphans
- [ ] Fase 3 pode começar

---

## 🔑 Key Concepts

**Session Mutation**: Mudança em data/hora/profissional de sessão em TITA

- Exemplo: João Silva 08/06 14:00 → João Silva 09/06 14:00

**Session Key**: Hash determinístico da sessão

- Atual: `sha256(paciente_nome || data_sessao || hora_inicio)`
- MUDA quando data/hora mudam (PROBLEMA!)

**Orphaned Session**: Sessão deletada de TITA mas ainda em `cco.atendimentos`

- Causa: Job 1 não deleta, apenas insere/atualiza

**FK Constraint Violation**: Ocorrência aponta para session_key que não existe

- Cenário: abc123 deletado de atendimentos, mas occurrences.session_key='abc123' ainda referencia

**History Consolidation**: Copiar autorizações de sessão antiga para nova

- Sem: def456 perde contexto de abc123
- Com: def456 herda histórico com rastreamento

**Soft Delete**: Marcar como deletado (orphaned_at) em vez de realmente deletar

- Benefício: Auditoria preservada
- Limpeza: 30 dias depois com hard-delete

---

## 🚨 Warnings

1. ⚠️ **Crítico**: Fase 3 (Engine) NÃO pode rodar com dados corrompidos
2. ⚠️ **Crítico**: FK `ON DELETE RESTRICT` bloqueia limpeza de órfãos
3. ⚠️ **Importante**: Reprocessamento de TITA histórico cria multiplicidade
4. ⚠️ **Importante**: Dashboard mostra contagem inflada sem tratamento
5. ⚠️ **Nota**: Soft-delete requer disciplina em queries (use `WHERE orphaned_at IS NULL`)

---

## 📊 By the Numbers

| Métrica | Valor |
|---------|-------|
| % Remarcações/dia | 5-8% |
| % Deletações/dia | 1-2% |
| Órfãos/mês | 450-675 |
| Órfãos/6 meses | 2.7K-4K |
| Horas de desenvolvimento | 40h |
| Dias de desenvolvimento | 7-10 dias |
| Custo estimado | $2K |
| Risco de não fazer | $2K-3K (incidents) |

---

## ✅ Success Criteria

Após Fase 2-B ser implementada:

- ✅ 0 orphaned sessions (cco.atendimentos)
- ✅ 0 broken FK references (cco.occurrences)
- ✅ 100% mutations tracked (cco.session_mutations)
- ✅ 100% authorizations consolidated (cco.session_authorizations)
- ✅ Dashboard counts consistent (no discrepancy)
- ✅ All jobs < 30s (performance OK)
- ✅ Retention working (orphans deleted after 30d)
- ✅ Audit trail complete (full history preserved)

---

## 🤝 Getting Help

**Dúvida sobre conceito?**
→ Ver ANALISE_SESSOES_MUTANTES.md > Seção relevante

**Não sabe por onde começar?**
→ Ver SESSOES_MUTANTES_INDEX.md > "Como Usar"

**Precisa implementar?**
→ Ver SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md > Sprint relevante

**Precisa testar?**
→ Ver SESSOES_MUTANTES_DIAGNOSTICO.sql > Seção relevante

**Precisa se comunicar com stakeholder?**
→ Ver SESSOES_MUTANTES_DIAGRAMA.md > Seção visual relevante

---

## 📞 Contact

**Preparado por**: Data Warehouse Review Team  
**Data**: 2026-06-08  
**Revisão**: Pós Kick-Off Meeting

---

## 🗂️ File Structure

```
docs/
├── README_SESSOES_MUTANTES.md ..................... (este arquivo)
├── SESSOES_MUTANTES_INDEX.md ..................... (navigation)
├── SESSOES_MUTANTES_RESUMO_EXECUTIVO.md ......... (2 páginas)
├── ANALISE_SESSOES_MUTANTES.md .................. (50+ páginas, COMPLETO)
├── SESSOES_MUTANTES_DIAGRAMA.md ................. (fluxos visuais)
├── SESSOES_MUTANTES_DIAGNOSTICO.sql ............ (queries validação)
├── SESSOES_MUTANTES_ROADMAP_IMPLEMENTACAO.md ... (sprints, 40h)
└── SESSOES_MUTANTES_PROXIMOS_PASSOS.md ......... (ações imediatas)
```

---

**Status**: 🟢 Pronto para Implementação  
**Prioridade**: 🔴 CRÍTICA  
**Bloqueador**: Fase 3  

**Próximo Passo**: Leia RESUMO_EXECUTIVO agora.

---

*Para feedback ou correções, contate Data Warehouse Team.*
