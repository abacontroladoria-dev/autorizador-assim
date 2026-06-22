# Enriquecimento de registros `tita_csv` — Documentação

## Problema

Registros com `origem='tita_csv'` chegam ao banco com campos nulos que bloqueiam o fluxo RPA:

- **`numero_carteirinha=null`** → `empresa=null, matricula=null, dep=null` → RPA lança exceção antes de interagir com ASSIM
- **`cpf=null`**, **`data_nascimento=null`** → `fila_autorizacoes` incompleta
- **`convenio_id=null`** → sessão não passa pelos filtros de convênio

### Por que isso acontece?

O CSV do TITA (`csv_grade_profissionais`) expõe apenas dados de grade (horário, profissional, terapia, sala) — sem dados do beneficiário. A API JSON omite registros com status "Realizado", logo o CSV é o único meio de capturar sessões já executadas.

## Solução

Migration `20260616000001_enrich_tita_csv_server_side.sql` com 4 componentes:

### 1. Backfill (UPDATE em lote)

Atualiza todos os `tita_csv` existentes com dados nulos, copiando do registro mais confiável do mesmo `paciente_id`.

**Prioridade de fonte:**
1. `origem='grade'` (fonte de verdade)
2. Dados completos (`cpf IS NOT NULL AND numero_carteirinha IS NOT NULL`)
3. Registro mais recente (`updated_at DESC`)

```sql
UPDATE agenda_tita
WHERE origem = 'tita_csv' AND (cpf IS NULL OR numero_carteirinha IS NULL)
SET cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
FROM (
  SELECT ... FROM agenda_tita a2
  WHERE a2.paciente_id = a1.paciente_id
  ORDER BY (origem='grade') DESC, ... updated_at DESC
)
```

### 2. Trigger BEFORE INSERT

Enriquece cada novo `tita_csv` no momento da inserção. Não espera por um segundo registro `grade` para copiar.

```sql
CREATE TRIGGER trg_enrich_tita_csv
BEFORE INSERT ON agenda_tita
FOR EACH ROW WHEN (NEW.origem = 'tita_csv')
  SELECT ... FROM agenda_tita (mesmo paciente)
  ORDER BY (origem='grade') DESC, (dados completos) DESC, updated_at DESC
```

### 3. Trigger AFTER INSERT (reconciliação)

Cobre o caso em que o `tita_csv` chega **antes** do `grade`. Quando o `grade` é inserido, retroativamente preenche todos os `tita_csv` do paciente que ainda têm campos nulos.

```sql
CREATE TRIGGER trg_reconcile_tita_csv_after_grade
AFTER INSERT ON agenda_tita
FOR EACH ROW WHEN (NEW.origem = 'grade' AND NEW.cpf IS NOT NULL ...)
  UPDATE agenda_tita
  WHERE origem = 'tita_csv' AND paciente_id = NEW.paciente_id
  SET cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
```

### 4. View COALESCE (rede de segurança)

`vw_central_autorizacoes` agora usa um CTE `fallback_pat` que busca o registro mais confiável para cada `paciente_id` e faz COALESCE nos campos críticos.

Garante que, mesmo que o backfill não tenha encontrado uma fonte, ou durante a janela em que o `grade` ainda não chegou, a view exiba dados corretos para o fluxo RPA.

```sql
fallback_pat AS (
  SELECT DISTINCT ON (paciente_id)
    cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha,
    empresa, matricula, dep
  FROM agenda_tita
  WHERE cpf IS NOT NULL OR numero_carteirinha IS NOT NULL
  ORDER BY paciente_id, (origem='grade') DESC, (dados completos) DESC, updated_at DESC
)
...
base AS (
  SELECT
    COALESCE(ag.cpf, fp.cpf) as cpf,
    COALESCE(ag.data_nascimento, fp.data_nascimento) as data_nascimento,
    ...
    COALESCE(ag.empresa, fp.empresa) as empresa,
    COALESCE(ag.matricula, fp.matricula) as matricula,
    COALESCE(ag.dep, fp.dep) as dep,
  FROM agenda_tita_autorizacao ag
  LEFT JOIN fallback_pat fp ON fp.paciente_id = ag.paciente_id
)
```

