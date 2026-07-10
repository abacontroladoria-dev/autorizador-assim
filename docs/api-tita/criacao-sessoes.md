# Criação de sessões — API TiTa

Documenta a configuração real usada pelo fluxo de **implantação de sessões** (Ocupação
de Paciente → agenda oficial na TiTa). Baseado em chamadas reais confirmadas na
Sprint 2.1 de homologação — onde o comportamento observado diverge do PDF
"Integração - Documentação API TITA.pdf", o real prevalece e está anotado abaixo.

Implementação de referência: [`frontend/services/tita/`](../../frontend/services/tita/),
consumida pela rota [`frontend/app/api/tita/confirmar-agendamento/route.ts`](../../frontend/app/api/tita/confirmar-agendamento/route.ts).

> A edge function `supabase/functions/agendamento-terapia-tita/` é um stub antigo
> (`throw new Error("not_implemented")` em `tita-api.ts`, `payload.ts` e
> `mappings.ts`) — não é o fluxo em produção. Não usar como referência.

---

## Endpoint

```
POST {TITA_API_URL}/integracao/agendamento/create
```

Precedido por uma checagem de disponibilidade:

```
POST {TITA_API_URL}/integracao/get_disponibilidade
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `TITA_API_URL` | Base URL da API. Default no código: `https://apiv2.apptita.com.br/api` |
| `TITA_TOKEN` | Token de integração, enviado no header `X-INTEGRACAO-TOKEN` |

⚠️ O token contém `$` — no `.env.local` precisa ser escapado como `\$`
(senão o `@next/env` corrompe o valor e a TiTa responde "token inválido"). Na
Vercel, cadastrar o valor cru, sem escape. Ver [`reference_tita_token_dotenv_escape`](../../).

## Autenticação

```http
Content-Type: application/json
X-INTEGRACAO-TOKEN: {TITA_TOKEN}
```

Implementado no ponto único de saída HTTP: [`client.ts`](../../frontend/services/tita/client.ts) (`postTita`).

---

## Payload de `agendamento/create`

```ts
interface AgendamentoTitaPayload {
  data_inicial: string        // YYYY-MM-DD
  data_final: string          // YYYY-MM-DD
  id_grade_terapeuta: number
  ids_favorecidos: number[]   // array — não "id_favorecido" singular (diverge do PDF)
  id_sala: number
  frequencia: number          // 1 = Mensal, 2 = Quinzenal, 4 = Semanal
  id_tipo_agenda: number
  id_terapia_clinica: number
  id_terapia_exibicao: number
}
```

### Constantes fixas do projeto

| Campo | Valor | Onde |
|---|---|---|
| `id_tipo_agenda` | `92` | `ID_TIPO_AGENDA` em [`payload.ts`](../../frontend/services/tita/payload.ts) |
| `frequencia` | `4` (Semanal) | `FREQUENCIA_SEMANAL` em [`payload.ts`](../../frontend/services/tita/payload.ts) |
| `data_final` | `"2026-12-31"` | `DATA_FINAL_FIXA` em [`payload.ts`](../../frontend/services/tita/payload.ts) — regra fixa do projeto, não derivada do ano corrente |

### Origem dos demais campos

| Campo | Fonte | Observação |
|---|---|---|
| `data_inicial` | `grade.data` (a própria data do slot consultado, normalizada para `YYYY-MM-DD`) | A página de Ocupação de Paciente já sugere slots no mês seguinte; **não** pular mais um mês |
| `id_grade_terapeuta` | `grade_profissionais_tita.grade_terapeuta_id` | Resolvido por `profissional_id + data + hora_inicial` (chave validada com ~21 mil linhas reais, sem colisão) |
| `ids_favorecidos` | `[idFavorecido]` — `csv_grades_profissionais.paciente_id` de uma linha `"Agendado"` do mesmo paciente | O slot "Livre" que originou o agendamento sempre tem `paciente_id` nulo |
| `id_sala` | `grade_profissionais_tita.id_sala` | **Não** vem de `csv_grades_profissionais` |
| `id_terapia_clinica` | `csv_grades_profissionais.terapia_id` do slot | |
| `id_terapia_exibicao` | `grade_profissionais_tita.terapia_exibicao_id`, com fallback | Ver fallback abaixo |

**Por que `id_sala` e `id_terapia_exibicao` vêm de `grade_profissionais_tita` e não de
`csv_grades_profissionais`:** validado com dados reais que `terapia_exibicao_id` é
`NULL` em 100% das linhas `"Livre"` de `csv_grades_profissionais`, e que `terapia_id`
não mapeia 1:1 para `terapia_exibicao_id` (ex.: "Psicologia" aparece com 3
`terapia_exibicao_id` distintos) — não é seguro inferir a partir de `terapia_id`.

