# Plano: Migração do Módulo "Aumentar Ocupação Clínica" → sistema-pulsar

## Contexto Geral

O `jsx-cronograma` (`C:\Users\Maquina001\jsx-cronograma`) é uma SPA React/Vite com dois módulos principais que compartilham os mesmos dados de upload:

| Módulo | Status |
|---|---|
| **Solicitações** (6 submenus) | ✅ Migrado — rota `/cronograma/solicitacoes` |
| **Aumentar Ocupação Clínica** (7 submenus + Dados) | ⏳ **Pendente — este plano** |

O sistema de destino é `C:\Users\Maquina001\sistema-pulsar\frontend` (Next.js 16 + TypeScript + shadcn/ui + Tailwind).

---

## O que já existe no sistema-pulsar

### Infraestrutura reutilizável (já criada)

| Arquivo | O que faz |
|---|---|
| `frontend/types/cronograma.ts` | `CsvRow`, `LaudoRow`, `DispRow`, `WaMap`, `WaStatus`, `Sugestao`, `Gap`, `AlgorithmResult`, etc. |
| `frontend/lib/cronograma/constants.ts` | `B`, `HORAS_GRID`, `DIAS_LIST`, `DIAS_ORD`, `ESP_CLINICO`, `EXCLUIR_OCUP`, `PBADGE`, `PL`, `SK`, `SK_SAIDA`, `splitWaKey`, `reservasAtivasFromWa`, `tCor`, `TERAPIA_CORES`, `REGRAS_NOVO_CRON`, `DIA_COLS_DISP` |
| `frontend/lib/cronograma/helpers.ts` | `pm`, `fm`, `fmtName`, `exU`, `cFx`, `gPrio`, `getTurno`, `isLaudoComAlta`, `getRefWeek`, `buildCronoUnitMeta`, `shouldShowSessionUnit`, `unidadeBadgeText`, `UnitMeta`, `DayMeta` |
| `frontend/lib/cronograma/runAlgorithm.ts` | `runAlgorithm(cRows, lRows, rec, inv, cfg)` → `AlgorithmResult` |
| `frontend/lib/cronograma/saida.ts` | `buildSaidaAnalise()` (Saída de Profissional — não usado neste módulo) |
| `frontend/lib/cronograma/novoCronograma.ts` | `buildNewCronograma()` (Novo Cronograma — não usado neste módulo) |
| `frontend/components/cronograma/ui/UnitBadges.tsx` | `UnitHeaderBadges`, `CronoGlobalUnitBadge` |
| `frontend/components/cronograma/solicitacoes/DadosUploadPanel.tsx` | Upload de Grade CSV + Laudos XLSX + Disponibilidade CSV |

### O que ainda NÃO existe e é necessário para este módulo

| Arquivo a criar | Origem no jsx-cronograma |
|---|---|
| `frontend/lib/cronograma/xlsx.ts` | `src/utils/xlsx.js` — `exportBase`, `parseHistoricoXlsx` |
| `frontend/components/cronograma/ocupacao/SugCard.tsx` | `src/components/cronograma/index.jsx` — `SugCard` |
| `frontend/components/cronograma/ocupacao/CronModal.tsx` | `src/components/cronograma/index.jsx` — `CronModal` + `CronCard` |
| `frontend/components/cronograma/ocupacao/OcupacaoShell.tsx` | `src/views/Cronograma/index.jsx` — orquestração dos tabs |
| `frontend/components/cronograma/ocupacao/VagasAgoraTab.tsx` | Submenu `tab==="vagas"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/FilaEsperaTab.tsx` | Submenu `tab==="fila"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/RecusadosTab.tsx` | Submenu `tab==="rec"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/InviavelTab.tsx` | Submenu `tab==="inv"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/GapsTab.tsx` | Submenu `tab==="gaps"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/GuiaTab.tsx` | Submenu `tab==="guia"` do mesmo arquivo |
| `frontend/components/cronograma/ocupacao/ConfigTab.tsx` | Submenu `tab==="cfg"` do mesmo arquivo |
| `frontend/app/(dashboard)/cronograma/ocupacao/page.tsx` | Página principal do módulo |

---

## Problema do Upload Compartilhado

### Situação atual
A `solicitacoes/page.tsx` tem seu próprio `DadosUploadPanel` com estado local (`cRows`, `lRows`, `dispRows`).

