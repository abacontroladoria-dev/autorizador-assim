# Plano de Integração: "Aumentar Ocupação Clínica" → sistema-pulsar

## Contexto

O módulo **Aumentar Ocupação Clínica** existe hoje no `jsx-cronograma` (SPA React/Vite) e precisa ser migrado para o `sistema-pulsar` (Next.js 16 + TypeScript + shadcn/ui + Tailwind), seguindo o mesmo padrão já adotado pelo módulo Solicitações.

A infraestrutura base (tipos, constantes, helpers, algoritmo) já foi migrada. Este plano cobre os 13 arquivos novos e 3 refatorações necessários para completar a migração.

---

## Arquivos de Origem (jsx-cronograma)

| Arquivo | Conteúdo relevante |
|---|---|
| `src/views/Cronograma/index.jsx` | App completo do módulo Ocupação (linhas 1–562) |
| `src/components/cronograma/index.jsx` | `CronCard`, `CronModal`, `SugCard` |
| `src/utils/xlsx.js` | `exportBase`, `parseHistoricoXlsx` |
| `src/constants/cronograma.js` | `DEFAULT_MCAP` — cap de slots por musicoterapeuta |

## Infraestrutura Já Disponível no sistema-pulsar

| Arquivo | O que fornece |
|---|---|
| `frontend/types/cronograma.ts` | `CsvRow`, `LaudoRow`, `DispRow`, `WaMap`, `WaStatus`, `Sugestao`, `Gap`, `AlgorithmResult` |
| `frontend/lib/cronograma/constants.ts` | `B`, `HORAS_GRID`, `DIAS_LIST`, `SK`, `SK_SAIDA`, `PBADGE`, `splitWaKey`, `reservasAtivasFromWa`, etc. |
| `frontend/lib/cronograma/helpers.ts` | `pm`, `fm`, `getTurno`, `getRefWeek`, `buildCronoUnitMeta`, `gPrio`, etc. |
| `frontend/lib/cronograma/runAlgorithm.ts` | `runAlgorithm(cRows, lRows, rec, inv, cfg)` → `AlgorithmResult` |
| `frontend/components/cronograma/ui/UnitBadges.tsx` | `UnitHeaderBadges`, `CronoGlobalUnitBadge` |
| `frontend/components/cronograma/solicitacoes/DadosUploadPanel.tsx` | Upload de Grade CSV + Laudos XLSX + Disponibilidade CSV |

---

## Estrutura de Arquivos a Criar/Alterar

```
frontend/
├── types/
│   └── cronograma.ts                              ← ALTERAR: adicionar RecItem, InvItem, CfgState
├── lib/cronograma/
│   └── xlsx.ts                                    ← CRIAR: exportBase + parseHistoricoXlsx
├── contexts/
│   └── CronogramaDataContext.tsx                  ← CRIAR: provider + hook useCronogramaData()
├── app/(dashboard)/cronograma/
│   ├── layout.tsx                                 ← CRIAR: CronogramaDataProvider + DadosUploadPanel
│   ├── solicitacoes/
│   │   └── page.tsx                               ← REFATORAR: remover useState local
│   └── ocupacao/
│       └── page.tsx                               ← CRIAR: wiring final
└── components/cronograma/
    ├── solicitacoes/
    │   └── DadosUploadPanel.tsx                   ← REFATORAR: adicionar 4.º dropzone
    └── ocupacao/
        ├── OcupacaoShell.tsx                      ← CRIAR
        ├── SugCard.tsx                            ← CRIAR
        ├── CronModal.tsx                          ← CRIAR
        ├── VagasAgoraTab.tsx                      ← CRIAR
        ├── FilaEsperaTab.tsx                      ← CRIAR
        ├── RecusadosTab.tsx                       ← CRIAR
        ├── InviavelTab.tsx                        ← CRIAR
        ├── GapsTab.tsx                            ← CRIAR
        ├── GuiaTab.tsx                            ← CRIAR
        └── ConfigTab.tsx                          ← CRIAR
```

---

## Passo 1 — Tipos e Utilitários

**Objetivo:** estabelecer a base de tipos e a camada de I/O XLSX antes de qualquer componente.

### 1.1 — `frontend/types/cronograma.ts` (adições)

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

### 1.2 — `frontend/lib/cronograma/xlsx.ts` (novo)

Porta direta de `src/utils/xlsx.js`:

