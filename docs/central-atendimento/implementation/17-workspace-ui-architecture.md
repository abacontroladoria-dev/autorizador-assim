# Workspace UI — Arquitetura Frontend

> Status: Planejamento concluído — aguardando implementação
> Data: 2026-06-18
> Rota principal: `/atendimento`

---

## Design Tokens (workspace-specific)

Complementam o `globals.css` existente. Definidos em escopo local para a rota `/atendimento`.

```css
/* Palette (OKLch) */
--ca-surface-nav:    oklch(0.14 0.012 232);  /* col 1 — dark navy panel  */
--ca-surface-chat:   oklch(0.99 0 0);        /* col 2 — pure stage       */
--ca-surface-ctx:    oklch(0.975 0.008 55);  /* col 3 — warm clinical    */
--ca-topbar:         oklch(0.17 0.015 232);  /* topbar — darker navy     */
--ca-bubble-out:     oklch(0.60 0.092 217);  /* outbound bubble          */
--ca-bubble-in:      oklch(0.95 0 0);        /* inbound bubble           */
--ca-status-open:    oklch(0.70 0.16 140);   /* green                    */
--ca-status-wait:    oklch(0.75 0.15 80);    /* amber                    */
--ca-status-resolve: oklch(0.55 0 0);        /* neutral gray             */
--ca-status-assign:  oklch(0.65 0.15 260);   /* purple-blue              */
```

**Elemento de assinatura**: strip vertical de 3px no lado esquerdo de cada `ConversationCard` pintado com a cor do status — leitura imediata do estado sem badge.

---

## Layout Geral

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOPBAR 48px (fixed, --ca-topbar)                                         │
│ [◀ Pulsar]  Central de Atendimento  ·············  [🔍 ⌘K]  [avatar]   │
├───────────────┬────────────────────────────────────┬────────────────────┤
│ COLUNA 1      │ COLUNA 2                           │ COLUNA 3           │
│ 320px fixed   │ flex-1                             │ 360px fixed        │
│ --ca-surface- │ --ca-surface-chat                  │ --ca-surface-ctx   │
│    nav        │                                    │                    │
│ InboxSelector │ ChatHeader                         │ ContactCard        │
│ Filters       │ ─────────────────────────────────  │ PatientLinks       │
│ Search        │ MessageList (scroll infinito ↑)    │ ConversationHistory│
│ ─────────     │                                    │ ConversationMeta   │
│ Conversation  │ ─────────────────────────────────  │                    │
│ List          │ MessageComposer                    │                    │
└───────────────┴────────────────────────────────────┴────────────────────┘
```

---

## 1. Estrutura de Páginas

```
app/
└── atendimento/                    ← FORA do grupo (dashboard) — sem sidebar
    ├── layout.tsx                  — height: 100dvh; overflow: hidden; sem Sidebar
    └── page.tsx                    — renderiza <CentralWorkspace />
```

`app/atendimento/layout.tsx` não herda `(dashboard)/layout.tsx` — o agrupamento de rotas garante isso sem nenhuma configuração adicional.

---

## 2. Componentes

```
components/central/
│
├── workspace/
│   ├── CentralWorkspace.tsx         — composição root dos 3 painéis
│   ├── CentralTopbar.tsx            — barra fixa 48px
│   └── GlobalSearch.tsx             — command-palette ⌘K
│
├── conversations/                   COLUNA 1 (320px fixo, --ca-surface-nav)
│   ├── ConversationSidebar.tsx      — painel esquerdo completo
│   ├── InboxSelector.tsx            — dropdown/tabs de caixas
│   ├── ConversationFilters.tsx      — chips: Abertas / Aguardando / Resolvidas / Todas
│   ├── ConversationSearch.tsx       — input debounced 300ms
│   ├── ConversationList.tsx         — scroll virtualizado
│   ├── ConversationCard.tsx         — status strip + avatar + preview + tempo
│   ├── ConversationListSkeleton.tsx — 5 shimmer cards
│   └── ConversationListEmpty.tsx    — mensagem contextual por filtro
│
├── chat/                            COLUNA 2 (flex-1, --ca-surface-chat)
│   ├── ChatPane.tsx                 — painel central
│   ├── ChatHeader.tsx               — nome, status, botões de ação
│   ├── MessageList.tsx              — scroll infinito (carrega para cima)
│   ├── MessageBubble.tsx            — inbound / outbound + status ticks
│   ├── MessageReply.tsx             — preview de citação
│   ├── MessageAttachment.tsx        — imagens / arquivos / áudio
│   ├── MessageStatus.tsx            — pending→sent→delivered→read ticks
│   ├── SystemMessage.tsx            — eventos ("Atribuída a Caio", "Resolvida")
│   ├── MessageComposer.tsx          — textarea + send + attach
│   ├── AssignMenu.tsx               — popover com lista de operadores
│   ├── TransferMenu.tsx             — popover com caixas / operadores
│   └── ResolveConfirmDialog.tsx     — AlertDialog de confirmação
│
├── context-panel/                   COLUNA 3 (360px fixo, --ca-surface-ctx)
│   ├── ContextPanel.tsx             — painel direito, colapsável
│   ├── ContactCard.tsx              — foto, nome, tipo, telefone, e-mail
│   ├── PatientLinks.tsx             — vínculos TITA (lista de pacientes)
│   ├── ConversationHistory.tsx      — outras conversas do contato
│   └── ConversationMeta.tsx         — caixa, canal, atribuído, criado em
│
└── shared/
    └── PresenceDot.tsx              — indicador de presença (Sprint 2)
