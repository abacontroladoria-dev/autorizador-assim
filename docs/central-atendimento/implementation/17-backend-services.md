# Central de Atendimento Pulsar — Backend Services

> Documento: Backend Services
> Versão: 1.0
> Status: Referência oficial da camada de domínio
>
> Este documento define os serviços responsáveis pelas regras de negócio da Central de Atendimento.

---

# 1. Objetivo

Separar:

```text
Controllers
Providers
Banco
IA
```

das regras de negócio.

Toda lógica deve existir em Services.

---

# 2. Arquitetura

```text
API
↓
Controller
↓
Service
↓
Repository
↓
Supabase
```

---

Nenhum Controller deve possuir regra de negócio.

---

# 3. Estrutura

```text
src

modules

└── atendimento
    │
    ├── services
    │
    ├── repositories
    │
    ├── providers
    │
    ├── controllers
    │
    └── dto
```

---

# 4. Services Principais

V1:

```text
ConversationService

MessageService

ContactResolutionService

NotificationService

InboxService

ChannelService

ProviderFactory

AIService

AuditService
```

---

# 5. ConversationService

Serviço principal.

Responsável pelo ciclo de vida das conversas.

---

# 6. Responsabilidades

```text
Criar conversa

Buscar conversa

Transferir conversa

Assumir conversa

Arquivar conversa

Resolver conversa

Atualizar status
```

---

# 7. Métodos

```typescript
class ConversationService {

  create()

  getById()

  list()

  assign()

  transfer()

  archive()

  resolve()

}
```

---

# 8. Fluxo Nova Conversa

```text
Mensagem Recebida
↓
Resolver Contato
↓
Localizar Conversa Aberta
↓
Existe?
```

Sim:

```text
Adicionar Mensagem
```

---

Não:

```text
Criar Conversa
```

---

# 9. MessageService

Responsável pelas mensagens.

---

# 10. Responsabilidades

```text
Enviar

Receber

Persistir

Processar mídia

Marcar leitura
```

---

# 11. Métodos

```typescript
class MessageService {

  send()

  receive()

  markAsRead()

  uploadMedia()

}
```

---

# 12. Fluxo Envio

```text
Operador
↓
MessageService
↓
ProviderFactory
↓
Provider
```

---

# 13. Fluxo Recebimento

```text
Webhook
↓
Provider
↓
MessageService
↓
ConversationService
```

---

# 14. ContactResolutionService

Serviço responsável por identificar contatos.

---

# 15. Responsabilidades

```text
Resolver contato

Deduplicar

Enriquecer

Vincular pacientes

Atualizar contexto
```

---

# 16. Métodos

```typescript
class ContactResolutionService {

  resolve()

  enrich()

  merge()

  createTemporary()

}
```

---

# 17. Fluxo

```text
Telefone
↓
Buscar contato
↓
Encontrado?
```

Sim:

```text
Retornar
```

---

Não:

```text
Criar provisório
```

---

# 18. NotificationService

Responsável por notificações.

---

# 19. Responsabilidades

```text
Criar notificações

Enviar realtime

Badge

Toast

Som
```

---

# 20. Métodos

```typescript
class NotificationService {

  notify()

  broadcast()

  markAsRead()

}
```

---

# 21. Eventos

```text
Nova mensagem

Transferência

SLA

Menção

Canal offline
```

---

# 22. InboxService

Gerencia áreas operacionais.

---

# 23. Responsabilidades

```text
Criar inbox

Atualizar inbox

Adicionar membros

Remover membros
```

---

# 24. Métodos

```typescript
class InboxService {

  create()

  update()

  addMember()

  removeMember()

}
```

---

# 25. ChannelService

Gerencia canais.

---

# 26. Responsabilidades

```text
Criar canal

Conectar

Desconectar

Monitorar status

Atualizar provider
```

---

# 27. Métodos

```typescript
class ChannelService {

  create()

  connect()

  disconnect()

  getStatus()

}
```

---

# 28. ProviderFactory

Responsável por retornar provider correto.

---

# 29. Fluxo

```text
Provider = evolution
↓
EvolutionProvider
```

---

