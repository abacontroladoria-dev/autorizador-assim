# Plano de Repaginação Visual — 5 abas do Cronograma

**Objetivo:** alinhar 5 abas do módulo Cronograma ao design system atual do sistema-pulsar, sem tocar em algoritmo/lógica. Repaginada visual completa: tipografia, cor, espaçamento, componentes, dark mode e motion.

---

## 0. Contexto para iniciar uma sessão nova

> Cole isto (ou aponte para este arquivo) ao abrir um chat novo para executar.

- **Branch de trabalho:** `pulsar-cronograma` (já criada, = main + Reposição de Faltas + links do Sidebar). Confirme com `git branch --show-current` antes de editar.
- **Regra de ouro:** NÃO alterar lógica. O cálculo vive em `useMemo`/`useCallback` no topo de cada componente; mexa só no `return (…)` (JSX) e nos mapas de estilo. Resultados numéricos devem ser idênticos antes/depois.
- **Antes de escrever qualquer estilo, leia estes arquivos-âncora (o "bom" a replicar):**
  - `frontend/components/cronograma/remuneracao/CardRemun.tsx` (padrão premium de referência)
  - `frontend/components/cronograma/remuneracao/AnaliseFuturaTab.tsx` (tons semânticos + filtros + estados)
  - `frontend/app/globals.css` (tokens: escala tipográfica, `--radius-*`, brand hue 217, overrides de dark mode)
  - `frontend/components/cronograma/ui/DataTable.tsx` e `ui/ConfirmDialog.tsx` e `ui/button.tsx` (primitivas já existentes)
- **Stack:** Next.js (versão com breaking changes — ver `frontend/AGENTS.md`), Tailwind v4 + tokens shadcn, dark mode por override em `globals.css` (não `dark:` em tudo).
- **Verificação por fase:** `cd frontend && npx tsc --noEmit -p .`; dev server em localhost:3000 (já roda com hot reload); screenshot light **e** dark; breakpoint mobile; conferir números idênticos aos da versão anterior.
- **Ordem:** Fase 0 (primitivas) → piloto **GapsTab** → aprovação → demais abas (§5).

**Abas no escopo:**

| # | Aba (Sidebar) | Arquivo | Linhas |
|---|---|---|---|
| 1 | Simulação de Novo Prestador | `components/cronograma/shared/PreencherProfTab.tsx` (modo `sim`) | 847 |
| 2 | Aumentar Ocupação (Profissional) | `components/cronograma/solicitacoes/OcupProfMode.tsx` | 1060 |
| 3 | Aumentar Ocupação (Clínica) | `components/cronograma/ocupacao/tabs/VagasAgoraTab.tsx` (+ `SugCard`) | 253 |
| 4 | Diferença: Laudo e Oferta | `components/cronograma/ocupacao/tabs/GapsTab.tsx` | 136 |
| 5 | Inconsistências e Exceções | `components/cronograma/ocupacao/tabs/InconsistenciasTab.tsx` | 851 |

---

## 1. Diagnóstico — por que estão "diferentes"

As 5 abas são as mais antigas do módulo. Todas compartilham os mesmos 5 desvios do padrão atual:

1. **Zero Tailwind.** Nenhuma das 5 usa `className` para estilo — é 100% `style={{}}` inline. O alvo (`CardRemun.tsx`, `AnaliseFuturaTab.tsx`) migrou para classes Tailwind + tokens shadcn.
2. **Dois sistemas de cor misturados linha a linha:** a paleta legada `B` (hex fixos em `lib/cronograma/constants.ts` — `#2A92C0`, `#8F6AA8`…) + CSS vars de superfície (`var(--card)`, `var(--border)`, `var(--muted)`).
3. **Dark mode só parcial.** Superfícies via CSS var adaptam; mas há muito hex de status hardcoded (`#dc2626`, `#16a34a`, `#d97706`…) e até `background: "white"` literal que **não** adapta.
4. **Emojis em todo título/botão/label** (🔍 👤 👥 📅 🔢 📊 ⬆️ ✅ ⚠️ 🎯 ⭐ 🗓 ⛔ ▲ ▼). É a inconsistência mais visível. O padrão atual usa ícones Lucide.
5. **Espaçamento e raio ad-hoc** (`borderRadius: 9/10/12/14`, `padding: "7px 9px"`) em vez dos tokens (`--radius-*`, escala tipográfica fixa).