```

**Total: 28 componentes**

---

## 3. Hooks

Diretório: `frontend/hooks/central/`

| Hook | Responsabilidade |
|---|---|
| `useCentral()` | Acessor do `CentralContext` — inbox selecionada, filtros, painel |
| `useInboxes()` | Lista de caixas do usuário para `InboxSelector` |
| `useConversations()` | Lista paginada com cursor + merge de eventos Realtime |
| `useConversation(id)` | Conversa única enriquecida (contato, canal, inbox) |
| `useMessages(convId)` | Scroll infinito ascendente + append Realtime |
| `useMessageActions()` | `send()` com optimistic update + `softDelete()` |
| `useConversationActions(id)` | `assign()`, `transfer()`, `resolve()`, `archive()`, `reopen()` |
| `useContacts(query)` | Busca para autocomplete em AssignMenu / TransferMenu |
| `useRealtime()` | Gerencia canais Supabase — subscribe/unsubscribe no ciclo do componente |

**Padrão de retorno uniforme:**
```typescript
interface UseResult<T> {
  data:      T | undefined
  isLoading: boolean
  error:     Error | null
  refetch:   () => void
}
```

---

## 4. Context Providers

Dois providers em `frontend/contexts/central/`:

### `CentralContext`

```typescript
interface CentralState {
  inboxes:             Inbox[]
  selectedInboxId:     string | null
  setSelectedInboxId:  (id: string) => void
  filters:             ConversationFilters     // status[], assignedUserId
  setFilters:          (f: Partial<ConversationFilters>) => void
  searchQuery:         string
  setSearchQuery:      (q: string) => void
  contextPanelOpen:    boolean
  toggleContextPanel:  () => void
}
```

### `ConversationContext`

```typescript
interface ConversationState {
  conversationId:    string | null
  setConversationId: (id: string | null) => void
  replyTo:           Message | null
  setReplyTo:        (msg: Message | null) => void
}
```

### Árvore de providers em `CentralWorkspace.tsx`

```tsx
<CentralProvider>          {/* fetch inboxes, inicializa filtros */}
  <ConversationProvider>   {/* estado da conversa ativa */}
    <CentralWorkspace />
  </ConversationProvider>
</CentralProvider>
```

---

## 5. Integração com Realtime

### Pré-requisito manual (pendente)

```sql
ALTER PUBLICATION supabase_realtime
  ADD TABLE central.messages, central.conversations;
```

Executar via Supabase Console (fora de transação).

### Canal A — lista de conversas

```typescript
// Subscrito quando selectedInboxId muda
supabase.channel(`inbox:${inboxId}`)
  .on('postgres_changes', {
    event:  'INSERT',
    schema: 'central',
    table:  'conversations',
    filter: `inbox_id=eq.${inboxId}`,
  }, (payload) => prependToList(payload.new))
  .on('postgres_changes', {
    event:  'UPDATE',
    schema: 'central',
    table:  'conversations',
    filter: `inbox_id=eq.${inboxId}`,
  }, (payload) => replaceInList(payload.new))
  .subscribe()
