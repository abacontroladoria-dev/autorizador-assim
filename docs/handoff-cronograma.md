# Handoff — Módulo Cronograma (Equalizador + Solicitações)

> Abra este chat com acesso a **dois** diretórios:
> - `C:\Users\Maquina001\sistema-pulsar` — app Next.js (código atual, integrado)
> - `C:\Users\Maquina001\jsx-cronograma` — app JSX original (fonte de verdade da lógica de negócio)
>
> O `jsx-cronograma` é essencial: quando uma sugestão parece errada, a comparação
> com a implementação original (`src/utils/runAlgorithm.js`, `src/views/Cronograma/index.jsx`,
> `src/views/Solicitacoes/index.jsx`) é o principal instrumento de diagnóstico.

---

## 1. O que foi feito

O sistema `jsx-cronograma` (React SPA standalone) foi **portado integralmente** para dentro
do `sistema-pulsar` (Next.js 16 App Router, TypeScript). A migração criou dois módulos:

| Módulo | Rota | Sidebar |
|---|---|---|
| Cronograma \| Solicitações | `/cronograma/solicitacoes?tab=<key>` | Ícone Lightbulb |
| Cronograma \| Equalizador | `/cronograma/ocupacao?tab=<key>` | Ícone TrendingUp |

---

## 2. Arquitetura geral

```
frontend/
├── app/(dashboard)/cronograma/
│   ├── solicitacoes/page.tsx      ← monta SolicitacoesShell em Suspense
│   └── ocupacao/page.tsx          ← monta OcupacaoShell em Suspense
│
├── components/cronograma/
│   ├── ocupacao/
│   │   ├── OcupacaoShell.tsx      ← shell do Equalizador (estado, algorithm, modais)
│   │   ├── SugCard.tsx            ← card de sugestão individual
│   │   ├── CronModal.tsx          ← modal cronograma do paciente
│   │   └── tabs/
│   │       ├── VagasAgoraTab.tsx  ← aba 📋 Vagas Agora (com filtros)
│   │       ├── FilaEsperaTab.tsx  ← aba ⏳ Fila de Espera
│   │       ├── RecusadosTab.tsx   ← aba ❌ Recusados
│   │       ├── InviavelTab.tsx    ← aba ⛔ Inviáveis
│   │       ├── GapsTab.tsx        ← aba 📊 Gaps de autorização
│   │       ├── GuiaTab.tsx        ← aba 📖 Guia (estático)
│   │       └── ConfigTab.tsx      ← aba ⚙️ Config (token API + prioridades)
│   └── solicitacoes/
│       ├── SolicitacoesShell.tsx  ← shell do módulo Solicitações (tabs via URL)
│       ├── SaidaProfMode.tsx      ← aba Saída de Profissional (E1/E2/E3)
│       ├── SaidaCronModal.tsx     ← modal de cronograma no módulo saída
│       ├── DadosUploadPanel.tsx   ← painel de upload CSV + laudos
│       └── BancoDadosTab.tsx      ← aba Banco de Dados
│
├── contexts/
│   └── CronogramaDataContext.tsx  ← estado global compartilhado (cRows, lRows, rec, inv, waMap, cfg)
│
├── lib/cronograma/
│   ├── runAlgorithm.ts            ← ALGORITMO PRINCIPAL (port de runAlgorithm.js)
│   ├── saida.ts                   ← lógica buildSaidaAnalise (port de Solicitacoes/index.jsx)
│   ├── constants.ts               ← todas as constantes + REGRAS_LEGENDA
│   ├── helpers.ts                 ← pm(), fm(), waKey(), fmtName(), getRefWeek() …
│   ├── novoCronograma.ts          ← lógica da aba Novo Cronograma
│   └── xlsx.ts                    ← exportBase() (exporta rec+inv+waMap para Excel)
│
└── types/cronograma.ts            ← todos os tipos TypeScript do módulo
```

### Estado global — `CronogramaDataContext`

