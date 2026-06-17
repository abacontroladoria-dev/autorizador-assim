# Central de Atendimento Pulsar — Frontend Architecture

> Documento: Frontend Architecture
> Versão: 1.0
> Status: Referência oficial da arquitetura frontend
>
> Este documento define a estrutura frontend da Central de Atendimento do Pulsar utilizando Next.js, Supabase Realtime e Zustand.

---

# 1. Objetivo

Criar uma arquitetura frontend:

- Escalável
- Modular
- Reutilizável
- Realtime
- Preparada para SaaS
- Otimizada para grandes volumes de conversas

---

# 2. Princípios

A Central de Atendimento não deve seguir o mesmo padrão visual do restante do Pulsar.

Ela funciona como um:

```text
Workspace Operacional
```

---

# 3. Estrutura de Rotas

Recomendação:

```text
app

├── (dashboard)

├── (workspace)
│
└── central-atendimento
    │
    ├── page.tsx
    ├── loading.tsx
    ├── error.tsx
    ├── settings
    ├── channels
    └── analytics
```

---

# 4. Workspace Layout

Criar layout próprio.

```text
app
└── (workspace)
    └── layout.tsx
```

---

Responsável por:

```text
Ocultar Sidebar

Ocultar Header

Modo Full Width

Tema Próprio
```

---

# 5. Estrutura de Pastas

```text
src

├── modules
│
└── atendimento
    │
    ├── components
    ├── hooks
    ├── stores
    ├── services
    ├── types
    ├── providers
    ├── lib
    └── utils
```

---

# 6. Components

```text
components

├── conversation-list
├── conversation-item
├── chat
├── composer
├── context-panel
├── widgets
├── notes
├── notifications
├── channels
└── settings
```

---

# 7. Layout Principal

```text
┌──────────────┬──────────────────────┬──────────────┐
│ Conversas    │ Chat                 │ Contexto     │
│              │                      │              │
└──────────────┴──────────────────────┴──────────────┘
```

---

# 8. Estrutura Visual

Coluna 1

```text
ConversationList
```

---

Coluna 2

```text
ChatArea
```

---

Coluna 3

```text
ContextPanel
```

---

# 9. Stores

Utilizar:

```text
Zustand
```

---

Não utilizar:

```text
Redux
```

---

# 10. Stores Principais

```text
useInboxStore

useConversationStore

useMessageStore

useNotificationStore

usePresenceStore

useChannelStore
```

---

# 11. useConversationStore

Responsável por:

```text
Conversa selecionada

Filtros

Busca

Paginação
```

---

Exemplo:

```typescript
selectedConversationId

setConversation()

refreshConversation()
```

---

# 12. useMessageStore

Responsável por:

```text
Mensagens

Realtime

Status envio
```

---

# 13. useNotificationStore

Responsável por:

```text
Badges

Toasts

Alertas
```

---

# 14. Hooks

Criar hooks específicos.

---

Estrutura:

```text
hooks

useConversations

useMessages

useRealtime

useTyping

useNotifications

useContext
```

---

# 15. useConversations

Responsável por:

```text
Buscar conversas

Atualizar filtros

Refresh
```

---

# 16. useMessages

Responsável por:

```text
Enviar

Receber

Realtime

Scroll
```

---

# 17. useRealtime

Centralizar realtime.

---

Nunca criar subscriptions diretamente nos componentes.

---

Fluxo:

```text
Componente
↓
Hook
↓
Realtime Service
```

---

# 18. Services

Camada responsável por APIs.

---

Estrutura:

```text
services

conversation.service.ts

message.service.ts

channel.service.ts

notification.service.ts

ai.service.ts
```

---

# 19. Nunca

```text
fetch()

supabase

axios
```

diretamente nos componentes.

---

# 20. Conversation Service

```typescript
getConversations()

getConversation()

assignConversation()

transferConversation()
```

---

# 21. Message Service

```typescript
sendMessage()

uploadAttachment()

markAsRead()
```

---

# 22. AI Service

```typescript
summarize()

rewrite()

translate()

suggestReply()
```

---

# 23. Context Panel