**O que NÃO muda:** todo o cálculo vive em `useMemo`/`useCallback` no topo de cada componente, limpo e separado do JSX. A repaginada é exclusivamente na camada de apresentação (`return (…)` + os mapas de estilo `PRIO_META`, `TIPO_COLOR`, `WA_S`, etc.). **Resultados numéricos devem ser idênticos antes e depois.**

---

## 2. Alvo visual — o "kit de peças" (padrão `CardRemun` / `AnaliseFuturaTab`)

Referência canônica: `components/cronograma/remuneracao/CardRemun.tsx` e `AnaliseFuturaTab.tsx`. Regras transversais a aplicar em todas as abas:

### 2.1 Cor semântica — sempre pares tonais (nunca hex solto de status)
```
verde  (ok):       bg-emerald-50 dark:bg-emerald-950/30   text-emerald-700 dark:text-emerald-400
âmbar  (atenção):  bg-amber-50   dark:bg-amber-950/30     text-amber-700   dark:text-amber-400
azul   (info):     bg-sky-50     dark:bg-sky-950/30       text-sky-700     dark:text-sky-400
roxo   (especial): bg-violet-50  dark:bg-violet-950/30    text-violet-700  dark:text-violet-400
vermelho (erro):   bg-rose-50    dark:bg-rose-950/30      text-rose-700    dark:text-rose-400
neutro:            bg-slate-100  dark:bg-slate-800/60     text-slate-600   dark:text-slate-400
```
Chip mais forte (badge de status): `-100 dark:-900/40` fundo, `-700 dark:-300` texto. O `B.*` hex fica **só** para accents minúsculos (dot de legenda, fill de donut, faixa de gradiente) — como `CardRemun` já documenta.

### 2.2 Leitmotifs de card
- **Card premium:** `rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden` + faixa `h-1 w-full` com `linear-gradient(90deg, ${accent}cc, ${accent}33)` no topo.
- **Card com trilho de status:** `borderLeft: 4px solid ${cor}` (leitmotif do app — `RailCard`, `CardRemun`).

### 2.3 Ícone circular tonal (substitui emoji em cabeçalho)
`w-7 h-7 rounded-lg flex items-center justify-center ${ICON_BG[tone]}` + ícone Lucide com `style={{ color: accent }}`.

### 2.4 Pill/chip
`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold` + par tonal.

### 2.5 Tabela
`w-full text-xs`; thead `bg-muted/50 text-muted-foreground`; tr `border-t border-border hover:bg-muted/40`; números/qtd em `tabular-nums`. Nada de `background: "white"` literal.

### 2.6 Barra de filtros
Container `rounded-2xl border border-border bg-card p-3 space-y-3`. Search input com ícone `Search` absoluto (`SearchInput` de `ui/DataTable.tsx`). Pills toggle: ativo `bg-slate-900 text-white dark:bg-white dark:text-slate-900`, inativo `bg-transparent border-border hover:bg-muted/50`. Select `rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs`.

### 2.7 Botões
- Primário/secundário/ghost: usar `components/ui/button.tsx` (variants `default`/`outline`/`ghost`).
- Ações confirmar/recusar: pílulas suaves semânticas (`BTN_VARIANTS` de `AcompanhamentoTab`: verde `#dcfce7/#14532d`, vermelho `#fee2e2/#7f1d1d`) — migradas para pares tonais.

### 2.8 Estados
- **Loading:** bloco `animate-pulse` (`bg-muted rounded`) — skeleton, não spinner central.
- **Empty:** card centralizado `rounded-2xl border border-border bg-card p-10 text-center` + ícone Lucide `text-muted-foreground/50` (primitiva `EmptyState`).
- **Error:** card `border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300`.

### 2.9 Motion
`tw-animate-css` (`animate-in fade-in slide-in-from-bottom-4 duration-300`) para entradas; `transition-shadow/colors/opacity`, `hover:-translate-y-0.5`, `active:scale-95`. Adicionar fallback `@media (prefers-reduced-motion: reduce)` onde houver entrada animada.

### 2.10 Ícones — mapa de substituição de emoji
| Emoji | Lucide | Emoji | Lucide |
|---|---|---|---|
| 🔍 | `Search` | ✅ | `CheckCircle2` |
| 👤 | `User` | ⚠️ | `AlertTriangle` |
| 👥 | `Users` | 🎯 | `Target` |
| 📅 🗓 | `CalendarDays` | ⭐ ★ | `Star` |
| 🔢 | `ListOrdered` | ⛔ | `Ban` |
| 📊 | `BarChart3` | ⓘ | `Info` |
| ⬆️ | `ArrowUp` | ▲ ▼ | `ChevronUp` / `ChevronDown` |

