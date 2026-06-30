# Arquitetura — Ocupação por Paciente (`OcupPacMode.tsx`)

> **Contexto:** este documento descreve a arquitetura do card de sugestões do módulo
> "Aumentar Ocupação (Paciente)" (`/cronograma/solicitacoes?tab=ocup-pac`).
> Foi escrito após uma investigação que reconstruiu uma alteração de UI perdida antes
> de ser commitada, e que levantou a pergunta: *"por que existe `espAlts` se já temos `profAlts`?"*

---

## 1. Diferença entre `espAlts` e `profAlts`

São dimensões ortogonais — não redundantes.

| Campo | O que representa | Exemplo |
|---|---|---|
| `profAlts` | Outros **profissionais** para a **mesma terapia** neste slot | Slot livre às 08:00: Prof A (Fonoaudiologia) e Prof B (Fonoaudiologia) |
| `espAlts` | Outras **terapias** (especialidades) disponíveis neste **mesmo slot** | Slot livre às 08:00: Fonoaudiologia (maior gap) e T. Ocupacional (segundo maior) |

A confusão é natural porque cada `EspAlt` também carrega `profAlts`. A hierarquia é:

```
Sugestao
├── tP / prof / unidade          ← terapia default (maior gap)
├── profAlts: ProfAlt[]          ← outros profs para ESSA terapia
└── espAlts: EspAlt[]            ← outras terapias para ESSE slot
    └── EspAlt
        ├── tP / prof / unidade  ← prof default daquela terapia alternativa
        └── profAlts: ProfAlt[]  ← outros profs para AQUELA terapia alternativa
```

---

## 2. Como `buildSugestoes` produz `espAlts` e `profAlts`

```
Para cada slot (dia × hora):

  1. Coleta todas as CsvRows com Status="Livre" que cobrem gaps do paciente
     → allFreeRows

  2. Agrupa por especialidade → byEspRows[esp] = [row1, row2, ...]

  3. Ordena especialidades por déficit efetivo (gap − já proposto) desc
     → eligibleEsps

  4. Para cada esp elegível, chama buildEntry(esp):
       primaryRow = byEspRows[esp][0]          → tP, prof, unidade da Sugestao
       altRows    = byEspRows[esp][1…]         → profAlts (mesmo esp, outros profs)
       returns EspAlt { esp, tP, prof, unidade, profAlts, vComp, vCompAlts }

  5. defaultEntry = primeiro buildEntry() válido   → campos raiz da Sugestao
     altEntries   = restantes buildEntry() válidos → espAlts

  6. Emite Sugestao { ..., profAlts: defaultEntry.profAlts, espAlts: altEntries }
```

### Invariante de construção

> **Todo `tP` em `espAlts` e `profAlts` vem de uma `CsvRow` real com `Status="Livre"`
> e um `Profissional` real.** Não existe terapia elegível sem profissional correspondente.
> `allEsps` e `allProfs` no render são a única fonte de verdade — não adicione campo
> derivado separado.

---

## 3. Estado de seleção no render

O `TodasSugestoesModal` mantém dois índices independentes por `sugestao.id`:

```ts
espSelIdx:  Record<string, number>   // qual terapia está ativa (default = 0)
profSelIdx: Record<string, number>   // qual profissional está ativo (default = 0)
```

A função `getActiveEspData(s)` resolve a terapia ativa:

```ts
function getActiveEspData(s: Sugestao): EspAlt {
  const i = espSelIdx[s.id] ?? 0
  if (i === 0 || !s.espAlts[i - 1]) return { esp: s.esp, tP: s.tP, ... }
  return s.espAlts[i - 1]
}
```

A função `getActiveEntry(s)` resolve o profissional ativo dentro da terapia ativa:

```ts
function getActiveEntry(s): { tP, prof, unidade } {
  const ed  = getActiveEspData(s)        // terapia ativa
  const idx = profSelIdx[s.id] ?? 0
  if (idx === 0 || !ed.profAlts[idx - 1]) return { tP: ed.tP, prof: ed.prof, ... }
  return ed.profAlts[idx - 1]
}
```

