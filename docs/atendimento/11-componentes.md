# Componentes

## Objetivo

Definir a arquitetura de componentes do módulo Pulsar Atendimento.

Todos os componentes devem ser:

* Reutilizáveis
* Pequenos
* Independentes
* Testáveis

Evitar componentes gigantes.

---

# Estrutura

```text
components
│
└── atendimento
    │
    ├── layout
    ├── topbar
    ├── conversations
    ├── chat
    ├── context-panel
    ├── crm
    ├── ai
    └── shared
```

---

# Layout

## AtendimentoLayout

Responsável por:

* Estrutura principal
* Distribuição das colunas
* Responsividade

Local:

```text
components/atendimento/layout/atendimento-layout.tsx
```

---

# Topbar

## AtendimentoTopbar

Responsável por:

* Botão Voltar
* Busca Global
* Status WhatsApp
* Status IA
* Operador

Local:

```text
components/atendimento/topbar/atendimento-topbar.tsx
```

---

## BackToPulsarButton

Responsável por:

Retornar ao sistema principal.

Local:

```text
components/atendimento/topbar/back-to-pulsar-button.tsx
```

---

## GlobalSearch

Responsável por:

Pesquisar:

* Contatos
* Pacientes
* Telefones

Local:

```text
components/atendimento/topbar/global-search.tsx
```

---

## ConnectionStatus

Responsável por:

Exibir status:

* WhatsApp
* IA
* Realtime

Local:

```text
components/atendimento/topbar/connection-status.tsx
```

---

# Conversas

## ConversationsPanel

Responsável por:

Renderizar coluna esquerda.

Local:

```text
components/atendimento/conversations/conversations-panel.tsx
```

---

## ConversationFilters

Responsável por:

Filtros rápidos.

Exemplos:

* Todas
* Não lidas
* IA
* Humano

Local:

```text
components/atendimento/conversations/conversation-filters.tsx
```

---

## ConversationList

Responsável por:

Listagem de conversas.

Local:

```text
components/atendimento/conversations/conversation-list.tsx
```

---

## ConversationItem

Responsável por:

Renderizar conversa individual.

Local:

```text
components/atendimento/conversations/conversation-item.tsx
```

---

### Exibir

* Nome
* Última mensagem
* Horário
* Status
* Não lidas

---

# Chat

## ChatPanel

Responsável por:

Área central.

Local:

```text
components/atendimento/chat/chat-panel.tsx
```

---

## ChatHeader

Responsável por:

Informações básicas do contato.

Local:

```text
components/atendimento/chat/chat-header.tsx
```

---

## MessageList

Responsável por:

Renderizar mensagens.

Local:

```text
components/atendimento/chat/message-list.tsx
```

---

## MessageBubble

Responsável por:

Renderizar uma mensagem.

Local:

```text
components/atendimento/chat/message-bubble.tsx
```

---

### Tipos

* customer
* human
* ai
* system

---

## MessageComposer

Responsável por:

Campo de envio.

Local:

```text
components/atendimento/chat/message-composer.tsx
```

---

### Recursos

* Texto
* Emoji
* Arquivo
* Envio

---

## SuggestedReplies

Responsável por:

Sugestões da IA.

Local:

```text
components/atendimento/chat/suggested-replies.tsx
```

---

# Contexto

## ContextPanel

Responsável por:

Coluna direita.

Local:

```text
components/atendimento/context-panel/context-panel.tsx
```

---

## ContextTabs

Responsável por:

Navegação entre abas.

Local:

```text
components/atendimento/context-panel/context-tabs.tsx
```

---

## PatientSummary

Responsável por:

Resumo do paciente.

Local:

```text
components/atendimento/context-panel/patient-summary.tsx
```

---

## ScheduleWidget

Responsável por:

Próximas sessões.

Local:

```text
components/atendimento/context-panel/schedule-widget.tsx
```

---

## FinancialWidget

Responsável por:

Situação financeira.

Local:

```text
components/atendimento/context-panel/financial-widget.tsx
```

---

## HistoryWidget

Responsável por:

Histórico relevante.

Local:

```text
components/atendimento/context-panel/history-widget.tsx
```

---

# CRM

## TagsSection

Responsável por:

Visualização de tags.

Local:

```text
components/atendimento/crm/tags-section.tsx
```

---

## NotesSection

Responsável por:

Notas internas.

Local:

```text
components/atendimento/crm/notes-section.tsx
```

---

## ConversationStatus

Responsável por:

Status da conversa.

Exemplos:

* Open
* Pending
* Waiting
* Closed

Local:

```text
components/atendimento/crm/conversation-status.tsx
```

---

# IA

## AIStatusCard

Responsável por:

Exibir status da IA.

Local:

```text
components/atendimento/ai/ai-status-card.tsx
```

---

## AIReasoningCard

Responsável por:

Mostrar motivo da última ação.

Local:

```text
components/atendimento/ai/ai-reasoning-card.tsx
```

---

## AITransferButton

Responsável por:

Transferir conversa para humano.

Local:

```text
components/atendimento/ai/ai-transfer-button.tsx
```

---

# Shared

## EmptyState

Responsável por:

Estados vazios.

Local:

```text
components/atendimento/shared/empty-state.tsx
```

---

## LoadingState

Responsável por:

Carregamento.

Local:

```text
components/atendimento/shared/loading-state.tsx
```

---

## ErrorState

Responsável por:

Exibição de erros.

Local:

```text
components/atendimento/shared/error-state.tsx
```

---

# Regra de Componentização

Um componente deve ter apenas uma responsabilidade principal.

Se um arquivo ultrapassar aproximadamente 300 linhas:

Avaliar divisão.

---

# Regra de Reutilização

Componentes devem ser reutilizados sempre que possível.

Evitar duplicação de código.

---

# MVP

Obrigatórios:

* AtendimentoLayout
* AtendimentoTopbar
* ConversationsPanel
* ConversationList
* ConversationItem
* ChatPanel
* MessageList
* MessageBubble
* MessageComposer
* ContextPanel
* PatientSummary

Os demais podem ser implementados gradualmente.
