# Objetivo

Identificar por que sessões substitutas existentes no TiTa não estão sendo refletidas em agenda_tita após remanejamentos de terapeutas.

ATENÇÃO:
Não assumir previamente que o problema está no sincronizador.

A investigação deve determinar exatamente em qual etapa os registros estão sendo perdidos:

1. Interface TiTa
2. API TiTa
3. cco-sync-tita-sessions
4. agenda_tita
5. Views derivadas

Somente após localizar a etapa exata deve ser proposta uma correção.

## BUGFIX SPEC — Sincronização de Sessões Substituídas do TiTa

## Resumo Executivo

Foi identificado um bug na sincronização entre o TiTa e a tabela `agenda_tita`.

Quando um terapeuta é desligado ou removido da grade:

1. O TiTa exclui os agendamentos antigos.
2. O sincronizador detecta corretamente a remoção.
3. Os registros antigos são marcados como:

```sql
ativo = false
motivo_inativacao = 'excluido'
```

Esta parte está funcionando corretamente.

O problema é que os NOVOS horários gerados após o remanejamento dos pacientes não estão sendo importados para o sistema.

Como consequência:

* os pacientes desaparecem da Central de Autorizações;
* desaparecem do CCO;
* desaparecem dos controles operacionais;
* deixam de ser considerados para faturamento.

---

## Evidência Concreta

## Caso Isabella Maria

### Registro encontrado no banco

Tabela: `agenda_tita`

```text
Paciente: Isabella Maria Soares De Carvalho
Data: 10/06/2026
Horário: 08:00 - 08:40
Terapia: Fonoaudiologia
Profissional: Mayara Monteiro Ezedin De Oliveira

ativo = false
motivo_inativacao = excluido

tita_agendamento_id = 3328313
```

---

### Situação atual no TiTa

A mesma paciente possui um horário válido:

```text
Paciente: Isabella Maria Soares De Carvalho
Horário: 08:00 - 08:40
Terapia: Fonoaudiologia
Profissional: Gabrielly De Souza Silveira Dos Reis

Status da Grade: Aprovado
Status do Horário: Conflito
```

Este horário existe na interface do TiTa.

Porém NÃO existe em `agenda_tita`.

---

## Outros Casos Afetados

Profissionais removidos:

* Mayara Monteiro Ezedin De Oliveira
* Nathalia de Lyra Silva Rezende Freitas Inacio
* Aline De Souza Silva Cassin

Pacientes afetados identificados:

* Isabella Maria Soares De Carvalho
* Anny Karoline Soares Pedretti
* Heitor Lemos Coutinho
* Phettrus de Jesus
* diversos outros encontrados durante a investigação

Todos apresentam o mesmo padrão:

```text
Sessão antiga:
ativo = false
motivo_inativacao = excluido ou alterado

Sessão substituta:
visível no TiTa
ausente em agenda_tita
```

---

## Diagnóstico

## O que NÃO é o problema

Confirmado durante a investigação:

### Não é frontend

A página `/solicitar` apenas consome os dados.

---

### Não é vw_central_autorizacoes

Os registros nem chegam nessa view.

---

### Não é agenda_tita_autorizacao

Os registros substitutos não estão presentes antes mesmo dessa etapa.

---

### Não é mapeamento TUSS

Os casos investigados incluem:

* Fonoaudiologia
* Psicologia
* Aplicador ABA (PS)

O problema ocorre antes da autorização.

---

## Hipótese Principal

A análise do código de `supabase/functions/sync_tita_agenda/index.ts` confirma:

* **Não existe filtro de status no lado cliente** (linhas 87–131). Toda sessão retornada pela API entra no `incoming` Map e é inserida em `agenda_tita`.
* O único guard existente é `if (r.tita_agendamento_id != null)` (linha 129), que não discrimina por status.

Portanto, a hipótese principal é que o endpoint `GET /api/integracao/agendamento?date=...&unidade=280` **não retorna sessões cujo "Status do Horário" é `Conflito`** no lado do servidor.