```ts
// Lido/escrito por todos os shells e tabs via useCronogramaData()
cRows    : CsvRow[]        // grade de profissionais (CSV da API TitaTherapy)
lRows    : LaudoRow[]      // relatório de laudos (Excel)
dispRows : DispRow[]       // disponibilidade (CSV do Órbita) — usado em Solicitações
rec      : RecItem[]       // recusados registrados (persistido em localStorage)
inv      : InvItem[]       // inviáveis registrados (persistido em localStorage)
waMap    : WaMap           // status WA por sugestão (persistido em localStorage)
cfg      : CfgState        // config (musicoCap, terapiasPrio, apiToken…)
savedAt  : string | null   // hora do último save no localStorage
```

Chave de localStorage: `aba_v8` (constante `SK` em `constants.ts`).

---

## 3. Fluxo de dados — Equalizador

```
[Upload CSV]  →  setCRows  →  CronogramaDataContext
[Upload XLS]  →  setLRows  →  CronogramaDataContext
                                      │
                              OcupacaoShell.tsx
                              useEffect([cRows,lRows,rec,inv,cfg,waMap])
                              setTimeout 50ms → runAlgorithm(...)
                                      │
                              AlgorithmResult {
                                vagasAgora: Sugestao[]   → VagasAgoraTab
                                filaEspera: Sugestao[]   → FilaEsperaTab
                                allGaps:    Gap[]        → GapsTab
                                agendRows:  CsvRow[]     → CronModal
                                ...
                              }
```

### Chave WA

```ts
// helpers.ts
export function waKey(s: Sugestao): string {
  return `${s.pac}|||${s.prof}|||${s.dia}|||${s.hora}`
}
```

Status possíveis: `"aguardando" | "aceito" | "resolvido" | "recusado" | "inviavel" | "pendente"`

---

## 4. Arquivos originais (jsx-cronograma) para referência

| Arquivo original | Equivalente portado |
|---|---|
| `src/utils/runAlgorithm.js` | `frontend/lib/cronograma/runAlgorithm.ts` |
| `src/views/Cronograma/index.jsx` | `frontend/components/cronograma/ocupacao/OcupacaoShell.tsx` + tabs |
| `src/views/Solicitacoes/index.jsx` | `frontend/components/cronograma/solicitacoes/SolicitacoesShell.tsx` + `saida.ts` |
| `src/constants/cronograma.js` | `frontend/lib/cronograma/constants.ts` |
| `src/utils/helpers.jsx` | `frontend/lib/cronograma/helpers.ts` |

---

## 5. Regras de negócio críticas

### R5.1 — Nunca intervalo entre sessões clínicas (REGRA FIXA)

Uma sessão clínica seguida de slot vazio seguida de nova sessão clínica **não é admitida**.

- Slots válidos: 08:00 / 08:40 / 09:20 / 10:00 / 10:40 / 11:20 (manhã) e 13:00 / 13:40 / 14:20 / 15:00 / 15:40 / 16:20 / 17:00 (tarde)
- Sessões consecutivas têm exatamente 40 min de diferença. Qualquer diferença ≠ 40 min = gap inválido.
- A verificação deve ocorrer no **dia de origem** (após remoção) **e** no **dia de destino** (após inserção).
- Ao checar gap no dia de origem, **excluir** a sessão que está sendo removida da lista.

### R2.1 — Mínimo 2 sessões clínicas por dia (PERMITE EXCEÇÃO)

Um paciente não pode ter apenas 1 sessão clínica em um único dia.

- Verificar tanto o dia de origem (após remoção) quanto o dia de destino (após inserção).
- Se o dia de destino teria 0 sessões antes da inserção → a nova sessão ficaria isolada → **INVÁLIDO**.
- Exceções devem ser registradas manualmente (não automatizáveis).

### Estratégias E1 / E2 / E3 — módulo Saída de Profissional

| Estratégia | Descrição | Validações |
|---|---|---|
| **E1** | Substituição direta — mesmo dia/hora, profissional diferente | Nenhuma (não altera rotina) |
| **E2** | TA em outro dia/horário | Origem: `!buracoSiRemover` + `!min2Violation`. Destino: `temSessaoNoDia(newDia)` + `semGapNoDestino(newDia, newHora)` |
| **E3** | Terapia complementar no mesmo slot | Gap ≥ 1 entre autorizado e ofertado na especialidade |

Implementadas em `frontend/lib/cronograma/saida.ts` (`buildSaidaAnalise()`).

### Regras de convênio

