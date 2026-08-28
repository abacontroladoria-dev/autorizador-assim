# Central de Atendimento Pulsar — Arquitetura de Providers

> Documento: Arquitetura de Providers
> Versão: 1.0
> Status: Referência oficial de integração

---

# 1. Objetivo

Este documento define a arquitetura de integração entre a Central de Atendimento do Pulsar e os provedores externos de comunicação.

O objetivo é garantir:

* Independência de fornecedor
* Evolução sem refatoração estrutural
* Suporte simultâneo a múltiplos providers
* Arquitetura omnichannel
* Escalabilidade para novos canais

---

# 2. Princípio Fundamental

A Central de Atendimento não deve depender de nenhum provider específico.

O sistema deve ser capaz de trocar:

```text
Evolution
↓
Meta WABA
↓
Outro Provider
```

sem alterar:

* UX
* Banco de dados
* Regras de negócio
* Fluxos operacionais

---

# 3. Arquitetura Geral

```text
Central Atendimento
        │
        ▼
Provider Layer
        │
 ┌──────┼───────────┐
 │      │           │
 ▼      ▼           ▼
Evolution   Meta WABA   Instagram
```

---

# 4. Conceitos

## Provider

Responsável por comunicar-se com plataformas externas.

Exemplos:

```text
Evolution
Meta WABA
Instagram
```

---

## Channel

Representa uma conexão ativa.

Exemplos:

```text
WhatsApp Recepção

WhatsApp Marketing

Instagram Marketing
```

---

## Inbox

Representa uma área operacional.

Exemplos:

```text
Recepção Realengo
Financeiro
Marketing
RP
```

---

# 5. Arquitetura de Abstração

Todos os providers devem implementar o mesmo contrato.

---

## Interface Base

```typescript
export interface MessagingProvider {

  connect(): Promise<void>

  disconnect(): Promise<void>

  getStatus(): Promise<ProviderStatus>

  sendMessage(
    payload: SendMessagePayload
  ): Promise<SendMessageResult>

  sendMedia(
    payload: SendMediaPayload
  ): Promise<SendMediaResult>

  markAsRead(
    conversationId: string
  ): Promise<void>

  getMedia(
    mediaId: string
  ): Promise<MediaResult>

  processWebhook(
    payload: unknown
  ): Promise<void>
}
```

---

# 6. Provider Registry

A seleção do provider deve ocorrer dinamicamente.

---

## Exemplo

```text
Canal
↓
provider = evolution
↓
EvolutionProvider
```

---

```text
Canal
↓
provider = meta_waba
↓
MetaWabaProvider
```

---

# 7. Provider Factory

```typescript
ProviderFactory.getProvider(
  channel.provider
)
```

Retorna:

```typescript
EvolutionProvider

ou

MetaWabaProvider
```

---

# 8. Estrutura Recomendada

```text
src

├── modules
│
└── messaging
    │
    ├── providers
    │
    ├── evolution
    │
    ├── meta-waba
    │
    ├── instagram
    │
    ├── factory
    │
    └── types
```

---

# 9. Fluxo de Envio

```text
Operador
↓
Central Atendimento
↓
Conversation Service
↓
Provider Factory
↓
Provider
↓
Canal Externo
```

---

# 10. Fluxo de Recebimento

```text
Canal Externo
↓
Webhook
↓
Provider
↓
Normalização
↓
Conversation Service
↓
Banco de Dados
```

---

# 11. Normalização

Cada provider possui formatos diferentes.

Todos os eventos devem ser convertidos para modelos internos.

---

## Exemplo

Evolution:

```json
{
  "event": "messages.upsert"
}
```

---

Meta:

```json
{
  "object": "whatsapp_business_account"
}
```

---

Após normalização:

```json
{
  "eventType": "message_received",
  "conversationId": "...",
  "contactId": "...",
  "message": "Olá"
}
```

---

# 12. Eventos Internos

Eventos suportados:

```text
message_received

message_sent

message_delivered

message_read

message_deleted

media_received

contact_updated

channel_connected

channel_disconnected
```

---

# 13. Webhook Pipeline

Todos os webhooks devem seguir o mesmo fluxo.

```text
Webhook
↓
provider_webhook_logs
↓
Validação
↓
Normalização
↓
Processamento
↓
Evento Interno
↓
Atualização Banco
```

---

# 14. provider_webhook_logs

Tabela obrigatória para auditoria técnica.

Objetivos:

* Diagnóstico
* Reprocessamento
* Auditoria
* Troubleshooting

---

## Regras

O payload bruto nunca deve ser descartado antes do processamento.

---

Fluxo:

```text
Recebe webhook
↓
Salva payload bruto
↓
processed = false
↓
Processa
↓
processed = true
```

---

# 15. Webhook Retry

Caso ocorra falha:

```text
processed = false
error_message preenchido
```

O evento pode ser reprocessado.

---

# 16. Canal Desconectado

Se um provider desconectar:

```text
CONNECTED

↓

DISCONNECTED

↓

RECONNECTING
```

O sistema deve:

* Registrar evento
* Notificar administradores
* Atualizar dashboard

---

# 17. QR Code

Aplicável apenas a providers que utilizam autenticação por QR.

Exemplo:

```text
Evolution
```

---

Fluxo:

```text
Criar Canal
↓
Solicitar QR
↓
Provider
↓
QR Code
↓
Usuário escaneia
↓
Conectado
```

---

# 18. Status Padronizados

Todos os providers devem mapear para:

```text
CONNECTED

CONNECTING

DISCONNECTED

ERROR
```

---

# 19. Upload de Arquivos

O provider não deve armazenar arquivos.

Arquivos devem ser persistidos em:

```text
Supabase Storage
```

---

Providers apenas:

```text
Recebem

ou

Enviam
```

arquivos.

---

# 20. Download de Mídia

Fluxo:

```text
Webhook
↓
Provider
↓
Download arquivo
↓
Supabase Storage
↓
message_attachments
```

---

# 21. IA e Providers

A IA nunca se comunica diretamente com providers.

Fluxo correto:

```text
IA
↓
Conversation Service
↓
Provider Layer
↓
Provider
```

---

# 22. Segurança

Credenciais nunca devem ser expostas ao frontend.

Todo acesso a providers deve ocorrer:

```text
Frontend
↓
Backend
↓
Provider
```

---

# 23. Observabilidade

Cada provider deve registrar:

* Requests
* Errors
* Disconnects
* Reconnections
* Tempo de resposta

---

# 24. Métricas

Por provider:

```text
Mensagens enviadas

Mensagens recebidas

Falhas

Tempo médio resposta

Desconexões

Reconexões
```

---

# 25. Providers Planejados

## V1

```text
Evolution
Meta WABA
```

---

## V2

```text
Instagram
```

---

## Futuro

```text
Facebook Messenger

Telegram

Web Chat

Email
```

---

# 26. Estratégia para SaaS

A camada de provider deve ser completamente reutilizável.

A adição de um novo provider não deve exigir alterações em:

* conversations
* messages
* contacts
* inboxes
* permissions

A única mudança esperada deve ocorrer dentro da camada de integração.

---

# 27. Decisões Arquiteturais

Decisões consideradas definitivas:

✅ Multi-provider

✅ Provider Factory

✅ Provider Registry

✅ Normalização de eventos

✅ provider_webhook_logs

✅ Supabase Storage

✅ Provider desacoplado do domínio

✅ Evolution e WABA simultâneos

✅ Preparação para Instagram

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