### Regra de reset ao trocar terapia

Ao selecionar uma terapia alternativa, o profissional é redefinido para o primeiro
da nova terapia:

```ts
onClick={() => {
  setEspSelIdx(prev => ({ ...prev, [mainSug.id]: i }))
  setProfSelIdx(prev => ({ ...prev, [mainSug.id]: 0 }))  // ← reset
  setSelIdx(prev => ({ ...prev, [mainSug.id]: {} }))      // ← reset vComp
}}
```

Se o reset não ocorresse, `profSelIdx = 2` ao trocar de terapia apontaria para
o índice 2 da `profAlts` da nova terapia — que pode não existir ou ser um profissional
de outra especialidade.

---

## 4. Estrutura do card inline na grade

O card vive diretamente nas células da tabela de horários (não num painel lateral).
Layout por linha:

| Linha | Conteúdo | Condição |
|---|---|---|
| Ícones overlay | `✓` (selecionado) · `🚫` (recusado) | absolute top-right |
| **Linha 1** | `terapia ativa` (esquerda) · `📍 unidade` (direita) | sempre |
| **Linha 2** | `profissional ativo` (truncado) | apenas colapsado |
| Dropdown prof | lista radio animada (`maxHeight` transition) | `altCount > 0` e expandido via "N profs." |
| Dropdown terapia | lista radio animada (`maxHeight` transition) | `espAltCount > 0` e expandido via "N terapias" |
| `isDisc` | `⚠ unidade` em laranja | inconsistência de unidade detectada |
| **Rodapé** | triggers dropdown · status label · "Recusar" · "↺" | sempre (se clickable) |

Os dois dropdowns são **mutuamente exclusivos** na abertura: abrir um fecha o outro
(`setExpandedProfCardId(null)` / `setExpandedEspCardId(null)`).

---

## 5. Derivações no render

```ts
// Construídas a cada render do card — não persistidas em estado
const mainEd      = getActiveEspData(mainSug)
const allProfs    = [{ prof: mainEd.prof, tP: mainEd.tP, ... }, ...mainEd.profAlts]
const allEsps     = [{ esp: mainSug.esp, tP: mainSug.tP }, ...mainSug.espAlts.map(...)]
const altCount    = allProfs.length - 1    // profs alternativos
const espAltCount = allEsps.length  - 1   // terapias alternativas
```

`allProfs` e `allEsps` são computadas inline — são apenas views sobre o estado
imutável de `sugestoes`, atualizadas automaticamente quando `espSelIdx`/`profSelIdx` mudam.

---

## 6. Evolução: painel "Propostas" → card inline

| Versão | Interação |
|---|---|
| Antiga | Painel lateral "Propostas" mostrava lista de sugestões com checkboxes; dropdown de terapia e profissional eram elementos separados fora do card. |
| Atual | Painel removido. Toda interação ocorre inline no card dentro da grade. Aceitar/recusar usa "Action Bar" contextual que aparece quando há seleção. |

O commit de remoção do painel é `3cafaa8 refactor(OcupPacMode): remove painel Propostas, adiciona Action Bar contextual`.

A lógica de negócio (`buildSugestoes`, `getActiveEntry`, `getActiveEspData`) não mudou
com a remoção do painel — apenas a superfície de renderização foi alterada.

---

## 7. O que não mudar sem entender as implicações

| Ponto de atenção | Risco |
|---|---|
| Reset de `profSelIdx` ao trocar `espSelIdx` | Sem o reset, `getActiveEntry` aponta para prof de outra terapia |
| Mutuamente exclusivo dos dropdowns | Abrir os dois ao mesmo tempo pode estourar o layout da célula da grade |
| Restrição de `profAlts` à mesma unidade em `dia-novo` | `buildEntry` filtra `profAlts` por unidade para não sugerir dois profs em unidades diferentes no mesmo dia (`R5.4`) |
| `effDif` desconta `proposedOf` | Garantia de que o mesmo gap não é preenchido duas vezes na mesma rodada de `buildSugestoes` |