### Problema
O módulo "Aumentar Ocupação Clínica" precisa dos **mesmos** `cRows` e `lRows`, mais:
- `dispRows` (já existe no painel de Solicitações)
- `rec`, `inv`, `waMap`, `cfg` (estado persistido no localStorage — específico deste módulo)
- Upload de **Importar Base XLSX** (novo — não existe em Solicitações)

Se cada módulo tiver seu próprio upload, o usuário terá que carregar o mesmo CSV duas vezes.

### Solução recomendada: Contexto Compartilhado no Layout

Criar `frontend/app/(dashboard)/cronograma/layout.tsx` com um `CronogramaDataProvider` que:
1. Mantém `cRows`, `lRows`, `dispRows` em estado React
2. Persiste `rec`, `inv`, `waMap`, `cfg` no localStorage (chave `SK = "aba_v8"`)
3. Expõe tudo via `useCronogramaData()` hook
4. Renderiza o `DadosUploadPanel` (com o 4.º dropzone "Importar Base") acima do conteúdo de ambas as páginas

A `solicitacoes/page.tsx` existente será refatorada para consumir o context em vez de ter estado local.

```
frontend/
├── app/(dashboard)/cronograma/
│   ├── layout.tsx                        ← NOVO: CronogramaDataProvider + DadosUploadPanel
│   ├── solicitacoes/
│   │   └── page.tsx                      ← REFATORAR: remover useState local, usar useContext
│   └── ocupacao/
│       └── page.tsx                      ← NOVO: página do módulo Ocupação
├── contexts/
│   └── CronogramaDataContext.tsx         ← NOVO: Context + Provider + hook
└── components/cronograma/
    ├── solicitacoes/
    │   └── DadosUploadPanel.tsx          ← REFATORAR: adicionar 4.º dropzone "Importar Base"
    └── ocupacao/
        ├── OcupacaoShell.tsx
        ├── SugCard.tsx
        ├── CronModal.tsx
        ├── VagasAgoraTab.tsx
        ├── FilaEsperaTab.tsx
        ├── RecusadosTab.tsx
        ├── InviavelTab.tsx
        ├── GapsTab.tsx
        ├── GuiaTab.tsx
        └── ConfigTab.tsx
```

---

## Os 8 Submenus do Módulo

O módulo original usa `tab` (string) para controlar qual submenu é exibido. No sistema-pulsar, usar `?tab=` na URL (mesmo padrão que Solicitações).

| Tab (id original) | Label | Depende de | O que faz |
|---|---|---|---|
| `dados` | 📂 Dados da Rodada | — | Upload + painel de resultados (vira o layout compartilhado) |
| `vagas` | 📋 Vagas Agora | `runAlgorithm` → `vagasAgora` | Lista de sugestões com filtros + SugCard |
| `fila` | ⏳ Fila de Espera | `runAlgorithm` → `filaEspera` | Vagas que exigem coordenação prévia |
| `rec` | ❌ Recusados | `rec[]` (localStorage) | Tabela de recusas + botão exportar base |
| `inv` | ⛔ Inviáveis | `inv[]` (localStorage) | Tabela de inviáveis + botão exportar base |
| `gaps` | 📊 Gaps | `runAlgorithm` → `allGaps` | Tabela de gaps com filtros (faltando/ok/sobre-agendado) |
| `guia` | 📖 Guia | — | Conteúdo estático: regras R1–R4, como registrar, WA |
| `cfg` | ⚙️ Config | `cfg` (localStorage) | Prioridades P1–P5 + token API TitaTherapy + botão Buscar da API |

---

## Estado Persistido no localStorage

### Chave principal: `SK = "aba_v8"` (já exportado em `constants.ts`)

```typescript
interface PersistedState {
  rec: RecItem[]       // recusas registradas
  inv: InvItem[]       // inviáveis registrados
  waMap: WaMap         // status WhatsApp: "pac|||prof|||dia|||hora" → WaStatus
  cfg: CfgState        // terapias prio, musicoCap, token API, etc.
  savedAt: string      // timestamp da última gravação
}
```

### Chave secundária: `SK_PREENCHER = "aba_preencher_v1"` (já em `PreencherProfTab.tsx`)

O `waMap` do Ocupação e do PreencherProfTab são **mesclados** na inicialização:
```typescript
// lógica de merge que já existe no original:
const waInicial = { ...waFromPreencher, ...waFromSK }  // SK_PREENCHER tem menor prioridade
```