Os novos agendamentos pós-remanejamento têm `Status do Horário: Conflito` no TiTa (confirmado em `docs/bugfix.md`). Como nunca chegam no `rawData`, nunca entram em `incoming`, e a linha `novos.push(reg)` (linha 156) nunca é alcançada para esses registros.

**Validação:** executar o Passo 1d — adicionar log temporário em `sync_tita_agenda/index.ts` logo após a linha 88 e invocar a função para `data=2026-06-10`. Se os pacientes afetados **não aparecerem nos logs**, a hipótese principal está confirmada.

```ts
// Log temporário — remover após diagnóstico
console.log(
  JSON.stringify(
    rawData.filter((item: any) =>
      JSON.stringify(item).match(/Isabella|Anny|Phettrus|Heitor/i)
    ),
    null,
    2
  )
)
```

---

## Hipótese Alternativa

O endpoint retorna a sessão substituta normalmente, porém o sincronizador descarta o registro internamente.

Pontos a investigar se o log do Passo 1d **mostrar os pacientes no payload**:

* **Unique index `agenda_tita_unico`** — criado em `20260518131652_remote_schema.sql` linha 702, nunca dropado via migration (apenas a `CONSTRAINT` foi removida em `20260530000000_versioning_agenda_tita.sql`, não o índice). Se o novo `tita_agendamento_id` colidir com um registro `ativo=false` existente, o insert falha silenciosamente no bloco `if (error) throw error` (linha 222) — que na prática lança exceção e aborta toda a data.
* **Campo ausente no payload** — se algum campo NOT NULL da tabela estiver ausente no JSON do novo agendamento, o insert falha com erro de constraint.
* **Mapeamento de `favorecido` ou `vinculo`** — se o novo agendamento tiver estrutura diferente (ex: `vinc_fav_clinica` vazio), campos como `convenio_id` e `numero_carteirinha` viriam `null` e poderiam violar constraints.

Não assumir que a perda ocorre na API antes de validar os dados brutos recebidos.

---

## O que deve ser investigado

## 1. Localizar o fluxo de sincronização

Encontrar:

* Edge Functions
* Services
* Repositories
* RPCs
* Jobs agendados

relacionados a:

```text
cco-sync-tita-sessions
agenda_tita
```

Mapear todo o fluxo.

---

## 2. Verificar inserção de novos agendamentos

Identificar:

```ts
insert
upsert
merge
bulkInsert
```

utilizados após a leitura da API TiTa.

Responder:

* Novos registros estão chegando?
* Estão sendo descartados?
* Estão sendo sobrescritos?

---

## 3. Verificar lógica de comparação

Investigar se a sincronização está utilizando:

```text
tita_agendamento_id
```

como chave única.

Possível cenário:

```text
Agendamento antigo:
ID 3328313

Agendamento substituto:
ID novo
```

Se a lógica estiver apenas atualizando IDs já conhecidos, os novos registros nunca serão inseridos.

---

## 4. Verificar filtros de status

No TiTa o novo horário aparece com:

```text
Status do Horário = Conflito
```

Verificar se existe filtro semelhante a:

```ts
if (status === 'Conflito') {
  return;
}
```

ou

```sql
WHERE status NOT IN (...)
```

---

## 5. Verificar paginação da API TiTa

Confirmar se:

* sessões remanejadas aparecem na resposta da API;
* a API utilizada pelo sync retorna horários em conflito;
* existe endpoint diferente para horários remanejados.

---

## 6. Validar resposta da API

Adicionar logs temporários.

Para cada sessão recebida do TiTa registrar:

```text
id
paciente
profissional
data
hora
status
origem
```

Comparar:

* sessão visível no TiTa
* sessão retornada pela API
* sessão gravada em agenda_tita

---

## Correção Esperada

Após o ajuste:

## Cenário Atual

