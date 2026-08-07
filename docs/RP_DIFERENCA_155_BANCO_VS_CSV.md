# /rp — a diferença de R$ 155,00 entre a grade do banco e o upload do CSV

**Competência:** julho/2026 · **Tela:** `/relacionamento-prestador/rp` · **Apurado em:** 07/08/2026

---

## Resumo

Na tela, o total lido do banco mostrava **R$ 318.520,00** e o total do upload do CSV
**R$ 318.675,00** — R$ 155,00 de diferença.

**Os dois caminhos estão corretos e produzem o mesmo número.** Rodando o código atual sobre o
mesmo arquivo, banco e upload dão **R$ 318.520,00**, 111 profissionais, diferença **R$ 0,00** em
todas as especialidades. Os R$ 318.675,00 são o resultado do código **anterior** às correções: são
duas versões de código, não duas versões do dado.

Os R$ 155,00 são pagamento indevido que o caminho do CSV fazia e o do banco nunca fez. Não é o
banco que está a menos; é o CSV que estava a mais.

---

## Como foi apurado

Um harness carrega os módulos TypeScript reais da aplicação (transpilados em memória) e injeta um
cliente PostgREST sobre `fetch` no lugar de `@/lib/supabase/client`. Com isso ele chama as
**mesmas funções da tela**, sem reimplementar nada:

- `buscarGradeParaRP()` — `lib/remuneracao/gradeRemuneracao.ts`
- `normalizarGradeParaSessao()` / `classificarSessaoReal()` — `lib/remuneracao/relatorio.ts`
- `buscarPresencaFilaAutorizacoes()` — `lib/remuneracao/presencaReal.ts`
- `calcularRemuneracaoReal()` — `lib/remuneracao/calculo.ts`

A primeira versão do harness reproduzia o mapeamento banco→planilha à mão e por isso passou a
medir uma versão do código que não existia mais. A lição vale para qualquer conferência futura:
**chame a função, não a copie.**

Resultado:

```
período 2026-07-01 a 2026-07-31
vw_grade_base: 18914 linhas | CSV: 19064 linhas
cobertura 99.70%  inativasAgendadas=0

BANCO : 111 profissionais  R$ 318.520,00
UPLOAD: 111 profissionais  R$ 318.520,00
DIFF  : 0 prof                  R$ 0,00
```

### Descartando as hipóteses alternativas

**Não é arquivo diferente.** Os três exports disponíveis, sob o código atual:

| Arquivo | Linhas | Profissionais | Total |
|---|---|---|---|
| `csv_grade_profissionais_20260701_a_20260731.csv` | 19.064 | 111 | R$ 318.520,00 |
| `csv_grade_profissionais_20260701_a_20260803.csv` | 19.079 | 111 | R$ 317.870,00 |
| `csv_grade_profissionais_20260701_a_20260803 (1).csv` | 19.079 | 111 | R$ 317.870,00 |

Nenhum produz R$ 318.675,00.

**Não é export desatualizado.** A última tratativa de julho é o mesmo instante nos dois lados —
banco `2026-08-05T13:11:51+00:00`, CSV `2026-08-05 10:11:51` (BRT). Nada de julho entrou depois
disso, então um export tirado hoje sairia idêntico.