### Tipos novos a adicionar em `types/cronograma.ts`

```typescript
export interface RecItem {
  paciente: string
  profissional: string
  especialidade: string
  unidade: string
  dia: string
  hora: string
  registradoEm: string
}

export interface InvItem {
  paciente: string
  motivo: string
  registradoEm: string
}

export interface CfgState {
  terapiasPrio: string[]
  profsPrioExtras: string[]
  musicoCap: Record<string, Record<string, number>>
  judicialMap: Record<string, string>
  isolarAssim: boolean
  apiToken: string
}
```

---

## Componentes-Chave: Mapeamento e Notas de Conversão

### `SugCard` (`src/components/cronograma/index.jsx` linhas 107–151)
- Props: `s: Sugestao`, `waStatus: WaStatus | null`, `onWA`, `onWAUndo`, `onWAStatus`, `onRec`, `onInv`, `onCron`, `fila?: boolean`
- Visual: fundo muda por `s.mod` (Musicoterapia → roxo, Ocupação → azul, Foco Prof. → verde)
- Botões: Oferecer via WA / Aceito / Recusou / Inviável / Desfazer envio / Ver cronograma
- `PBadge` → usar `PBADGE[s.prio]` de `constants.ts` (já disponível)

### `CronModal` (`src/components/cronograma/index.jsx` linhas 29–103)
- Props: `pac: string`, `sugsDosPac: Sugestao[]`, `agendRows: CsvRowProcessada[]`, `onClose: () => void`
- Monta grade semanal com sessões existentes + sugestões sobrepostas (verde = novo, laranja = remanejada, cinza = existente)
- Usa `buildCronoUnitMeta`, `UnitHeaderBadges`, `CronoGlobalUnitBadge` — já disponíveis em `helpers.ts` e `UnitBadges.tsx`
- `CronCard` é sub-componente local dentro do mesmo arquivo

### `OcupacaoShell`
- Barra de 7 tabs horizontais (igual ao `SolicitacoesShell`)
- Tab ativa via `searchParams.get("tab")`, padrão `"vagas"`
- Recebe: `res: AlgorithmResult | null`, `rec`, `inv`, `waMap`, `cfg` e callbacks de mutação

### `VagasAgoraTab`
- Filtros: `fPac` (input), `fProf` (input), `fUnid` (multi-select), `fEsp` (multi-select), `fPr` (multi-select de P1–P5), `fWa` (select: todos/pendente/aguardando/aceito)
- Renderiza lista de `SugCard`
- `MultiSelect` do original → substituir por `<select multiple>` ou componente shadcn `Popover+Checkbox`

### `GapsTab`
- Filtros: `gapSearch` (input), `gapEsp` (select), `gapFilt` (botões: todos/faltando/ok/sobre), `gapTudoZero` (checkbox)
- Tabela com colunas: Paciente / Especialidade / Autorizado / Ofertado / Diferença
- Badge colorido para gap positivo (vermelho), negativo (âmbar), zero (verde)

### `ConfigTab`
- Painel de prioridades P1–P5 (exibição estática com `PBADGE`)
- Campo de token da API (`cfg.apiToken`) + botão "Buscar da API"
- A busca da API faz POST para `${API_BASE}/integracao/csv_grade_profissionais` com `{data_inicio, data_fim}` e header `X-INTEGRACAO-TOKEN`
- `getRefWeek()` já disponível em `helpers.ts` — retorna `{label, inicio, fim}`

---

## `lib/cronograma/xlsx.ts` — A criar

Porta direta de `src/utils/xlsx.js`:

```typescript
// exportBase(rec, inv, waMap) → baixa "base_recusados_inviáveis.xlsx"
// parseHistoricoXlsx(file, cb) → lê abas "Recusados", "Inviáveis"/"Base", "Status WA"
// Usa SheetJS (já disponível: import * as XLSX from "xlsx")
// Usa splitWaKey de constants.ts
```

---

## `DadosUploadPanel` — Refatoração

Adicionar **4.º dropzone** "Importar Base (XLSX exportado)":
- `accept=".xlsx"`
- `parseFile` chama `parseHistoricoXlsx` e retorna `{rec, inv, waMap}`
- O callback `onImport({rec, inv, waMap})` é passado pelo layout/context

O painel atualizado terá 4 dropzones em grid `2×2`:
1. Grade Profissionais (CSV)
2. Relatório de Laudos (XLSX)
3. Importar Base (XLSX exportado) — **NOVO**
4. Disponibilidade — CSV Órbita