- `exportBase(rec, inv, waMap)` → baixa `"base_recusados_inviáveis.xlsx"` com 3 abas: Recusados, Inviáveis, Status WA
- `parseHistoricoXlsx(file, cb)` → lê as mesmas 3 abas e retorna `{rec, inv, waMap}`
- Usa SheetJS (`import * as XLSX from "xlsx"`) e `splitWaKey` de `constants.ts`

**Dependência:** nenhuma.

---

## Passo 2 — Contexto Compartilhado de Dados

**Objetivo:** eliminar o reupload duplo — `cRows/lRows/dispRows` ficam disponíveis para Solicitações e Ocupação via um único provider no layout.

### 2.1 — `frontend/contexts/CronogramaDataContext.tsx` (novo)

Estado gerenciado:

| Estado | Persistência | Descrição |
|---|---|---|
| `cRows` | memória | Linhas do Grade CSV |
| `lRows` | memória | Linhas do Laudos XLSX |
| `dispRows` | memória | Linhas da Disponibilidade CSV |
| `rec` | `localStorage[SK]` | Recusas registradas |
| `inv` | `localStorage[SK]` | Inviáveis registrados |
| `waMap` | `localStorage[SK]` | Status WhatsApp por slot |
| `cfg` | `localStorage[SK]` | Configurações (prioridades, token, etc.) |

Init do localStorage:
```typescript
const waFromSK = JSON.parse(localStorage.getItem(SK) || "{}")?.waMap || {}
const waFromPreencher = JSON.parse(localStorage.getItem(SK_PREENCHER) || "{}") || {}
const waInicial = { ...waFromPreencher, ...waFromSK }  // SK tem maior prioridade
```

Callbacks expostos: `setCRows`, `setLRows`, `setDispRows`, `onImport`, `sRec`, `sInv`, `sWa`, `sCfg`, `persist`.

Hook exportado: `export function useCronogramaData()`.

### 2.2 — `frontend/app/(dashboard)/cronograma/layout.tsx` (novo)

```tsx
export default function CronogramaLayout({ children }) {
  return (
    <CronogramaDataProvider>
      <DadosUploadPanel />   {/* 4 dropzones */}
      {children}
    </CronogramaDataProvider>
  )
}
```

### 2.3 — `DadosUploadPanel.tsx` (refatoração)

Adicionar **4.º dropzone** "Importar Base (XLSX exportado)" no grid `2×2`:

| Posição | Dropzone |
|---|---|
| 1 | Grade Profissionais (CSV) |
| 2 | Relatório de Laudos (XLSX) |
| 3 | Importar Base (XLSX exportado) ← **NOVO** |
| 4 | Disponibilidade — CSV Órbita |

O dropzone 3 chama `parseHistoricoXlsx` e dispara `onImport({rec, inv, waMap})`.

### 2.4 — `solicitacoes/page.tsx` (refatoração)

- Remover `useState` local de `cRows`, `lRows`, `dispRows`
- Substituir por `const { cRows, lRows, dispRows } = useCronogramaData()`

**Dependência:** Passo 1.

---

## Passo 3 — Rota, Página e Navegação

**Objetivo:** criar o ponto de entrada do módulo e torná-lo acessível via sidebar.

### 3.1 — `frontend/app/(dashboard)/cronograma/ocupacao/page.tsx`

Placeholder inicial (shell vazio) para que a rota exista enquanto os componentes dos Passos 4–5 ainda não estão prontos.

### 3.2 — `hasPermission.ts`

Adicionar:
```typescript
ocupacao_clinica: ["admin", "diretoria", "recepcao"]
```

### 3.3 — `frontend/components/Sidebar.tsx`

Adicionar grupo "Aumentar Ocupação Clínica" com 7 `MenuItem`s:

| Rota | Ícone |
|---|---|
| `/cronograma/ocupacao?tab=vagas` | `LayoutGrid` |
| `/cronograma/ocupacao?tab=fila` | `Clock` |
| `/cronograma/ocupacao?tab=rec` | `XCircle` |
| `/cronograma/ocupacao?tab=inv` | `Ban` |
| `/cronograma/ocupacao?tab=gaps` | `BarChart2` |
| `/cronograma/ocupacao?tab=guia` | `BookOpen` |
| `/cronograma/ocupacao?tab=cfg` | `Settings` |

Adicionar em `CODIGO_PARA_ROTAS`:
```typescript
ocupacao_clinica: ["/cronograma/ocupacao"]
```

**Dependência:** Passo 2 (layout já envolve a nova rota).