---

## 3. Primitivas compartilhadas a criar/extrair (Fase 0)

Antes de repaginar as abas, extrair estas peças para `components/cronograma/ui/` — elimina duplicação e garante consistência:

1. **`StatusPill`** — unifica o `Chip` (`AnaliseFuturaTab`) e o `StatusChip` (`CardRemun`), com prop `tone` + `dense`. Hoje reimplementado em 3+ arquivos.
2. **`StatCard`** — o card premium de métrica (faixa de gradiente + ícone circular tonal + label uppercase + valor `tabular-nums`), de `CardRemun.KpiStatCard` / `AnaliseFuturaTab.StatCardShell`.
3. **`SegmentedTabs`** — sub-navegação em pílula (usada em Inconsistências: Regras/Exceções; e opcionalmente como orientação dentro de Ocupação).
4. **`TerapiaChip`** — chip de especialidade colorido por `TERAPIA_CORES`, substituindo o hack de alpha-hex (`tc + "22"`) do GapsTab.
5. **`ScheduleModal`** (shell) — consolida os 3 modais de grade quase idênticos (`CronViewModal` + `ProfViewModal` em InconsistenciasTab; `AgendaModal` em OcupProfMode). Base já existe em `ui/ConfirmDialog.tsx`.

Reutilizar já-existentes: `ui/DataTable.tsx` (`ListCard`, `SearchInput`, `EmptyState`, `GroupHeader`, `TimeBadge`, `rowClass="acomp-tr"`), `ui/PBadge.tsx`, `ui/UnitBadges.tsx`, `ui/button.tsx`, `useHeader()`, `useTheme()`.

> **Blast-radius:** `SugCard`, `PBadge`, `UnitBadges` são compartilhados com outras telas. Auditar todos os usos antes de alterá-los (grep) para não regredir Saída Profissional / Ocupação Paciente.

---

## 4. Plano por aba

### Aba 4 — Diferença: Laudo e Oferta (`GapsTab`) — **PILOTO**
A menor (136 linhas), self-contained (sem componentes externos compartilhados), e contém todos os arquétipos (filtros, tabela real, chips, empty state). Ideal para validar a abordagem antes de escalar.
- **Filtros** (L49-74) → barra de filtros §2.6: `SearchInput`, select de especialidade, pills `all/pos/zero/neg/alta`, checkbox "sem nada agendado", limpar.
- **Tabela** (L92-130) → padrão §2.5. Matar `background: "white"` (L105) → `bg-card`/zebra via `hover:bg-muted/40`. `Autorizado`/`Ofertado`/`Diferença` em `tabular-nums`.
- **Chip de especialidade** → `TerapiaChip` (fim do hack `tc + "22"`).
- **Semântica de gap** (`gapColor/gapBg` L41) → pares tonais: positivo=rose, negativo=amber, zero=emerald, alta=amber forte.
- **Emojis** 📊⬆️✅🔍 → Lucide. Legenda inline do header → linha de legenda limpa com dots.
- **Preservar:** `rows` memo (L21-39).

### Aba 3 — Aumentar Ocupação (Clínica) (`VagasAgoraTab` + `SugCard`)
- **Filtros** (L75-105) → barra §2.6.
- **Seções colapsáveis** (Montar Grupo / Ocupar Livre / Fila / ASSIM Isolado) → padrão `SectionToggle` (de `AcompanhamentoTab`): ícone Lucide tonal (não 👥📅🔢), chevron (não ▲▼), régua + badge de contagem.
- **Fila ranqueada** (1°/2°/3°, L196-214) → lista limpa; candidato primário em verde tonal.
- **`Empty`** interno → primitiva `EmptyState`.
- **`SugCard`** (externo, carrega peso visual) → repaginar junto, no mesmo padrão de card premium.
- **Preservar:** `vFilt`, `slotQueue`, `assimIsolado` (L32-70).

