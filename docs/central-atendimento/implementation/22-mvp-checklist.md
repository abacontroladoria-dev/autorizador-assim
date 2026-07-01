# Central de Atendimento Pulsar — MVP Checklist

> Documento: MVP Checklist
> Versão: 1.0
> Status: Plano oficial de execução
>
> Este documento define a sequência operacional de implementação da Central de Atendimento até a primeira versão funcional em produção.

---

# 1. Objetivo

Entregar um MVP funcional capaz de:

- Conectar WhatsApp via Evolution
- Gerenciar múltiplos números
- Operar com múltiplas inboxes
- Permitir atendimento humano
- Exibir contexto do contato
- Possuir IA assistiva
- Estar preparado para WABA

---

# 2. Escopo do MVP

Inclui:

```text
Evolution

Conversas

Mensagens

Notas

Transferências

Permissões

Painel Contextual

IA Assistiva
```

---

Não inclui:

```text
Instagram

Campanhas

Broadcast

Multiagentes IA

Automações avançadas

Chatbot complexo
```

---

# FASE 1 — BANCO DE DADOS

## Migrations

### Core

```text
[ ] Criar enums

[ ] Criar inboxes

[ ] Criar inbox_members

[ ] Criar channels

[ ] Criar channel_connections

[ ] Criar contacts

[ ] Criar contact_identifiers

[ ] Criar contact_patient_links

[ ] Criar conversations

[ ] Criar messages

[ ] Criar message_attachments

[ ] Criar conversation_notes

[ ] Criar conversation_events

[ ] Criar notifications

[ ] Criar ai_interactions

[ ] Criar provider_webhook_logs
```

---

### Índices

```text
[ ] contacts(phone)

[ ] conversations(contact_id)

[ ] conversations(inbox_id)

[ ] messages(conversation_id)

[ ] provider_webhook_logs(provider)
```

---

### Triggers

```text
[ ] updated_at

[ ] audit triggers
```

---

# FASE 2 — SEGURANÇA

## RLS

```text
[ ] Habilitar RLS

[ ] Criar helper functions

[ ] Criar policies

[ ] Testar multiempresa

[ ] Testar inbox access

[ ] Testar operator restrictions
```

---

## JWT

```text
[ ] organization_id

[ ] role

[ ] user_id
```

---

# FASE 3 — BACKEND

## Services

```text
[ ] ConversationService

[ ] MessageService

[ ] ContactResolutionService

[ ] NotificationService

[ ] InboxService

[ ] ChannelService

[ ] AIService

[ ] AuditService

[ ] SLAService

[ ] ContextService
```

---

## Repositories

```text
[ ] ConversationRepository

[ ] MessageRepository

[ ] ContactRepository

[ ] ChannelRepository
```

---

# FASE 4 — PROVIDER LAYER

## Interfaces

```text
[ ] MessagingProvider

[ ] LLMProvider

[ ] TranscriptionProvider
```

---

## Factory

```text
[ ] ProviderFactory
```

---

# FASE 5 — EVOLUTION

## Infraestrutura

```text
[ ] Container Evolution

[ ] Container Redis

[ ] SSL

[ ] Domínio

[ ] API Key
```

---

## Integração

```text
[ ] Criar instância

[ ] Gerar QR

[ ] Conectar WhatsApp

[ ] Receber webhook

[ ] Salvar webhook

[ ] Processar mensagens

[ ] Enviar mensagens
```

---

## Testes

```text
[ ] Texto

[ ] Imagem

[ ] PDF

[ ] Áudio

[ ] Reconexão
```

---

# FASE 6 — API

## Endpoints

```text
[ ] Conversas

[ ] Mensagens

[ ] Contatos

[ ] Inboxes

[ ] Canais

[ ] Notas

[ ] IA

[ ] Transferência
```

---

## Webhooks

```text
[ ] Evolution

[ ] Health Check
```

---

# FASE 7 — FRONTEND

## Workspace

```text
[ ] Layout sem sidebar

[ ] Layout full-width

[ ] Tema dark

[ ] Responsividade
```

---

## Estrutura