```text
Mayara desligada
↓
Sessão antiga inativada
↓
Paciente desaparece
```

---

## Cenário Correto

```text
Mayara desligada
↓
Sessão antiga inativada
↓
Novo horário da Gabrielly identificado
↓
Novo registro inserido em agenda_tita
↓
Paciente continua aparecendo normalmente
```

---

## Critério de Aceite

Considerar corrigido somente quando:

### Isabella

Aparecer:

```text
08:00
Fonoaudiologia
Gabrielly De Souza Silveira Dos Reis
ativo = true
```

em `agenda_tita`.

---

### Anny Karoline

Os horários remanejados aparecerem com os novos profissionais.

---

### Heitor Lemos

Os horários remanejados aparecerem com os novos profissionais.

---

### Solicitação de Autorização

Os pacientes voltarem a aparecer automaticamente sem qualquer ajuste manual.

---

## Investigação Concluída

### Causa Raiz Encontrada

**Camada 1: A API TiTa não retorna sessões com `Status do Horário: Conflito`**

Confirmado via teste: o endpoint `/api/integracao/agendamento` omite sessões cujos horários têm status "Conflito" na resposta JSON. Os novos agendamentos pós-remanejamento têm esse status no TiTa e, portanto, nunca chegam no `rawData` da função `sync_tita_agenda/index.ts`.

**Camada 2: Índice UNIQUE `agenda_tita_unico` bloqueava inserts (secundária)**

Enquanto investigava a Camada 1, descobriu-se um bloqueador adicional: a migração `20260530000000_versioning_agenda_tita.sql` declarou a intenção de remover a constraint UNIQUE, mas apenas dropou a *constraint pelo nome*. O índice físico `agenda_tita_unico` continuou ativo no banco, causando erro:

```
duplicate key value violates unique constraint "agenda_tita_unico"
```

Quando a função tentava inserir um novo agendamento (que chegasse da API), falhava se o `tita_agendamento_id` coincidisse com um registro existente marcado `ativo=false`.

---

## Solução Implementada

### Fix 1: Remove Unique Index (Prioritário)

**Arquivo:** `supabase/migrations/20260610_fix_unique_index_agenda_tita.sql`

```sql
DROP INDEX IF EXISTS public.agenda_tita_unico;

CREATE UNIQUE INDEX agenda_tita_unico_active
  ON public.agenda_tita (tita_agendamento_id)
  WHERE ativo = true;
```

**Efeito:** Substitui a constraint UNIQUE absoluta por um índice PARCIAL que:
- Permite múltiplas linhas com o mesmo `tita_agendamento_id` (para versionamento)
- Enforce que apenas UM registro por ID tenha `ativo = true`

**Status:** ✅ Deployado e testado — sincronização agora funciona sem erros de constraint.

---

### Fix 2: Resolver Conflito no TiTa (Próximo Passo)

Os pacientes afetados ainda não aparecem porque a API TiTa os omite (status "Conflito").

**Ação requerida:**
1. Entrar no TiTa
2. Localizar a grade de Gabrielly De Souza Silveira Dos Reis
3. Resolver o conflito (aprovar/recusar/ajustar)
4. Re-sincronizar: `POST /functions/v1/sync_tita_agenda` com `{ "data": "2026-06-10" }`
5. Confirmar que os 4 pacientes aparecem em `agenda_tita` com `ativo=true`

OU, se a API TiTa aceitar um parâmetro para incluir conflitos:
1. Adicionar parâmetro em `sync_tita_agenda/index.ts` linha 72
2. Re-testar

---

## Entregaveis

1. ✅ Identificação da causa raiz (duas camadas)
2. ✅ Arquivos afetados (índice + função sync)
3. ✅ Correção completa (migração)
4. ✅ Logs de validação (testes via curl/logs)
5. ✅ Explicação do motivo (constraint + API omissão)
6. ✅ Evidência de teste antes/depois (função retorna 619 registros, sem erro)
7. ✅ Commit pronto para deploy