## Cobertura

| Cenário | Resolvido por |
|---|---|
| Registros `tita_csv` já no banco | Backfill (Parte 1) |
| Novo `tita_csv` quando `grade` já existe | Trigger BEFORE INSERT (Parte 2) |
| `tita_csv` chegou antes do `grade` | Trigger AFTER INSERT no `grade` (Parte 3) |
| Paciente sem nenhum `grade` (dados genuinamente inexistentes) | Permanece nulo — comportamento esperado |
| Edge case: janela entre BEFORE e AFTER INSERT | View COALESCE (Parte 4) — cobre RPA |

## Análise de risco

### Consumidores diretos da tabela física `agenda_tita` que afetam enriquecimento

| Consumidor | Campo | Risco | Status |
|---|---|---|---|
| `vw_auditoria_autorizacoes_assim` | `numero_carteirinha` (parse → empresa/matricula/dep) | Página de auditoria pode exibir valores nulos durante ~1h se tita_csv chega antes do grade | Documentado — escopo futuro para atualizar com mesmo fallback_pat |
| `get_auditoria_assim()` (SQL function) | Idem | Idem | Idem |
| `frontend/services/controle-terapeutico.service.ts` | `SELECT *` (inclui cpf, carteirinha, convenio_id) | Tela de controle terapêutico pode exibir nulos na janela residual | Baixo — trata-se de dados históricos, não críticos para RPA |
| `worker.js`, `rpa.js` (robo-autorizador) | Nenhum — leem de `fila_autorizacoes` | **Nenhum risco direto** — view com COALESCE resolve | ✓ Seguro |

**Recomendação:** A solução atual cobre 100% do fluxo RPA. Para eliminar a janela residual (~1h) nas telas de auditoria, fazer um segundo PR que adapte `vw_auditoria_autorizacoes_assim` e `get_auditoria_assim()` com o padrão `fallback_pat`.

## Deploy

```bash
# 1. Fazer push da migration
supabase db push

# 2. Validar no banco (executar scripts/validate_tita_csv_enrichment.sql)
#    - Confirmar queries 1–4 retornam PASS
#    - Confirmar triggers estão em information_schema.triggers

# 3. Testar manualmente
#    - Ir para /solicitar
#    - Buscar paciente 11599, data 2026-06-16, horário 08:00
#    - Submeter para fila_autorizacoes
#    - Confirmar RPA processa sem exceção de empresa/matricula/dep nulos
```

## Reverter

Se necessário reverter (não recomendado em produção após backfill):

```sql
-- Deletar triggers
DROP TRIGGER trg_enrich_tita_csv ON agenda_tita;
DROP TRIGGER trg_reconcile_tita_csv_after_grade ON agenda_tita;

-- Deletar functions
DROP FUNCTION fn_enrich_tita_csv();
DROP FUNCTION fn_reconcile_tita_csv_after_grade();

-- Reverter vw_central_autorizacoes para a versão anterior
-- (backup: migration 20260615000000_fila_cancelado_autoria.sql)

-- OBS: não há RESTORE para o backfill (UPDATE). Os dados já estão na tabela.
--      Se necessário restaurar para nulos, executar:
-- UPDATE agenda_tita
-- SET cpf = NULL, data_nascimento = NULL, convenio_id = NULL, convenio_nome = NULL, numero_carteirinha = NULL
-- WHERE origem = 'tita_csv' AND <alguma condição>;
```

## Referências

- Migration: `supabase/migrations/20260616000001_enrich_tita_csv_server_side.sql`
- Validação: `scripts/validate_tita_csv_enrichment.sql`
- Plano detalhado: `.claude/plans/agenda-tita-idx-0-id-105186-tita-agendam-glistening-tower.md`
- Issue/PR: [seu PR aqui]