---

## Passo 4 — Componentes Reutilizáveis

**Objetivo:** criar os dois componentes compartilhados entre várias tabs.

### 4.1 — `SugCard.tsx`

Props: `s: Sugestao`, `waStatus: WaStatus | null`, `onWA`, `onWAUndo`, `onWAStatus`, `onRec`, `onInv`, `onCron`, `fila?: boolean`

- Fundo por `s.mod`: Musicoterapia → roxo, Ocupação → azul, Foco Prof. → verde
- Badge de prioridade: `PBADGE[s.prio]` de `constants.ts`
- Botões: "Oferecer via WA" / "✅ Aceito" / "❌ Recusou" / "⛔ Inviável" / "↩ Desfazer" / "Ver cronograma"
- Estilo: quando `waStatus === "aguardando"` → badge laranja; quando `"aceito"` → `opacity-50`

### 4.2 — `CronModal.tsx`

Props: `pac: string`, `sugsDosPac: Sugestao[]`, `agendRows: CsvRowProcessada[]`, `onClose: () => void`

- Grade semanal 7 colunas (dias) × N linhas (horários)
- Cores: verde = sessão nova sugerida, laranja = remanejada, cinza = existente sem alteração
- Sub-componente local `CronCard` (célula individual da grade)
- Usa `buildCronoUnitMeta`, `UnitHeaderBadges`, `CronoGlobalUnitBadge` já disponíveis
- Implementado como `<Dialog>` shadcn

**Dependência:** Passos 1 e 2.

---

## Passo 5 — Shell e 7 Tabs

**Objetivo:** implementar cada submenu do módulo.

### 5.1 — `OcupacaoShell.tsx`

- Tab bar horizontal com 7 abas (mesmo padrão do `SolicitacoesShell`)
- Tab ativa via `searchParams.get("tab")`, default `"vagas"`
- Props: `res: AlgorithmResult | null`, `rec`, `inv`, `waMap`, `cfg` + callbacks de mutação
- Hospeda os `<Dialog>` de "Registrar Recusa" e "Marcar Inviável" (ativados pelos callbacks `onRec`/`onInv` do `SugCard`)

### 5.2 — `VagasAgoraTab.tsx`

Fonte de dados: `res.vagasAgora`

Filtros:
- `fPac` — input de texto (paciente)
- `fProf` — input de texto (profissional)
- `fUnid` — multi-select (unidade)
- `fEsp` — multi-select (especialidade)
- `fPr` — multi-select (prioridade P1–P5)
- `fWa` — select: todos / pendente / aguardando / aceito

Renderiza lista de `SugCard`.

Multi-selects: Popover + Checkbox do shadcn.

### 5.3 — `FilaEsperaTab.tsx`

Fonte de dados: `res.filaEspera`

- Banner laranja explicando que estas vagas exigem coordenação prévia com a família
- Lista de `SugCard` com `fila={true}` (desabilita botão "Oferecer via WA")

### 5.4 — `RecusadosTab.tsx`

Fonte de dados: `rec[]` do contexto

- Tabela com colunas: Paciente / Profissional / Especialidade / Unidade / Dia / Hora / Registrado em
- Botão "📥 Exportar base" → chama `exportBase(rec, inv, waMap)`

### 5.5 — `InviavelTab.tsx`

Fonte de dados: `inv[]` do contexto

- Tabela com colunas: Paciente / Motivo / Registrado em
- Botão "📥 Exportar base" → chama `exportBase(rec, inv, waMap)`

### 5.6 — `GapsTab.tsx`

Fonte de dados: `res.allGaps`

Filtros:
- `gapSearch` — input de texto
- `gapEsp` — select de especialidade
- `gapFilt` — botões de toggle: todos / faltando / ok / sobre-agendado
- `gapTudoZero` — checkbox "Ocultar quem tem todos os gaps zerados"

Tabela: Paciente / Especialidade / Autorizado / Ofertado / Diferença

Badges: gap positivo (faltando) → vermelho, gap negativo (sobre) → âmbar, zero → verde

### 5.7 — `GuiaTab.tsx`

Conteúdo estático (não depende de dados):
- Regras R1–R4 do algoritmo
- Como registrar recusa/inviável
- Como usar o WhatsApp (WA flow)
- O que fazer entre rodadas

### 5.8 — `ConfigTab.tsx`