---

## Navegação: Sidebar

Adicionar grupo "Aumentar Ocupação Clínica" no `Sidebar.tsx`:

```typescript
// Em CODIGO_PARA_ROTAS:
ocupacao_clinica: ["/cronograma/ocupacao"],

// Em pathIconMap:
"/cronograma/ocupacao?tab=vagas": LayoutGrid,       // ou similar
"/cronograma/ocupacao?tab=fila": Clock,
"/cronograma/ocupacao?tab=rec": XCircle,
"/cronograma/ocupacao?tab=inv": Ban,
"/cronograma/ocupacao?tab=gaps": BarChart2,
"/cronograma/ocupacao?tab=guia": BookOpen,
"/cronograma/ocupacao?tab=cfg": Settings,

// Em hasPermission.ts:
ocupacao_clinica: roles que podem acessar (admin, diretoria, recepcao)
```

---

## Plano de Implementação — Passo a Passo

### Passo 1 — Tipos e utilitários
1. Adicionar `RecItem`, `InvItem`, `CfgState` em `types/cronograma.ts`
2. Criar `lib/cronograma/xlsx.ts` com `exportBase` e `parseHistoricoXlsx`

### Passo 2 — Contexto Compartilhado
1. Criar `frontend/contexts/CronogramaDataContext.tsx`:
   - Estado: `cRows`, `lRows`, `dispRows`, `rec`, `inv`, `waMap`, `cfg`, `savedAt`
   - Init do localStorage: ler `SK` para rec/inv/waMap/cfg; mesclar `SK_PREENCHER` no waMap
   - Callbacks: `setCRows`, `setLRows`, `setDispRows`, `onImport`, `sRec`, `sInv`, `sWa`, `sCfg`, `persist`
   - Hook: `export function useCronogramaData()`
2. Criar `frontend/app/(dashboard)/cronograma/layout.tsx`:
   - Envolve filhos com `CronogramaDataProvider`
   - Renderiza `DadosUploadPanel` (4 dropzones) acima do `{children}`
3. Refatorar `frontend/app/(dashboard)/cronograma/solicitacoes/page.tsx`:
   - Remover `useState` local de `cRows/lRows/dispRows`
   - Usar `useCronogramaData()` para obter esses valores

### Passo 3 — Página e navegação
1. Criar `frontend/app/(dashboard)/cronograma/ocupacao/page.tsx` (placeholder)
2. Adicionar permissão `ocupacao_clinica` em `hasPermission.ts`
3. Adicionar grupo "Aumentar Ocupação Clínica" no `Sidebar.tsx` com 7 MenuItems

### Passo 4 — Componentes reutilizáveis
1. Criar `components/cronograma/ocupacao/CronModal.tsx` (`CronCard` + `CronModal`)
2. Criar `components/cronograma/ocupacao/SugCard.tsx`

### Passo 5 — Shell + Tabs (submenu por submenu)
1. `OcupacaoShell.tsx` — tab bar + roteamento por `?tab=`
2. `VagasAgoraTab.tsx` — filtros + lista de SugCard
3. `FilaEsperaTab.tsx` — banner laranja + lista de SugCard com `fila={true}`
4. `RecusadosTab.tsx` — tabela de rec + botão exportar base
5. `InviavelTab.tsx` — tabela de inv + botão exportar base
6. `GapsTab.tsx` — filtros + tabela de gaps
7. `GuiaTab.tsx` — conteúdo estático (regras R1–R4, WA, entre rodadas)
8. `ConfigTab.tsx` — P1–P5 + token + botão Buscar da API
9. Wiring de tudo na `ocupacao/page.tsx`

### Passo 6 — Modais globais
1. Modal "Registrar Recusa" (Dialog shadcn) — ativado pelo `onRec` do `SugCard`
2. Modal "Marcar Inviável" (Dialog shadcn) — ativado pelo `onInv` do `SugCard`
3. Ambos vivem no `OcupacaoShell` (ou no layout)

---

## Arquivos do jsx-cronograma a Ler