```text
Provider = meta_waba
↓
MetaWabaProvider
```

---

# 30. Interface

```typescript
interface MessagingProvider {

  sendMessage()

  sendMedia()

  getStatus()

  processWebhook()

}
```

---

# 31. AIService

Camada central da IA.

---

# 32. Responsabilidades

```text
Sugestões

Resumo

Classificação

Sentimento

Resposta automática
```

---

# 33. Métodos

```typescript
class AIService {

  summarize()

  classify()

  analyzeSentiment()

  suggestReply()

  autoReply()

}
```

---

# 34. Model Adapter

A IA nunca deve depender de fornecedor.

---

# 35. Interface

```typescript
interface LLMProvider {

  generate()

}
```

---

Implementações:

```text
OpenAIProvider

ClaudeProvider

GeminiProvider
```

---

# 36. AuditService

Responsável pela rastreabilidade.

---

# 37. Responsabilidades

```text
Registrar eventos

Registrar alterações

Registrar IA

Registrar providers
```

---

# 38. Métodos

```typescript
class AuditService {

  log()

  logConversation()

  logProvider()

  logAI()

}
```

---

# 39. AudioTranscriptionService

Responsável pela transcrição.

---

# 40. Métodos

```typescript
class AudioTranscriptionService {

  transcribe()

  retry()

}
```

---

# 41. Fluxo

```text
Áudio
↓
Storage
↓
Fila
↓
Transcrição
↓
Persistência
```

---

# 42. ContextService

Principal diferencial competitivo.

---

# 43. Responsabilidades

Montar painel contextual.

---

Consumir:

```text
Pacientes

Agenda

Financeiro

Autorizações

Terapeutas
```

---

# 44. Métodos

```typescript
class ContextService {

  buildGuardianContext()

  buildTherapistContext()

  buildLeadContext()

}
```

---

# 45. SLAService

Responsável pelos prazos.

---

# 46. Responsabilidades

```text
Calcular SLA

Monitorar SLA

Disparar alertas
```

---

# 47. Métodos

```typescript
class SLAService {

  calculate()

  validate()

  notifyViolation()

}
```

---

# 48. WebhookProcessingService

Camada única para webhooks.

---

# 49. Responsabilidades

```text
Receber

Persistir

Validar

Processar

Reprocessar
```

---

# 50. Fluxo

```text
Webhook
↓
provider_webhook_logs
↓
Normalização
↓
Service correto
```

---

# 51. Repositories

Cada Service possui Repository próprio.

---

Exemplo:

```text
ConversationRepository

MessageRepository

ContactRepository
```

---

Nunca:

```text
Service acessando banco diretamente
```

---

# 52. Event Bus Interno

Criar barramento interno.

---

Eventos:

```text
conversation.created

message.received

message.sent

conversation.transferred

channel.disconnected

sla.violated
```

---

# 53. Benefícios

Permite:

```text
Notificações

IA

Auditoria

Realtime
```

sem acoplamento.

---

# 54. Jobs Assíncronos

Executar fora da request:

```text
Transcrição

IA

Métricas

Relatórios

Reprocessamento webhook
```

---

# 55. Filas

Recomendação:

```text
Redis

BullMQ
```

---

# 56. Service Account

Criar papel interno:

```text
system
```

Utilizado por:

```text
IA

Workers

Webhooks

Jobs
```

---

# 57. Observabilidade

Todos os Services devem registrar:

```text
Tempo execução

Falhas

Retries

Provider utilizado
```

---

# 58. Critério de Aceite

A camada backend será considerada pronta quando:

```text
ConversationService funcional

MessageService funcional

ProviderFactory funcional

WebhookProcessingService funcional

NotificationService funcional

AIService funcional

AuditService funcional
```

---

# 59. Decisões Arquiteturais

✅ Services concentram regras de negócio

✅ Controllers finos

✅ Repository Pattern

✅ Provider Factory

✅ Event Bus interno

✅ Jobs assíncronos

✅ Redis + BullMQ

✅ Service Account system

✅ IA desacoplada do provider

A próxima etapa obrigatória será:

text
18-api-endpoints.md
