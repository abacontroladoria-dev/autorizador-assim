# Central de Atendimento Pulsar — Database Migrations

> Documento: Database Migrations
> Versão: 1.0
> Status: Referência oficial de implementação do banco de dados
>
> Este documento transforma o modelo conceitual definido em `04-data-model.md`
> em uma estratégia real de migrations para Supabase/PostgreSQL.

---

# 1. Objetivo

Definir:

- Ordem de criação das migrations
- Dependências entre tabelas
- Índices
- Constraints
- Enums
- Estratégia de versionamento

---

# 2. Princípios

Toda migration deve ser:

- Idempotente
- Reversível quando possível
- Comentada
- Pequena
- Atômica

---

# 3. Convenção

Formato:

```text
YYYYMMDDHHMMSS_descricao.sql
```

Exemplo:

```text
20260701000100_create_ca_core.sql
```

---

# 4. Schema

Inicialmente utilizar:

```sql
public
```

Não criar schema separado.

Motivos:

- Consistência com Pulsar atual
- Menos complexidade operacional
- Melhor integração com Supabase

---

# 5. Migration 001

## Core Enums

Arquivo:

```text
20260701000100_create_ca_enums.sql
```

Criar:

```sql
provider_type

conversation_status

contact_type

conversation_intent

ai_mode

notification_priority

channel_status
```

---

# 6. provider_type

```sql
create type provider_type as enum (
  'evolution',
  'meta_waba',
  'instagram'
);
```

---

# 7. conversation_status

```sql
create type conversation_status as enum (
  'open',
  'assigned',
  'waiting',
  'resolved',
  'archived'
);
```

---

# 8. contact_type

```sql
create type contact_type as enum (
  'guardian',
  'patient',
  'therapist',
  'physician',
  'employee',
  'lead',
  'supplier',
  'other'
);
```

---

# 9. conversation_intent

```sql
create type conversation_intent as enum (
  'agenda',
  'autorizacao',
  'financeiro',
  'documentacao',
  'matricula',
  'reclamacao',
  'terapeuta',
  'marketing',
  'outros'
);
```

---

# 10. ai_mode

```sql
create type ai_mode as enum (
  'off',
  'assisted',
  'autonomous'
);
```

---

# 11. Migration 002

Arquivo:

```text
20260701000200_create_ca_inboxes.sql
```

Criar:

```text
inboxes
inbox_members
```

---

# 12. Tabela inboxes