| Convênio | AE/HS simultâneo com AC |
|---|---|
| ASSIM Saúde, Gratuidade, Particular | NÃO elegíveis |
| SULAMERICA, BRADESCO, PORTO SEGURO, UNIMED, AMIL, LEVE SAÚDE | Elegíveis |

### Prioridades P1–P5

| P | Critério |
|---|---|
| P1 | Liminar + convênio não-ASSIM/LEVE |
| P2 | Outro convênio, sem judicial |
| P3 | Liminar + ASSIM |
| P4 | ASSIM, sem judicial |
| P5 | LEVE SAÚDE |

---

## 6. Tipos principais (`types/cronograma.ts`)

```ts
interface Sugestao {
  mod:     "Musicoterapia" | "Ocupação" | "Foco Prof."
  regra:   string          // "R1" | "R2" | "R3" | "R4" | "Ocup. R2" | "Condicional" | "Sup. Deslocável"
  prof:    string
  esp:     string
  tP:      string          // terapia original (ex: "Musicoterapia")
  unidade: string
  dia:     string
  hora:    string
  pac:     string
  prio:    1 | 2 | 3 | 4 | 5
  gap:     number          // gap de autorização
  conv:    string          // convênio
  vComp:   string          // vaga complementar (texto)
  isRem?:  boolean         // é remanejamento (R4)
  isPP?:   boolean         // prioridade de profissional
}

interface AlgorithmResult {
  vagasAgora:  Sugestao[]
  filaEspera:  Sugestao[]
  allGaps:     Gap[]
  agendRows:   CsvRowProcessada[]
  semanaRef:   string
  cM:          Record<string, string>   // convênio por paciente
  fxM:         Record<string, string>   // faixa etária por paciente
  altaCount:   number
  tPrioAtivas: string[]
}

interface AlgorithmConfig {
  waMap?:         WaMap
  judicialMap?:   Record<string, string>
  musicoCap?:     Record<string, Record<string, number>>
  terapiasPrio?:  string[]
  profsPrioExtras?: string[]
  isolarAssim?:   boolean
}
```

---

## 7. Estado atual do código (o que já está feito)

### Passos concluídos

| Passo | O que foi feito |
|---|---|
| 1 | Setup do projeto Next.js, contexto `CronogramaDataContext`, tipos, constantes |
| 2 | `runAlgorithm.ts` portado e tipado |
| 3 | `saida.ts` portado (`buildSaidaAnalise`, lógica E1/E2/E3) |
| 4 | Componentes de card (`SugCard`, `PBadge`, `UnitBadges`) |
| 5 | `OcupacaoShell.tsx` + 7 tabs do Equalizador; `SolicitacoesShell.tsx` + tabs |
| 6 | Sidebar: grupos "Cronograma \| Solicitações" (Lightbulb) e "Cronograma \| Equalizador" (TrendingUp) com navegação URL-driven (`?tab=<key>`) |

### Code review aplicado (sessão anterior)

Os seguintes fixes foram aplicados após code review:

1. **`hasPermission.ts`** — `recepcao` ganhou `'cronograma_solicitacoes'` para alinhar com o que `proxy.ts` já permitia
2. **`FilaEsperaTab.tsx` / `VagasAgoraTab.tsx`** — prop `sugsByPac` removida (era declarada mas nunca usada)
3. **`Sidebar.tsx`** — import morto `CalendarClock` removido
4. **`helpers.ts`** — `waKey()` centralizado (era duplicado em 3 arquivos)
5. **`constants.ts`** — `REGRAS_LEGENDA` adicionado como fonte única das 7 regras (R1–Sup. Deslocável)
6. **`GuiaTab.tsx` / `ConfigTab.tsx`** — removidos arrays locais `GUIDE_RULES` / `RULES_INFO`; ambos importam `REGRAS_LEGENDA`

### Erro pré-existente (não relacionado ao cronograma)

```
contexts/ImpersonationContext.tsx(42,11): error TS2304: Cannot find name 'setIsInitialized'
```

Este erro existia antes da migração do cronograma e não afeta o módulo.

---

## 8. Objetivo do próximo chat — Testar a lógica

### O que testar

O usuário irá usar a ferramenta e **identificar sugestões errôneas** nas duas abas:

**Cronograma | Equalizador** (rota `/cronograma/ocupacao`)
- Vagas Agora (`?tab=vagas`) — sugestões R1, R2, R3, Ocup. R2
- Fila de Espera (`?tab=fila`) — sugestões R4, Condicional, Sup. Deslocável