### Aba 5 — Inconsistências e Exceções (`InconsistenciasTab`)
- **Sub-tabs** Regras/Exceções (L550-570) → `SegmentedTabs`.
- **Pills de resumo por tipo** (L605-627) → pills tonais.
- **Cards de inconsistência + form de exceção** (L638-747) → cards premium; `textarea` de justificativa estilizado (padrão `ConfirmDialog`).
- **2 modais quase idênticos** (`CronViewModal` L140, `ProfViewModal` L267) → consolidar em `ScheduleModal`.
- **`TIPO_COLOR`/`UNID_BADGE`** (L24/L261) → sistema tonal.
- **Emojis** ⚠️✅🗓🔍⛔ → Lucide.
- **Preservar:** `buildSchedule` (L55-129) e memos dos modais (L269-539).

### Aba 2 — Aumentar Ocupação (Profissional) (`OcupProfMode`)
- **Layout 2 colunas** (L718): esquerda filtros+resumo, direita agenda+cards.
- **Combobox** (L732-751) → dropdown estilizado (padrão `AnaliseFuturaTab`).
- **2 donuts Recharts** (Prioridade/Regra) → alinhar cor/legenda ao `InteractivePieChart`; **unificar `PRIO_META`/`REGRA_META` com os `_COLORS` duplicados nos memos** (fonte única de cor).
- **`ProfAgendaGrid`** (tabela semanal, L390-455) → tabela premium; cores de célula (verdes/âmbares hardcoded) → tonais.
- **`SessaoCard`/`PacCard`** → cards premium.
- **`btnStyle()`** (L1057) → `ui/button.tsx`. Emojis 🗓⛔👤 + ▲▼ → Lucide.
- **Preservar:** `gapMap`, `resultados`, `*ChartData` (L487-710).

### Aba 1 — Simulação de Novo Prestador (`PreencherProfTab`, modo `sim`)
A maior (847 linhas) e a mais sensível: **componente compartilhado** com os modos `prof` e `paciente`. Repaginar sem quebrar os outros modos (idealmente repaginar os 3 no mesmo passe, já que compartilham `CandCard` e os stat cards).
- **Filtros sim** (L636-669): datalist de especialidade + grade de toggles dia/turno → barra §2.6 + grid de `PillToggle`.
- **Card de recomendação** (L743-788): botões de comparação com número grande + cards por unidade → fileira de `StatCard` + card "Recomendado" destacado (Lucide `Star`, não ⭐).
- **Blocos de slot + `CandCard`** (L386) → cards premium; repaginar `CandCard`.
- **`InfoTip`** (L63) → padrão `InfoTooltip`. Chip one-off `#e0f2fe/#0369a1` (L727) → tonal sky.
- **Preservar:** hooks L221-581.

---

## 5. Sequência de execução

| Fase | Entrega | Validação |
|---|---|---|
| **0** | Primitivas compartilhadas (§3) + confirmação de tokens | typecheck; render isolado |
| **1** | **Piloto: GapsTab** | typecheck + screenshots light/dark + responsivo + conferir números idênticos → **aprovação do usuário antes de escalar** |
| **2** | VagasAgoraTab + SugCard | idem |
| **3** | InconsistenciasTab (+ consolidar modais) | idem |
| **4** | OcupProfMode (donuts, grid, 2-col) | idem |
| **5** | PreencherProfTab (3 modos) | idem |

A cada fase: `npx tsc --noEmit`, subir no dev server (localhost:3000), screenshot **light e dark**, checar breakpoint mobile, e conferir por amostragem que os resultados (contagens, gaps, sugestões) batem com a versão anterior.

---

## 6. Não-objetivos e riscos

**Não-objetivos:**
- Não alterar lógica/algoritmo/resultados (só JSX + mapas de estilo).
- Não mudar rotas, permissões, ou o contrato dos dados.

**Riscos e mitigação:**
- **`PreencherProfTab` é compartilhado** (3 modos) → repaginar cobrindo os 3; testar `simulacao` no Sidebar e os outros pontos de montagem.
- **`SugCard`/`PBadge`/`UnitBadges` são compartilhados** → grep dos usos antes; validar telas vizinhas (Saída Profissional, Ocupação Paciente).
- **Donuts Recharts** → restyle de cor/legenda sem mexer nos `*ChartData`.
- **Dark mode** → eliminar todo hex de status não-pareado e `"white"` literal; testar as 5 abas nos dois temas.
- **`prefers-reduced-motion`** → fallback para toda entrada animada.
- **Regressão silenciosa de números** → conferência visual lado a lado por aba antes de fechar cada fase.