```text
[ ] Lista Conversas

[ ] Chat

[ ] Context Panel

[ ] Composer

[ ] Notificações
```

---

# FASE 8 — REALTIME

## Supabase

```text
[ ] Messages

[ ] Conversations

[ ] Notifications

[ ] Notes
```

---

## Testes

```text
[ ] Nova mensagem

[ ] Transferência

[ ] Nota interna

[ ] Notificação

[ ] Reconexão
```

---

# FASE 9 — CONTEXT ENGINE

## Contact Resolution

```text
[ ] Resolver telefone

[ ] Resolver responsável

[ ] Resolver terapeuta

[ ] Resolver lead
```

---

## Widgets

```text
[ ] PatientWidget

[ ] AgendaWidget

[ ] AuthorizationWidget

[ ] FinancialWidget

[ ] TherapistWidget
```

---

## Painel

```text
[ ] Contexto responsável

[ ] Contexto terapeuta

[ ] Contexto lead
```

---

# FASE 10 — IA ASSISTIVA

## Integração

```text
[ ] Claude

ou

[ ] OpenAI
```

---

## Funcionalidades

```text
[ ] Resumo

[ ] Classificação

[ ] Sentimento

[ ] Smart Reply

[ ] Reescrita
```

---

## Modos

```text
[ ] OFF

[ ] ASSISTED
```

---

# FASE 11 — TRANSCRIÇÃO

## Áudios

```text
[ ] Upload

[ ] Download

[ ] Storage

[ ] Transcrição
```

---

## IA

```text
[ ] Resumo áudio

[ ] Sugestão resposta
```

---

# FASE 12 — AUDITORIA

## Eventos

```text
[ ] Conversa criada

[ ] Conversa transferida

[ ] Mensagem enviada

[ ] IA respondeu

[ ] Canal conectado
```

---

## Logs

```text
[ ] provider_webhook_logs

[ ] conversation_events

[ ] ai_interactions
```

---

# FASE 13 — TESTES MVP

## Operador

```text
[ ] Recebe conversa

[ ] Responde conversa

[ ] Cria nota

[ ] Transfere conversa
```

---

## Supervisor

```text
[ ] Visualiza inbox

[ ] Assume conversa

[ ] Transfere conversa
```

---

## Admin

```text
[ ] Cria canal

[ ] Gera QR

[ ] Configura inbox

[ ] Visualiza auditoria
```

---

# FASE 14 — GO LIVE

## Infraestrutura

```text
[ ] SSL ativo

[ ] Backup ativo

[ ] Logs ativos

[ ] Monitoramento ativo
```

---

## Produção

```text
[ ] Canal Marketing

[ ] Canal RP

[ ] Canal Relacionamento
```

---

## Primeiros Usuários

```text
[ ] Admin

[ ] Diretoria

[ ] Marketing

[ ] RP
```

---

# MVP Concluído Quando

Todos os itens abaixo forem verdadeiros:

```text
✅ QR conecta

✅ Recebe mensagens

✅ Envia mensagens

✅ Múltiplos números

✅ Múltiplas inboxes

✅ Permissões funcionando

✅ Contexto do contato funcionando

✅ Notas internas funcionando

✅ Transferências funcionando

✅ Realtime funcionando

✅ IA assistiva funcionando

✅ Auditoria funcionando
```

---

# Pós-MVP (V1.1)

```text
[ ] Meta WABA

[ ] Templates

[ ] Presence

[ ] Typing Indicator

[ ] Mobile Layout

[ ] Dashboard Analytics
```

---

# Pós-MVP (V2)

```text
[ ] Instagram

[ ] Campanhas

[ ] Broadcast

[ ] IA Autônoma

[ ] Multiagentes

[ ] SaaS Multiempresa Completo
```

---

# Decisão Final

O MVP oficial do Pulsar será composto por:

```text
Evolution API

Workspace Premium

Inboxes

Conversas

Mensagens

Notas

Transferências

Painel Contextual

IA Assistiva

Auditoria

Realtime
```

Tudo que estiver fora desta lista é considerado evolução futura e não deve bloquear a entrega da V1.