| Arquivo | O que tem |
|---|---|
| `src/views/Cronograma/index.jsx` | App completo do módulo Ocupação (linhas 1–562) |
| `src/components/cronograma/index.jsx` | `CronCard`, `CronModal`, `SugCard` |
| `src/utils/runAlgorithm.js` | Algoritmo (já migrado em `runAlgorithm.ts`) |
| `src/utils/xlsx.js` | `exportBase`, `parseHistoricoXlsx` |
| `src/constants/cronograma.js` | `DEFAULT_MCAP` — cap de slots por musicoterapeuta |
| `src/utils/helpers.jsx` | `getRefWeek` (já migrado em `helpers.ts`) |

---

## Regras de Negócio a Preservar

### runAlgorithm — inputs e outputs
```typescript
runAlgorithm(
  cRows: CsvRow[],
  lRows: LaudoRow[],
  rec: RecItem[],
  inv: InvItem[],
  cfg: { waMap: WaMap; isolarAssim: boolean; terapiasPrio: string[]; profsPrioExtras: string[]; musicoCap: Record<string, Record<string, number>>; judicialMap: Record<string, string> }
): AlgorithmResult
// AlgorithmResult: { vagasAgora, filaEspera, allGaps, agendRows, altaCount, semanaRef, tPrioAtivas }
```

O algoritmo é re-rodado automaticamente via `useEffect` sempre que `cRows`, `lRows`, `rec`, `inv` ou `cfg` mudam.

### WA key format
`"${pac}|||${prof}|||${dia}|||${hora}"` — 4 partes, mesmo padrão usado em `splitWaKey`.

### Slot reservado por WA
- Quando status é `"aguardando"`, o slot fica reservado para esse paciente
- Outros pacientes não devem ser sugeridos para o mesmo slot na mesma rodada
- Lógica em `runAlgorithm.ts` via `reservasAtivasFromWa(waMap)`

### Sistema de Prioridade P1–P5
- P1: Liminar + Convênio não-ASSIM/LEVE (máxima urgência)
- P2: Outro convênio, sem judicial
- P3: Liminar + ASSIM
- P4: ASSIM sem judicial
- P5: LEVE (por último)
- Determinado por `gPrio(conv, plano)` em `helpers.ts`

### Merge do waMap
No carregamento inicial, mesclar `SK_PREENCHER` (PreencherProf) com `SK` (Ocupação), sendo o SK de maior prioridade:
```typescript
const waFromSK = JSON.parse(localStorage.getItem(SK) || "{}")?.waMap || {}
const waFromPreencher = JSON.parse(localStorage.getItem(SK_PREENCHER) || "{}") || {}
const waInicial = { ...waFromPreencher, ...waFromSK }
```

---

## Verificação (Checklist Final)

1. `tsc --noEmit` sem erros novos
2. Upload de Grade CSV → `cRows` populado, visível em **ambas** as páginas (Solicitações e Ocupação)
3. Upload de Laudos XLSX → `lRows` populado
4. `runAlgorithm` roda → contadores aparecem em Vagas Agora e Fila de Espera
5. Clicar "Oferecer via WA" → card muda para "⏳ Aguardando WA"
6. Clicar "Aceito" → card fica esmaecido (opacity 0.5)
7. Clicar "❌ Recusou" → entrada aparece na aba Recusados; próxima rodada não sugere o par
8. Clicar "⛔ Inviável" → entrada aparece na aba Inviáveis; paciente bloqueado
9. "📥 Exportar base" → baixa XLSX com abas Recusados / Inviáveis / Status WA
10. "Importar Base" → carrega XLSX exportado, mescla com base existente sem duplicatas
11. Config: token salvo no localStorage; "Buscar da API" preenche `cRows` sem upload manual
12. Sidebar: grupo "Aumentar Ocupação Clínica" com 7 itens navegáveis
13. Trocar de aba Solicitações → Ocupação sem ter que reupar o CSV

---

## Notas de Adaptação Visual

| jsx-cronograma | sistema-pulsar |
|---|---|
| `background: "white"` inline | `bg-card` |
| `color: B.navy` inline | Manter `style={{ color: B.navy }}` (cor semântica de terapia) |
| `MultiSelect` customizado | `<select multiple>` ou Popover+Checkbox shadcn |
| Modais inline `position:fixed` | `<Dialog>` do shadcn (`components/ui/dialog.tsx`) |
| `PBadge` do ui/index.jsx | Usar `PBADGE[prio]` de `constants.ts` inline |
| Btn helper local | `<Button variant="outline" size="sm">` do shadcn |
| `<Empty>` helper local | Div com border dashed + texto centralizado |
| `fontFamily: "inherit"` em botões | Não necessário — herda Geist do layout |