```

### Canal B — chat aberto

```typescript
// Subscrito quando conversationId muda
supabase.channel(`conversation:${conversationId}`)
  .on('postgres_changes', {
    event:  'INSERT',
    schema: 'central',
    table:  'messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => appendMessage(payload.new))
  .on('postgres_changes', {
    event:  'UPDATE',
    schema: 'central',
    table:  'messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, (payload) => updateMessageStatus(payload.new))
  .subscribe()
```

### Cleanup

```typescript
useEffect(() => {
  if (!conversationId) return
  const ch = subscribe(conversationId)
  return () => supabase.removeChannel(ch)
}, [conversationId])
```

---

## 6. Estratégia de Cache

| Dado | Validade | Invalidação |
|---|---|---|
| Inboxes | 5 min | Manual reload |
| Lista de conversas | 30s (stale) | Realtime substitui item sem refetch |
| Mensagens (conversa aberta) | Realtime-driven | Append direto via Canal B |
| Mensagens (conversa fechada) | 5 min | Nunca muda — pode ser longo |
| Contato no context panel | 2 min | Após PATCH bem-sucedido |
| Resultado de busca global | Sem cache | Sempre fetch |

### Optimistic update — envio de mensagem

```
1. tempId = crypto.randomUUID()
2. Append imediato: { id: tempId, status: 'pending', body, direction: 'outbound' }
3. POST /api/central/messages
4. Sucesso → substituir bubble por resposta do servidor
5. Falha   → status: 'failed' + botão "Reenviar"
```

---

## 7. Estados de Loading

| Componente | Estratégia |
|---|---|
| `ConversationList` | `ConversationListSkeleton` — 5 shimmer cards com strip e avatar |
| `MessageList` | `MessageListSkeleton` — 7 bubbles alternados inbound/outbound |
| `ContextPanel` | `ContextPanelSkeleton` — avatar + 3 linhas shimmer |
| `ChatHeader` | Mantém nome; só status badge pisca |
| Envio de mensagem | Bubble com ícone de relógio — não bloqueia composer |
| Ações (assign/resolve) | Botão desabilita + spinner inline |

Sem full-page loader. Cada coluna carrega independentemente.

---

## 8. Estados Vazios

| Situação | Mensagem |
|---|---|
| Nenhuma caixa selecionada | "Selecione uma caixa de entrada para começar" |
| Nenhuma conversa no filtro | "Nenhuma conversa [status] encontrada" |
| Nenhuma conversa aberta | Ilustração central: "Selecione uma conversa" |
| Busca sem resultados | "Nenhum resultado para "[query]"" |
| Contato sem vínculos TITA | "Nenhum paciente vinculado" + botão "Vincular" |
| Histórico sem outras conversas | "Esta é a primeira conversa com este contato" |

---

## 9. Responsividade

| Breakpoint | Layout |
|---|---|
| `≥ 1280px` | 3 colunas: 320px + flex-1 + 360px |
| `768–1279px` | 2 colunas: 320px + flex-1. ContextPanel vira `Sheet` (drawer lateral direito) |
| `< 768px` | 1 coluna. Lista → Chat via push navigation |

---

## Topbar (`CentralTopbar`)

48px fixo, `background: var(--ca-topbar)` (dark navy):

```
[◀ Pulsar]   Central de Atendimento   ···············   [🔍 ⌘K]   [avatar]
```

- **◀ Pulsar** — link de retorno ao dashboard
- **Título** — fixo; inbox fica na col 1
- **🔍 ⌘K** — abre `GlobalSearch` (command-palette sobreposta)
- **Avatar** — nome do usuário

---

## Atribuição, Transferência, Resolução

Todos acessados via `ChatHeader`:

### Atribuir
- Botão "Atribuir" → `Popover` com operadores da caixa + busca inline
- `PATCH /api/central/conversations/[id]` `{ action: 'assign', userId }`
- Feedback: `SystemMessage` no chat ("Atribuída a [nome]")

### Transferir
- Botão "Transferir" → `Popover` com duas abas: "Caixa" e "Operador"
- `PATCH { action: 'transfer', inboxId | userId }`

### Resolver
- Botão "Resolver" → `AlertDialog` de confirmação
- `PATCH { action: 'resolve' }`
- Conversa sai da lista se filtro ativo for "Abertas"

### Reabrir
- Botão visível apenas em `resolved` / `archived`
- `PATCH { action: 'reopen' }` → status volta para `open`

---

## Estrutura de Arquivos

```
app/atendimento/
├── layout.tsx
└── page.tsx

components/central/
├── workspace/        — 3 arquivos
├── conversations/    — 8 arquivos
├── chat/             — 12 arquivos
├── context-panel/    — 5 arquivos
└── shared/           — 1 arquivo

contexts/central/
├── CentralContext.tsx
└── ConversationContext.tsx

hooks/central/
├── useCentral.ts
├── useInboxes.ts
├── useConversations.ts
├── useConversation.ts
├── useMessages.ts
├── useMessageActions.ts
├── useConversationActions.ts
├── useContacts.ts
└── useRealtime.ts
```

**Total: 2 rotas + 29 componentes + 2 contexts + 9 hooks = 42 arquivos**

---

> Ready for Workspace UI Implementation
