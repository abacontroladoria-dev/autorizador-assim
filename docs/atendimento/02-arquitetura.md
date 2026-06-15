# Arquitetura

## Objetivo

Definir a arquitetura técnica do módulo Pulsar Atendimento.

O projeto deve seguir os mesmos princípios arquiteturais já utilizados no Pulsar:

* Simplicidade
* Escalabilidade
* Reutilização
* Baixo acoplamento

---

# Stack Tecnológica

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui

---

## Backend

* Next.js Route Handlers
* Server Components
* Server Actions

---

## Banco de Dados

* Supabase
* PostgreSQL

---

## Tempo Real

* Supabase Realtime

Utilizado para:

* Novas mensagens
* Atualização de conversas
* Indicadores online

---

## IA

Arquitetura compatível com:

* OpenAI
* Claude
* Gemini

O sistema nunca deve depender diretamente de um fornecedor.

---

## WhatsApp

Arquitetura baseada em Providers.

Implementações previstas:

* MetaProvider
* EvolutionProvider

---

# Estrutura de Rotas

## Área Principal

```text
/atendimento
```

Página inicial.

---

## Configurações

```text
/atendimento/configuracoes
```

---

## Automações

```text
/atendimento/automacoes
```

---

## IA

```text
/atendimento/ia
```

---

# Estrutura de Pastas

```text
app
│
├─ atendimento
│  ├─ page.tsx
│  ├─ layout.tsx
│  ├─ loading.tsx
│  └─ error.tsx
│
├─ api
│  ├─ whatsapp
│  ├─ ai
│  └─ atendimento
```

---

# Estrutura de Componentes

```text
components
│
├─ atendimento
│  ├─ conversations
│  ├─ chat
│  ├─ context-panel
│  ├─ topbar
│  └─ shared
```

---

# Estrutura de Serviços

```text
services
│
├─ atendimento
│
├─ whatsapp
│
├─ ai
│
└─ crm
```

---

# Estrutura de Providers

```text
providers
│
├─ messaging
│  ├─ meta.provider.ts
│  ├─ evolution.provider.ts
│
├─ ai
│  ├─ openai.provider.ts
│  ├─ claude.provider.ts
│  └─ gemini.provider.ts
```

---

# Princípio de Baixo Acoplamento

A aplicação nunca deve acessar APIs externas diretamente.

Sempre utilizar:

```text
Provider
↓
Service
↓
Application
```

---

# Fluxo de Mensagens

Recebimento:

```text
WhatsApp
↓
Webhook
↓
Provider
↓
Service
↓
Banco
↓
Realtime
↓
Frontend
```

---

Envio:

```text
Frontend
↓
Service
↓
Provider
↓
WhatsApp
```

---

# Supabase como Fonte Principal

O Supabase será responsável por:

* Conversas
* Mensagens
* Contatos
* Tags
* Logs
* Configurações

---

# Realtime

Atualizações em tempo real devem utilizar:

Supabase Realtime

Eventos:

* Nova mensagem
* Conversa atualizada
* Conversa assumida
* Conversa encerrada

---

# Estado da Aplicação

Preferência:

* React Query
* Server Components

Evitar:

* Redux
* Zustand global excessivo

Utilizar estado local sempre que possível.

---

# Permissões

O módulo deve utilizar o mesmo sistema de permissões do Pulsar.

Não criar sistema paralelo de autenticação.

---

# Logs

Todas as ações importantes devem gerar logs.

Exemplos:

* Mensagem recebida
* Mensagem enviada
* IA respondeu
* Conversa transferida
* Conversa encerrada

---

# Escalabilidade

A arquitetura deve suportar:

* Múltiplas clínicas
* Múltiplos números
* Múltiplos operadores

sem necessidade de reescrita.

---

# Performance

Objetivos:

* Abrir conversa em menos de 500ms
* Atualização em tempo real
* Scroll fluido
* Sem refresh manual

---

# MVP

Implementar primeiro:

1. Conversas
2. Mensagens
3. Realtime
4. WhatsApp
5. Painel Contextual
6. IA

Qualquer funcionalidade além disso deve ser considerada fase posterior.