- Exibição das prioridades P1–P5 com `PBADGE` (read-only — determinadas pelo convênio)
- Campo `cfg.apiToken` → salvo em `localStorage[SK]`
- Botão "Buscar da API":
  - Chama `getRefWeek()` para obter `{inicio, fim}`
  - POST para `${API_BASE}/integracao/csv_grade_profissionais` com `{data_inicio, data_fim}`
  - Header: `X-INTEGRACAO-TOKEN: cfg.apiToken`
  - Resposta preenche `cRows` via `setCRows` do contexto

**Dependência:** Passos 1–4.

---

## Passo 6 — Wiring Final e Checklist

**Objetivo:** conectar tudo na `ocupacao/page.tsx` e validar o módulo completo.

### 6.1 — `ocupacao/page.tsx` (versão final)

```typescript
export default function OcupacaoPage() {
  const { cRows, lRows, rec, inv, waMap, cfg, ...callbacks } = useCronogramaData()
  const [res, setRes] = useState<AlgorithmResult | null>(null)

  useEffect(() => {
    if (cRows.length && lRows.length) {
      setRes(runAlgorithm(cRows, lRows, rec, inv, { waMap, ...cfg }))
    }
  }, [cRows, lRows, rec, inv, cfg])

  return <OcupacaoShell res={res} rec={rec} inv={inv} waMap={waMap} cfg={cfg} {...callbacks} />
}
```

### 6.2 — Checklist de Validação

- [ ] `tsc --noEmit` sem erros novos
- [ ] Upload de Grade CSV → `cRows` visível em **ambas** as páginas sem reupar
- [ ] Upload de Laudos XLSX → `lRows` populado
- [ ] `runAlgorithm` executa → contadores aparecem em Vagas Agora e Fila de Espera
- [ ] "Oferecer via WA" → card muda para "⏳ Aguardando WA"
- [ ] "✅ Aceito" → card fica com `opacity-50`
- [ ] "❌ Recusou" → entrada aparece na aba Recusados; par não reaparece na próxima rodada
- [ ] "⛔ Inviável" → entrada aparece na aba Inviáveis; paciente bloqueado
- [ ] "📥 Exportar base" → baixa XLSX com abas Recusados / Inviáveis / Status WA
- [ ] "Importar Base" → carrega XLSX exportado, mescla sem duplicatas
- [ ] Config: token salvo; "Buscar da API" preenche `cRows` sem upload manual
- [ ] Sidebar: grupo "Aumentar Ocupação Clínica" com 7 itens navegáveis
- [ ] Trocar Solicitações ↔ Ocupação sem reupar CSV

---

## Diagrama de Dependências

```
Passo 1 — Tipos + xlsx.ts
  │
  ▼
Passo 2 — Contexto + layout + refatorar DadosUploadPanel + refatorar solicitacoes/page.tsx
  │
  ├──▶ Passo 3 — Rota + sidebar (pode rodar em paralelo com Passo 4)
  │
  └──▶ Passo 4 — SugCard + CronModal (pode rodar em paralelo com Passo 3)
         │
         ▼
       Passo 5 — OcupacaoShell + 7 Tabs
         │
         ▼
       Passo 6 — Wiring final + checklist
```

---

## Notas de Adaptação Visual

| jsx-cronograma | sistema-pulsar |
|---|---|
| `background: "white"` inline | `bg-card` |
| `color: B.navy` inline | Manter `style={{ color: B.navy }}` (cor semântica) |
| `MultiSelect` customizado | Popover + Checkbox do shadcn |
| Modais inline `position:fixed` | `<Dialog>` do shadcn |
| Btn helper local | `<Button variant="outline" size="sm">` |
| `<Empty>` helper local | `div` com `border-dashed` + texto centralizado |
| `fontFamily: "inherit"` em botões | Não necessário — herda Geist do layout |

---

## Regras de Negócio a Preservar

- **R5.1** — Nunca intervalo entre sessões clínicas (checado no dia de origem e de destino)
- **R2.1** — Mínimo 2 sessões clínicas por dia (checado no dia de origem e de destino)
- **WA key format:** `"${pac}|||${prof}|||${dia}|||${hora}"` (4 partes, padrão de `splitWaKey`)
- **Slot reservado:** quando `waStatus === "aguardando"`, o slot fica bloqueado para outros pacientes via `reservasAtivasFromWa(waMap)`
- **Prioridade P1–P5:** determinada por `gPrio(conv, plano)` — não é configurável manualmente
- **Merge do waMap:** `SK_PREENCHER` tem menor prioridade que `SK` no init
