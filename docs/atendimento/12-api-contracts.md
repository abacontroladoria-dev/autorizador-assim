# API Contracts

## Objetivo

Definir os contratos internos de API do módulo Pulsar Atendimento.

Este documento serve como fonte oficial para:

* Frontend
* Backend
* Integrações
* IA
* WhatsApp

Todos os contratos devem permanecer consistentes.

---

# Convenções

## Formato

Todas as APIs retornam:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

ou

```json
{
  "success": false,
  "data": null,
  "error": {
    "message": "Descrição do erro"
  }
}
```

---

# Conversations API

## Listar Conversas

```http
GET /api/atendimento/conversations
```

Resposta:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "contactName": "Maria Silva",
      "lastMessage": "Gostaria de remarcar",
      "lastMessageAt": "2026-06-14T10:00:00",
      "unreadCount": 2,
      "status": "open"
    }
  ]
}
```

---

## Buscar Conversa

```http
GET /api/atendimento/conversations/{id}
```

Resposta:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "contactId": "uuid",
    "status": "open"
  }
}
```

---

## Assumir Conversa

```http
POST /api/atendimento/conversations/{id}/assign
```

Body:

```json
{
  "userId": "uuid"
}
```

---

## Encerrar Conversa

```http
POST /api/atendimento/conversations/{id}/close
```

Body:

```json
{}
```

---

# Messages API

## Listar Mensagens

```http
GET /api/atendimento/conversations/{id}/messages
```

Resposta:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "senderType": "customer",
      "content": "Olá",
      "createdAt": "2026-06-14T10:00:00"
    }
  ]
}
```

---

## Enviar Mensagem

```http
POST /api/atendimento/messages/send
```

Body:

```json
{
  "conversationId": "uuid",
  "content": "Olá"
}
```

Resposta:

```json
{
  "success": true,
  "data": {
    "messageId": "uuid"
  }
}
```

---

# Contacts API

## Buscar Contato

```http
GET /api/atendimento/contacts/{id}
```

Resposta:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Maria Silva",
    "phone": "21999999999"
  }
}
```

---

## Pesquisar Contatos

```http
GET /api/atendimento/contacts/search?q=maria
```

Resposta:

```json
{
  "success": true,
  "data": []
}
```

---

# Context API

## Resumo do Paciente

```http
GET /api/atendimento/context/{contactId}
```

Resposta:

```json
{
  "success": true,
  "data": {
    "responsavel": {},
    "paciente": {},
    "terapeuta": {},
    "financeiro": {},
    "agenda": {}
  }
}
```

---

# IA API

## Classificar Intenção

```http
POST /api/atendimento/ai/classify
```

Body:

```json
{
  "conversationId": "uuid",
  "message": "Gostaria de remarcar"
}
```

Resposta:

```json
{
  "intent": "remarcacao",
  "confidence": 0.96
}
```

---

## Sugestão de Resposta

```http
POST /api/atendimento/ai/suggest
```

Resposta:

```json
{
  "suggestion": "Claro, qual dia deseja remarcar?"
}
```

---

## Resumo de Conversa

```http
POST /api/atendimento/ai/summarize
```

Resposta:

```json
{
  "summary": "Cliente solicitou remarcação."
}
```

---

# WhatsApp API

## Webhook

```http
POST /api/webhooks/whatsapp
```

Recebe eventos do provider.

Exemplos:

* Nova mensagem
* Mensagem entregue
* Mensagem lida

---

## Health Check

```http
GET /api/webhooks/whatsapp/health
```

Resposta:

```json
{
  "provider": "meta",
  "status": "online"
}
```

---

# Provider Contract

## MessagingProvider

Todos os providers devem implementar:

```typescript
interface MessagingProvider {

  sendMessage()

  sendImage()

  sendDocument()

  markAsRead()

  getContact()

}
```

---

# AI Provider Contract

Todos os provedores de IA devem implementar:

```typescript
interface AIProvider {

  classifyIntent()

  suggestReply()

  summarizeConversation()

}
```

---

# Eventos Realtime

## Nova Mensagem

Canal:

```text
messages
```

Payload:

```json
{
  "conversationId": "uuid",
  "messageId": "uuid"
}
```

---

## Conversa Atualizada

Canal:

```text
conversations
```

Payload:

```json
{
  "conversationId": "uuid"
}
```

---

# Integração TITA

Os contratos internos nunca devem consumir diretamente os endpoints da TITA.

Criar camada:

```text
TitaService
```

Responsável por:

* Buscar agenda
* Buscar disponibilidade
* Criar agendamento
* Buscar favorecidos

O restante do sistema conversa apenas com:

```text
ContextService
```

---

# Versionamento

Versão inicial:

```text
v1
```

Mudanças incompatíveis devem gerar nova versão de contrato.

---

# MVP

Obrigatórios:

* Conversations API
* Messages API
* Context API
* WhatsApp Webhook
* AI API

Demais contratos podem evoluir posteriormente.