**Fallback de `terapia_exibicao_id`:** ~9% das grades "Livre" têm o campo sincronizado
diretamente (achado real: em agosto/2026, 3073 de 3194 slots vinham com
`terapia_exibicao_id` nulo, embora `id_sala` estivesse 100% presente). Quando nulo,
busca-se o valor em outra data do **mesmo** `grade_terapeuta_id` — só é aceito se
houver exatamente um valor distinto (98,2% dos `grade_terapeuta_id` mapeiam para um
único `terapia_exibicao_id`). Se ambíguo ou nunca sincronizado, permanece `null` e o
agendamento é bloqueado — nunca se adivinha o valor, pois sala/terapia errada criaria
um agendamento incorreto na TiTa. Ver [`resolverGradeTerapeuta`](../../frontend/services/tita/mappings.ts).

---

## Fluxo de implantação (3 fases, tudo ou nada por bundle)

Orquestrado em [`route.ts`](../../frontend/app/api/tita/confirmar-agendamento/route.ts).
As fases rodam em sequência para o bundle inteiro de sessões — nenhuma fase começa até
a anterior confirmar todas. **Não é atômico entre fases**: se a Fase 3 falhar na
sessão N, as sessões 1..N-1 já criadas na TiTa não têm rollback automático.

### Fase 1 — Preparação (`prepararAgendamento`)

Busca a grade, resolve `id_grade_terapeuta` / `id_sala` / `terapia_exibicao_id` /
`id_favorecido` e monta o payload — **sem** chamar a TiTa. Qualquer dado
ausente/inconsistente cancela a sessão antes de qualquer efeito colateral externo.

### Fase 2 — Disponibilidade (`get_disponibilidade`)

```ts
interface DisponibilidadeRequest {
  data_inicial: string
  data_final: string
  id_grade_terapeuta: number
  ids_favorecidos: number[]
}
```

Resposta real (não documentada no PDF, que só dizia "Resposta: JSON"):

```ts
interface DisponibilidadeResponse {
  total_horarios: number
  horarios_ocupados: number
  horarios_livres: number
  percentual: number
}
```

Cobre **toda a série semanal** entre `data_inicial` e `data_final`, não um booleano
simples. `horarios_livres > 0` só decide se vale a pena chamar `create` — não garante
que a série inteira ficará livre de conflito.

### Fase 3 — Criação (`agendamento/create`)

Resposta real — array com 1 elemento (1 favorecido por chamada):

```ts
interface AgendaFavorecidoTita {
  id: number
  status: string
  status_str: string
  itens: ItemAgendamentoTita[]  // { id, data, status, status_str }
}
```

**Achado da homologação: não é transacional.** A TiTa cria a série inteira e marca
cada ocorrência individualmente:

- `status_str: "Planejado"` — criada sem conflito
- `status_str: "Conflito"` — horário já ocupado por outro agendamento

Interpretado por [`interpretarResultadoCriacao`](../../frontend/services/tita/confirmar.ts),
que classifica o resultado em `success` / `partial_success` / `failed` / `erro_api`
contando `criadas` / `conflitos` / `rejeitadas`.

---

## Arquivos relacionados

| Arquivo | Responsabilidade |
|---|---|
| [`frontend/services/tita/types.ts`](../../frontend/services/tita/types.ts) | Contratos de request/response |
| [`frontend/services/tita/client.ts`](../../frontend/services/tita/client.ts) | HTTP + auth + log (`postTita`, `verificarDisponibilidade`, `criarAgendamento`) |
| [`frontend/services/tita/mappings.ts`](../../frontend/services/tita/mappings.ts) | Resolução de `id_grade_terapeuta`, `id_sala`, `terapia_exibicao_id`, `id_favorecido` |
| [`frontend/services/tita/payload.ts`](../../frontend/services/tita/payload.ts) | Montagem do payload + constantes fixas |
| [`frontend/services/tita/confirmar.ts`](../../frontend/services/tita/confirmar.ts) | Orquestração de preparo, interpretação de disponibilidade/resultado, mensagens ao usuário |
| [`frontend/app/api/tita/confirmar-agendamento/route.ts`](../../frontend/app/api/tita/confirmar-agendamento/route.ts) | Rota Next.js — as 3 fases |
| [`frontend/components/cronograma/solicitacoes/OcupPacMode.tsx`](../../frontend/components/cronograma/solicitacoes/OcupPacMode.tsx) | UI que dispara a implantação |
| [`frontend/components/cronograma/solicitacoes/ConfirmarImplantacaoModal.tsx`](../../frontend/components/cronograma/solicitacoes/ConfirmarImplantacaoModal.tsx) | Modal de confirmação antes de chamar a rota |