Principal diferencial competitivo.

---

Componente:

```text
ContextPanel
```

---

Renderização dinâmica.

---

# 24. Widget Registry

Estrutura:

```typescript
guardian

therapist

lead

physician
```

↓

```typescript
WidgetRegistry
```

↓

```typescript
Widgets
```

---

# 25. Widgets

```text
PatientWidget

AgendaWidget

AuthorizationWidget

FinancialWidget

LeadWidget

TherapistWidget
```

---

# 26. Lazy Loading

Widgets devem ser carregados sob demanda.

---

Utilizar:

```typescript
dynamic()
```

---

# 27. Chat

Estrutura:

```text
ChatHeader

MessageList

MessageComposer
```

---

# 28. MessageList

Regras:

```text
Virtualização

Scroll infinito

Realtime
```

---

# 29. Biblioteca

Utilizar:

```text
@tanstack/react-virtual
```

---

# 30. Composer

Suportar:

```text
Texto

Imagem

PDF

Documento

Áudio
```

---

# 31. Upload

Fluxo:

```text
Arquivo
↓
Storage Upload
↓
Message Attachment
↓
Mensagem
```

---

# 32. Áudios

Exibir:

```text
Player

Transcrição

Resumo IA
```

---

# 33. Realtime

Utilizar:

```text
Supabase Realtime
```

---

Eventos:

```text
messages

conversations

notifications

notes
```

---

# 34. Performance

Nunca atualizar toda a página.

---

Atualizar apenas:

```text
Lista

Mensagem

Widget afetado
```

---

# 35. Cache

Utilizar:

```text
TanStack Query
```

---

Responsável por:

```text
Cache

Refetch

Mutations
```

---

# 36. Stack Recomendada

```text
Next.js 16

TypeScript

Zustand

TanStack Query

Supabase

Shadcn/UI

TailwindCSS

Lucide
```

---

# 37. Componentes Base

```text
Sheet

Dialog

Popover

Dropdown

Tabs

Tooltip
```

---

# 38. Tema

Default:

```text
Dark Mode
```

---

Suportar:

```text
Dark

Light
```

---

# 39. Design System

Criar:

```text
modules/atendimento/design-system
```

---

Componentes próprios:

```text
InboxBadge

ProviderBadge

ConversationStatus

SLABadge

AIBadge
```

---

# 40. Estados de Loading

Obrigatório:

```text
Skeletons
```

---

Nunca:

```text
Tela vazia
```

---

# 41. Tratamento de Erros

Criar:

```text
ErrorBoundary
```

---

Mensagens amigáveis.

---

# 42. Atalhos de Teclado

Preparação futura.

---

Exemplos:

```text
Ctrl + K

Ctrl + Enter

Alt + 1
```

---

# 43. Notificações

Renderizar:

```text
Toast

Badge

Sound
```

---

Centralizadas.

---

# 44. Analytics

Preparação futura.

---

Página:

```text
/central-atendimento/analytics
```

---

# 45. Channels

Página:

```text
/central-atendimento/channels
```

---

Exibir:

```text
Evolution

WABA

Status

QR Code
```

---

# 46. Configurações

Página:

```text
/central-atendimento/settings
```

---

# 47. Responsividade

Desktop:

```text
3 colunas
```

---

Tablet:

```text
2 colunas
```

---

Mobile:

```text
Navegação por telas
```

---

# 48. Metas de Performance

```text
Primeira carga < 2s

Abrir conversa < 200ms

Troca conversa < 100ms

Nova mensagem < 1s
```

---

# 49. Critério de Aceite

Frontend considerado pronto quando:

```text
Workspace funcional

Lista conversas

Chat realtime

Painel contexto

Upload mídia

Notificações

Tema dark

Responsivo
```

---

# 50. Decisões Arquiteturais

✅ Next.js App Router

✅ Workspace independente

✅ Zustand

✅ TanStack Query

✅ Supabase Realtime

✅ Widget Registry

✅ Context Panel Dinâmico

✅ Shadcn/UI

✅ Dark Mode Nativo

A próxima etapa obrigatória será:

text
20-realtime-architecture.md