```sql
create table inboxes (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  name text not null,

  description text,

  active boolean default true,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

# 13. Tabela inbox_members

```sql
create table inbox_members (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  inbox_id uuid not null references inboxes(id),

  user_id uuid not null,

  role text not null,

  created_at timestamptz default now()
);
```

---

# 14. Migration 003

Arquivo:

```text
20260701000300_create_ca_channels.sql
```

Criar:

```text
channels
channel_connections
```

---

# 15. channels

```sql
create table channels (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  inbox_id uuid not null references inboxes(id),

  name text not null,

  provider provider_type not null,

  channel_type text not null,

  status text not null,

  active boolean default true,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

# 16. channel_connections

```sql
create table channel_connections (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  channel_id uuid not null references channels(id),

  external_id text,

  provider_instance_id text,

  provider_account_id text,

  provider_metadata jsonb,

  connection_status text,

  last_sync_at timestamptz,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

# 17. Migration 004

Arquivo:

```text
20260701000400_create_ca_contacts.sql
```

Criar:

```text
contacts
contact_identifiers
contact_patient_links
contact_tags
```

---

# 18. contacts

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  name text,

  phone text,

  email text,

  contact_type contact_type not null,

  status text,

  avatar_url text,

  last_interaction_at timestamptz,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

# 19. contact_identifiers

```sql
create table contact_identifiers (
  id uuid primary key default gen_random_uuid(),

  contact_id uuid not null references contacts(id),

  identifier_type text not null,

  identifier_value text not null,

  is_primary boolean default false,

  created_at timestamptz default now()
);
```

---

# 20. Migration 005

Arquivo:

```text
20260701000500_create_ca_conversations.sql
```

Criar:

```text
conversations
conversation_participants
```

---

# 21. conversations

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  inbox_id uuid not null references inboxes(id),

  channel_id uuid not null references channels(id),

  contact_id uuid not null references contacts(id),

  assigned_user_id uuid,

  status conversation_status not null,

  priority text,

  intent conversation_intent,

  sentiment text,

  ai_mode ai_mode not null default 'off',

  last_message_at timestamptz,

  resolved_at timestamptz,

  created_at timestamptz default now(),

  updated_at timestamptz default now()
);
```

---

# 22. Migration 006

Arquivo:

```text
20260701000600_create_ca_messages.sql
```

Criar:

```text
messages
message_attachments
audio_transcriptions
```

---

# 23. messages

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  conversation_id uuid not null references conversations(id),

  external_message_id text,

  direction text,

  message_type text,

  body text,

  provider provider_type,

  sent_by_user_id uuid,

  sent_by_ai boolean default false,

  status text,

  sent_at timestamptz,

  created_at timestamptz default now()
);
```

---

# 24. Migration 007

Arquivo:

```text
20260701000700_create_ca_notes_events.sql
```

Criar:

```text
conversation_notes
conversation_events
```

---

# 25. Migration 008

Arquivo:

```text
20260701000800_create_ca_ai.sql
```

Criar:

```text
ai_interactions
```

---

# 26. Migration 009

Arquivo:

```text
20260701000900_create_ca_notifications.sql
```

Criar:

```text
notifications
```

---

# 27. Migration 010

Arquivo:

```text
20260701001000_create_ca_provider_logs.sql
```

Criar:

```text
provider_webhook_logs
```

---

# 28. provider_webhook_logs

```sql
create table provider_webhook_logs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  provider provider_type not null,

  event_type text not null,

  external_event_id text,

  payload jsonb not null,

  processed boolean default false,

  processed_at timestamptz,

  error_message text,

  received_at timestamptz default now()
);
```

---

# 29. Migration 011

Arquivo:

```text
20260701001100_create_ca_metrics.sql
```

Criar:

```text
conversation_metrics

sla_rules

macros
```

---

# 30. Índices Obrigatórios

contacts

```sql
create index idx_contacts_phone
on contacts(phone);
```

```sql
create index idx_contacts_type
on contacts(contact_type);
```

---

# 31. Índices de Conversa

```sql
create index idx_conversations_contact
on conversations(contact_id);
```

```sql
create index idx_conversations_status
on conversations(status);
```

```sql
create index idx_conversations_inbox
on conversations(inbox_id);
```

```sql
create index idx_conversations_assigned
on conversations(assigned_user_id);
```

---

# 32. Índices de Mensagens

```sql
create index idx_messages_conversation
on messages(conversation_id);
```

```sql
create index idx_messages_sent_at
on messages(sent_at desc);
```

---

# 33. Índices de Auditoria

```sql
create index idx_events_conversation
on conversation_events(conversation_id);
```

```sql
create index idx_webhook_logs_provider
on provider_webhook_logs(provider);
```

---

# 34. Busca Full Text

Preparação futura:

```sql
messages.body

audio_transcriptions.transcription

conversation_notes.content
```

---

Utilizar:

```sql
tsvector
GIN
```

---

# 35. Triggers

Criar trigger padrão:

```sql
updated_at
```

Para:

```text
inboxes
channels
contacts
conversations
channel_connections
```

---

# 36. Soft Delete

Aplicar apenas em:

```text
conversation_notes
```

Campo:

```sql
deleted_at timestamptz
```

---

# 37. Não Utilizar Soft Delete

Nunca aplicar em:

```text
messages

conversation_events

provider_webhook_logs

ai_interactions
```

---

# 38. Estratégia Realtime

Publicar:

```text
conversations

messages

conversation_notes

notifications
```

No Supabase Realtime.

---

# 39. Ordem Obrigatória

Executar migrations:

```text
001 Enums

002 Inboxes

003 Channels

004 Contacts

005 Conversations

006 Messages

007 Notes & Events

008 AI

009 Notifications

010 Provider Logs

011 Metrics
```

---

# 40. Critério de Aceite

A fase de banco será considerada concluída quando:

- Todas as migrations executarem sem erro
- Todos os FKs estiverem válidos
- Índices criados
- Realtime habilitado
- Estrutura pronta para RLS

A próxima etapa obrigatória será:

```text
16-supabase-rls.md
```