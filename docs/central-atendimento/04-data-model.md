# Central de Atendimento Pulsar — Modelo de Dados

> Documento: Modelo de Dados
> Versão: 1.0
> Status: Referência oficial de modelagem
>
> Este documento define as entidades, relacionamentos e diretrizes de persistência da Central de Atendimento.

---

# 1. Objetivos da Modelagem

A modelagem deve atender simultaneamente aos seguintes requisitos:

* Multiempresa (SaaS Ready)
* Multi-Provider
* Omnichannel
* Auditoria completa
* IA nativa
* Integração profunda com o ecossistema Pulsar
* Escalabilidade futura para Instagram e novos canais
* Independência entre UX e provider

---

# 2. Arquitetura Conceitual

```text
Organization
│
├── Users
│
├── Inboxes
│   │
│   └── Channels
│
├── Contacts
│
├── Conversations
│   │
│   ├── Messages
│   ├── Notes
│   ├── Events
│   └── AI Interactions
│
└── Permissions
```

---

# 3. organizations

Representa uma empresa ou clínica.

```sql
organizations

id uuid pk
name text
slug text unique

status text

created_at timestamptz
updated_at timestamptz
```

---

# 4. inboxes

Representa uma área operacional.

Exemplos:

* Recepção Realengo
* Financeiro
* Marketing
* RP

```sql
inboxes

id uuid pk

organization_id uuid fk

name text
description text

active boolean

created_at timestamptz
updated_at timestamptz
```

---

# 5. channels

Representa um canal conectado a uma inbox.

Exemplos:

* WhatsApp WABA
* WhatsApp Evolution
* Instagram

```sql
channels

id uuid pk

organization_id uuid fk
inbox_id uuid fk

name text

provider text
channel_type text

status text

active boolean

created_at timestamptz
updated_at timestamptz
```

---

# 6. channel_connections

Dados específicos do provider.

Separado da tabela principal para evitar acoplamento.

```sql
channel_connections

id uuid pk

organization_id uuid fk

channel_id uuid fk

external_id text

provider_instance_id text

provider_account_id text

provider_metadata jsonb

connection_status text

last_sync_at timestamptz

created_at timestamptz
updated_at timestamptz
```

---

# 7. inbox_members

Usuários autorizados em uma inbox.

```sql
inbox_members

id uuid pk

organization_id uuid fk

inbox_id uuid fk

user_id uuid

role text

created_at timestamptz
```

---

# 8. permissions

Permissões granulares.

```sql
permissions

id uuid pk

organization_id uuid fk

user_id uuid

can_manage_channels boolean

can_view_qr_code boolean

can_manage_ai boolean

can_view_audit boolean

can_manage_inbox boolean

created_at timestamptz
updated_at timestamptz
```

---

# 9. contacts

Entidade principal de relacionamento.

```sql
contacts

id uuid pk

organization_id uuid fk

name text

phone text
email text

contact_type text

status text

avatar_url text

last_interaction_at timestamptz

created_at timestamptz
updated_at timestamptz
```

---

# 10. contact_identifiers

Permite múltiplos identificadores.

Exemplos:

```text
Telefone
Instagram
Facebook
Email
```

```sql
contact_identifiers

id uuid pk

contact_id uuid fk

identifier_type text

identifier_value text

is_primary boolean

created_at timestamptz
```

---

# 11. contact_patient_links

Relacionamento entre contato e paciente.

Exemplo:

```text
Maria
 ├─ Pedro
 └─ Lucas
```

```sql
contact_patient_links

id uuid pk

organization_id uuid fk

contact_id uuid fk

patient_id uuid

relationship text

created_at timestamptz
```

---

# 12. contact_tags

Tags operacionais.

```sql
contact_tags

id uuid pk

organization_id uuid fk

contact_id uuid fk

tag text

created_at timestamptz
```

---

# 13. conversations

Entidade central da Central de Atendimento.

```sql
conversations

id uuid pk

organization_id uuid fk

inbox_id uuid fk

channel_id uuid fk

contact_id uuid fk

assigned_user_id uuid

status text

priority text

intent text

sentiment text

ai_mode text

last_message_at timestamptz

resolved_at timestamptz

created_at timestamptz
updated_at timestamptz
```

---

# 14. conversation_participants

Preparação futura para múltiplos agentes.

```sql
conversation_participants

id uuid pk

conversation_id uuid fk

user_id uuid

role text

joined_at timestamptz
```

---

# 15. messages

Mensagens individuais.