**Cronograma | Solicitações** (rota `/cronograma/solicitacoes`)
- Saída de Profissional (`?tab=saida`) — estratégias E1, E2, E3

### Como diagnosticar uma sugestão errada

1. **Identificar a regra** no campo `s.regra` do card (R1, R2, R3, R4, Ocup. R2, etc.)
2. **Localizar no algoritmo portado** — `runAlgorithm.ts` — a seção correspondente
3. **Comparar com o original** — `jsx-cronograma/src/utils/runAlgorithm.js` — buscar pela mesma regra
4. **Checar as validações** de gap e mínimo de sessões se for sugestão de destino:
   - O paciente já tem sessões no dia de destino? (`R2.1`)
   - A inserção cria gap no dia de destino? (`R5.1`)
   - A remoção cria gap no dia de origem? (`R5.1`)

### Padrões de bug mais prováveis no port

| Padrão | Onde investigar |
|---|---|
| Sugestão em dia sem outras sessões do paciente | `runAlgorithm.ts` — verificação `temSessaoNoDia` |
| Sugestão criando gap entre sessões | `runAlgorithm.ts` — lógica `semGapNoDestino` / `buracoSiRemover` |
| Sugestão ignorando recusado | `runAlgorithm.ts` — `recSet` e `isRec()` |
| Sugestão para paciente inviável | `runAlgorithm.ts` — `invSet` |
| Prioridade errada no card | `helpers.ts` — `gPrio()` |
| E2 sugerindo dia sem sessões | `saida.ts` — `buildSaidaAnalise()` validação `temSessaoNoDia(newDia)` |
| E2 criando gap no destino sem excluir a sessão original | `saida.ts` — `semGapNoDestino()` (deve excluir a sessão removida) |

### Estrutura do runAlgorithm.ts por seção

```
runAlgorithm()
├── Processamento CSV → agend[], livre[]
├── Processamento Laudos → qtdAut{}, cM{}, fxM{}, altaSet
├── Cálculo oferta → qtdOf{}
├── Cálculo gaps → allGaps[], gM{}
├── Filtros recusados/inviáveis → recSet, invSet
├── Reservas WA → reservasWa (slots reservados para quem já está aguardando WA)
├── Módulo Musicoterapia
│   ├── R1 — completar slots existentes do musicoterapeuta
│   ├── R2 — slot livre adjacente a sessão do paciente
│   ├── R3 — dia novo (com vaga complementar)
│   └── R4 — remanejamento (→ filaEspera)
└── Módulo Ocupação (todas as especialidades exceto EXCLUIR_OCUP)
    ├── Ocup. R2 — slot livre adjacente
    ├── Condicional — (→ filaEspera)
    └── Sup. Deslocável — (→ filaEspera)
```

---

## 9. Permissões por papel (sidebar)

| Papel | Vê Equalizador | Vê Solicitações |
|---|---|---|
| admin | ✅ | ✅ |
| diretoria | ✅ | ✅ |
| recepcao | ❌ | ✅ |
| demais | ❌ | ❌ |

Controlado por `hasPermission.ts` → `roleDefaults` → código `ocupacao_clinica` / `cronograma_solicitacoes`.

---

## 10. Navegação de tabs (URL-driven)

### Equalizador

| Tab | URL param |
|---|---|
| Vagas Agora | `?tab=vagas` |
| Fila de Espera | `?tab=fila` |
| Recusados | `?tab=recusados` |
| Inviáveis | `?tab=inviavel` |
| Gaps | `?tab=gaps` |
| Guia | `?tab=guia` |
| Config | `?tab=config` |

### Solicitações

| Tab | URL param |
|---|---|
| Simulação de Novo Prestador | `?tab=simulacao` |
| Saída de Profissional | `?tab=saida` |
| Aumentar Ocupação (Profissional) | `?tab=ocup-prof` |
| Aumentar Ocupação (Paciente) | `?tab=ocup-pac` |
| Novo Cronograma | `?tab=novo-cron` |
| Banco de Dados | `?tab=banco` |

A URL é validada em cada Shell contra a constante `TABS`. Tabs inválidas fazem redirect para o default (`vagas` no Equalizador).