**Não é o banco somando inconsistência.** As classes `Evolução sem presença`, `Cancelado evoluído`,
`Evolução sem agendamento` e `Evolução em conflito` caem no `eInc` de
[calculo.ts:971](../frontend/lib/remuneracao/calculo.ts#L971) e não tocam `valorConfirmado`.
Verificado também o único caminho pelo qual uma inconsistência poderia render dinheiro —
`diasPorEsp` (diária/PPD) recebe a data **antes** da checagem `eInc` e só exclui cancelado, então
um dia cujas únicas sessões fossem inconsistentes viraria diária cheia. Em julho isso é **zero
dias, R$ 0,00**.

---

## Decomposição dos R$ 155,00

| Profissional | Antes | Depois | Δ | Causa |
|---|---:|---:|---:|---|
| Ingrid Cristina Mello da Costa Dutra | 4.350 | 4.320 | −30 | conflito de autoria 2906012 |
| Elisangela Motta Do Valle | 11.650 | 11.620 | −30 | conflito de autoria 2906012 |
| Vivian Menendes dos Santos | 13.685 | 13.650 | −35 | evolução salva 2× |
| Gabrielly De Souza Silveira Dos Reis | 5.400 | 5.370 | −30 | evolução salva 2× |
| Elaine Ferreira Nunes | 2.130 | 2.100 | −30 | falta não descontada |
| | | | **−155** | |

---

## Causa 1 — a TiTa emite uma linha por *tratativa*, não por agendamento (R$ 125)

O relatório `csv_grade_profissionais` de julho tem **19.064 linhas para 14.816 agendamentos
distintos**. Cinco agendamentos aparecem duas vezes, um por evolução lançada. O caminho do CSV
somava PA por linha, então pagava duas vezes. A tabela `csv_grades_profissionais` guarda **uma
linha por `tita_agendamento_id`**, e por isso o caminho do banco nunca teve esse defeito.

| ID Agendamento | Quando | Terapia | Autoria | Intervalo | Antes → Depois |
|---|---|---|---|---|---|
| 2906012 | 01/07 08:00 | Psicopedagogia | **Ingrid** e **Elisangela** | 2min51 | R$ 60 → R$ 0 |
| 2941773 | 06/07 07:30 | Aplicador ABA Escola | Juliana, 2× | 12s | R$ 0 → R$ 0 |
| 2304308 | 10/07 13:00 | Terapia Ocupacional | Vivian, 2× | 3s | R$ 70 → R$ 35 |
| 2941774 | 13/07 07:30 | Aplicador ABA Escola | Juliana, 2× | 41s | R$ 0 → R$ 0 |
| 2323639 | 20/07 09:20 | Fonoaudiologia | Gabrielly, 2× | 2min11 | R$ 60 → R$ 30 |

Os dois casos da Juliana valem R$ 0 porque `Aplicador ABA Escola` está em
`ESPECIALIDADES_SEM_PA` — remunera por diária, e a duplicata não cria um dia novo.

### Regra implementada

`agruparPorAgendamento()` em `lib/remuneracao/relatorio.ts` agrupa por `ID Agendamento`, conta
quantas evoluções e **de quantas pessoas distintas**, mantém a linha de tratativa mais recente e
descarta o resto. A classificação passou a ter duas classes novas:

- **`Evolução em conflito`** — pessoas diferentes evoluíram o mesmo agendamento. Só uma atendeu e o
  sistema não sabe qual: **ninguém recebe** até alguém decidir. Está no `eInc`.
- **`Evolução duplicada`** — a mesma pessoa salvou duas vezes (duplo clique). A autoria é certa,
  então **paga — uma vez só**. Não está no `eInc`; existe para o ruído aparecer na conferência.

`Evolução em conflito` é avaliada antes de tudo em `classificarSessaoReal()`, porque a dúvida é
sobre a autoria, que é o que decide o pagamento. `Evolução duplicada` vem depois de `Substituição`,
porque ali o rótulo precisa dizer quem recebe.

### Por que o banco precisou de colunas novas

A tabela colapsa em uma linha por agendamento — a segunda evolução **sobrescreveu** a primeira.
Sem contador, o banco não teria como saber que houve duas e classificaria como evolução normal. A
migration `20260807120000` adicionou `tratativas` e `tratativas_distintas`, preenchidas pelo sync,
e `buscarGradeParaRP` as expõe como `"Tratativas"` / `"Tratativas Distintas"`. As duas fontes
chegam ao mesmo resultado por caminhos diferentes: no upload a repetição **é** a repetição de
linhas; no banco, é a contagem.

---

## Causa 2 — paginação sem ordenação total no índice de presença (R$ 30)

`buscarPresencaFilaAutorizacoes()` monta o índice de presença lendo `fila_autorizacoes` em páginas
de 1.000 via `.range()`. `range` vira `LIMIT/OFFSET`, e **sem `ORDER BY` o Postgres não promete a
mesma sequência entre as páginas**: uma linha pode nunca ser devolvida.

Medido contra produção em julho/2026: **8.413 linhas em 9 páginas devolviam 7.071 distintas —
1.342 perdidas (16%), de forma reprodutível.**

Isso custa dinheiro porque o fallback é otimista: sessão ausente do índice é tratada como
**presente** (ver `presencaDaSessao`). Falta perdida = sessão paga.

Caso concreto — agendamento **1942469**, Mirella Azevedo Coutinho, 27/07 08:40, Fonoaudiologia,
Elaine Ferreira Nunes:

```
grade : status_execucao = "Realizado", possui_tratativa = true
fila  : status = "falta", falta_revertida_em = null
```

A recepção registrou falta; a grade diz realizado e evoluído. Com o índice completo a sessão vira
`Evolução sem presença` e não paga.

**Correções:** `.order("id")` nas duas funções de `presencaReal.ts` (`id` é uuid — ordem sem
significado, mas total), e as duas passaram a **lançar exceção** em vez de devolver o índice pela
metade. O comportamento antigo era pior que o erro: logava `{}` e seguia calculando folha com dado
faltando. A mensagem também ficou legível — `PostgrestError` traz tudo em propriedades não
enumeráveis, então `console.error("...", error)` imprimia `{}`.

---

## O que mudou no código

| Arquivo | Mudança |
|---|---|
| `lib/remuneracao/relatorio.ts` | `agruparPorAgendamento()`; `tratativas`/`tratativasDistintas` em `SessaoReal`; classes `Evolução duplicada` e `Evolução em conflito` |
| `lib/remuneracao/calculo.ts` | `Evolução em conflito` no `eInc`; `PROFS_IGNORAR` aplicado em `calcularRemuneracaoReal` |
| `lib/remuneracao/presencaReal.ts` | `.order("id")`; erro legível; lança em vez de devolver índice parcial |
| `lib/remuneracao/gradeRemuneracao.ts` | `nomesCanonicos()`; colunas de tratativa no `RP_FIELDS`; veredicto com `resumo`/`dica`/`quantidade` |
| `lib/grade/fonte.ts` | `medirSaudeGrade()` e `VIEW_INATIVAS` |
| Migrations `20260806120000`, `20260807100000`, `20260807110000`, `20260807120000` | reativação de linha passada, `ausencia_confirmada_em`, view sem resíduo de semeadura, contadores de tratativa |
| `scripts/conferir-grade-vs-tita.js` | conferência CSV × banco, campo a campo |

Correções relacionadas, apuradas no mesmo trabalho e já aplicadas:

- **`nomesCanonicos()`** — a TiTa grava o mesmo `profissional_id` com grafias diferentes em
  `profissional_nome` e `tratativa_profissional_nome` (id 17586: 133× "Nicolly Christine da Silva
  Alcantara", 88× "Nicolly Alcantara"). Como o cálculo agrupa por **nome**, as 88 sessões viravam
  "Substituição" creditada a alguém que não existe no cadastro, e a pessoa real ficava com R$ 0,00.
- **Resíduo de semeadura** — 116 linhas `origem = 'backup_xls'` sem `tita_agendamento_id` em julho,
  93 delas colidindo com slots que a TiTa marca `Livre`. Removidas da `vw_grade_base` pela
  migration `20260807110000`. Valiam R$ 360 indevidos.

---

## Verificação depois do deploy

1. `/rp`, julho/2026, carregar do banco → **R$ 318.520,00**, 111 profissionais.
2. Subir `csv_grade_profissionais_20260701_a_20260731.csv` → o mesmo **R$ 318.520,00**.
3. Conferir os cinco da tabela de decomposição, nome por nome.
4. `node scripts/conferir-grade-vs-tita.js <csv> 2026-07-01 2026-07-31` → "Nenhuma sessão pagável
   divergente" e **1** divergência de campo (o 2906012, que é real).

Se a tela insistir em R$ 318.675,00 depois de `Ctrl+Shift+R`, é cache de módulo do dev server, não
cálculo — derrube o `next dev` e suba de novo.

---

## Em aberto

- **Agendamento 2906012** — quem atendeu a Antonella Da Silva Cardoso em 01/07 08:00, Ingrid ou
  Elisangela? Enquanto ninguém decidir, nenhuma das duas recebe. É o comportamento correto, não o
  definitivo. Resolver é editar a tratativa na TiTa; o sync traz na próxima rodada.
- **44 linhas ativas que a TiTa não reporta mais** (todas com execução nula). Não pagam nada — o
  passe de execução deixa intocada a linha cujo id a TiTa não devolve. Inflacionam `agendadas`.
  Inativá-las é o que o congelamento de grade passada proíbe, e a proibição está certa; elas saem
  no relatório do script de conferência.