```sql
messages

id uuid pk

organization_id uuid fk

conversation_id uuid fk

external_message_id text

direction text

message_type text

body text

provider text

sent_by_user_id uuid

sent_by_ai boolean

status text

sent_at timestamptz

created_at timestamptz
```

---

# 16. message_attachments

Arquivos anexados.

```sql
message_attachments

id uuid pk

organization_id uuid fk

message_id uuid fk

storage_provider text

file_name text

mime_type text

file_size bigint

storage_path text

public_url text

created_at timestamptz
```

---

# 17. audio_transcriptions

Transcrição de áudio.

```sql
audio_transcriptions

id uuid pk

organization_id uuid fk

message_id uuid fk

provider text

transcription text

confidence numeric

created_at timestamptz
```

---

# 18. conversation_notes

Notas internas.

```sql
conversation_notes

id uuid pk

organization_id uuid fk

conversation_id uuid fk

author_user_id uuid

content text

is_pinned boolean

deleted_at timestamptz

created_at timestamptz
updated_at timestamptz
```

---

# 19. conversation_events

Auditoria operacional.

```sql
conversation_events

id uuid pk

organization_id uuid fk

conversation_id uuid fk

event_type text

user_id uuid

metadata jsonb

created_at timestamptz
```

---

# 20. ai_interactions

Histórico de ações da IA.

```sql
ai_interactions

id uuid pk

organization_id uuid fk

conversation_id uuid fk

message_id uuid

action_type text

prompt text

response text

model text

tokens_input integer

tokens_output integer

created_at timestamptz
```

---

# 21. macros

Respostas rápidas.

```sql
macros

id uuid pk

organization_id uuid fk

inbox_id uuid fk

name text

shortcut text

content text

active boolean

created_at timestamptz
```

---

# 22. sla_rules

Configuração por inbox.

```sql
sla_rules

id uuid pk

organization_id uuid fk

inbox_id uuid fk

first_response_minutes integer

resolution_minutes integer

created_at timestamptz
updated_at timestamptz
```

---

# 23. conversation_metrics

Métricas calculadas.

```sql
conversation_metrics

id uuid pk

conversation_id uuid fk

first_response_seconds integer

resolution_seconds integer

transfers_count integer

messages_count integer

updated_at timestamptz
```

---

# 24. Provider Enum

Valores previstos:

```text
evolution
meta_waba
instagram
```

---

# 25. Contact Type Enum

```text
guardian
patient
therapist
physician
employee
lead
supplier
other
```

---

# 26. Conversation Status Enum

```text
open
assigned
waiting
resolved
archived
```

---

# 27. Conversation Intent Enum

```text
agenda
autorizacao
financeiro
documentacao
matricula
reclamacao
terapeuta
marketing
outros
```

---

# 28. AI Mode Enum

```text
off
assisted
autonomous
```

---

# 29. Estratégia de Storage

Arquivos devem ser armazenados inicialmente em:

```text
Supabase Storage
```

Buckets sugeridos:

```text
chat-media
chat-audio
chat-documents
chat-images
```

---

# 30. Integrações com o Ecossistema Pulsar

A Central de Atendimento não deve duplicar dados.

Deve consumir informações existentes.

Integrações previstas:

```text
Pacientes
Responsáveis
Terapeutas
Agenda TITA
Autorizações
Financeiro
Usuários
Permissões
```

---

# 31. Regras de Auditoria

Nunca remover fisicamente:

```text
messages
conversation_events
ai_interactions
```

Política:

```text
append-only
```

---

# 32. Índices Obrigatórios

```sql
contacts(phone)

contacts(contact_type)

conversations(contact_id)

conversations(status)

conversations(inbox_id)

conversations(assigned_user_id)

messages(conversation_id)

messages(sent_at)

conversation_events(conversation_id)

contact_patient_links(patient_id)
```

---

# 33. Evoluções Futuras

Preparado para:

* Instagram
* Facebook Messenger
* Campanhas
* Broadcast
* Chatbots
* Múltiplos agentes IA
* Distribuição automática
* Filas inteligentes
* Integração com CRM comercial

Sem necessidade de remodelagem estrutural.

# 34. provider_webhook_logs

Armazena payloads brutos recebidos dos providers.

Objetivo:

- Auditoria técnica
- Diagnóstico de falhas
- Reprocessamento de eventos
- Troubleshooting durante integração

```sql
provider_webhook_logs

id uuid pk

organization_id uuid fk

provider text

event_type text

external_event_id text

payload jsonb

processed boolean

processed_at timestamptz

error_message text

received_at timestamptz