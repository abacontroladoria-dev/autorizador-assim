# Central de Atendimento Pulsar — Database Migrations

> Documento: Database Migrations
> Versão: 2.0
> Status: Revisado — pronto para implementation planning
>
> Este documento transforma o modelo conceitual definido em `04-data-model.md`
> em uma estratégia real de migrations para Supabase/PostgreSQL.
>
> **Revisão 2.0 (2026-06-17):** aplicadas 10 correções arquiteturais
> derivadas do architecture review. Ver seção "Histórico de Revisões".

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
20260701000000_create_ca_schema.sql
```

---

# 4. Schema

Utilizar schema dedicado:

```sql
central
```

Não utilizar o schema `public` para tabelas da Central de Atendimento.

Motivos:

- O schema `public` já possui 35 tabelas e 127 migrations do sistema clínico
- Evita colisão de nomes em enums, índices e funções
- Segue padrão estabelecido no projeto: o módulo CCO usa schema `cco`
- Permite RLS isolado sem interferir nas políticas existentes do sistema clínico
- Facilita auditoria e backup segmentado por módulo

Precedente no projeto:

```text
supabase/migrations/20260608000001_cco_schema.sql → CREATE SCHEMA cco;
```

---

# 5. Migration 000

## Schema e Organizations

Arquivo:

```text
20260701000000_create_ca_schema.sql
```

Esta migration deve ser executada antes de todas as demais.

Criar:

```text
Schema central
Tabela central.organizations
```

A tabela `organizations` é a raiz de toda a hierarquia da Central.
Todos os `organization_id` nas demais tabelas são FK para esta tabela.

```sql
create schema if not exists central;

create table central.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  active     boolean default true,
  plan       text,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

# 6. Migration 001

## Core Enums

Arquivo:

```text
20260701000100_create_ca_enums.sql
```

Criar todos os enums no schema `central`:

```text
central.provider_type
central.conversation_status
central.contact_type
central.conversation_intent
central.ai_mode
central.notification_priority
central.channel_status
```

---

# 7. central.provider_type

```sql
create type central.provider_type as enum (
  'evolution',
  'meta_waba',
  'instagram'
);
```

---

# 8. central.conversation_status

```sql
create type central.conversation_status as enum (
  'open',
  'assigned',
  'waiting',
  'resolved',
  'archived'
);
```

---

# 9. central.contact_type

```sql
create type central.contact_type as enum (
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

# 10. central.conversation_intent

```sql
create type central.conversation_intent as enum (
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

# 11. central.ai_mode

```sql
create type central.ai_mode as enum (
  'off',
  'assisted',
  'autonomous'
);
```

---

# 12. central.notification_priority

```sql
create type central.notification_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);
```

---

# 13. central.channel_status

```sql
create type central.channel_status as enum (
  'active',
  'connecting',
  'disconnected',
  'error',
  'suspended'
);
```

---

# 14. Migration 002

Arquivo:

```text
20260701000200_create_ca_inboxes.sql
```

Criar:

```text
central.inboxes
central.inbox_members
```

---

# 15. Tabela central.inboxes

```sql
create table central.inboxes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  name            text not null,
  description     text,
  active          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

---

# 16. Tabela central.inbox_members

```sql
create table central.inbox_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  inbox_id        uuid not null references central.inboxes(id) on delete cascade,
  user_id         uuid not null references public.usuarios(id) on delete cascade,
  role            text not null,
  created_at      timestamptz default now(),
  unique (inbox_id, user_id)
);
```

Nota: `user_id` referencia `public.usuarios(id)`.
FK cross-schema é válida no PostgreSQL.
`ON DELETE CASCADE` remove o membro ao excluir o usuário do sistema clínico.

---

# 17. Migration 003

Arquivo:

```text
20260701000300_create_ca_channels.sql
```

Criar:

```text
central.channels
central.channel_connections
```

---

# 18. central.channels

```sql
create table central.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  inbox_id        uuid not null references central.inboxes(id),
  name            text not null,
  provider        central.provider_type not null,
  channel_type    text not null,
  status          central.channel_status not null default 'disconnected',
  active          boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

---

# 19. central.channel_connections

```sql
create table central.channel_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references central.organizations(id),
  channel_id            uuid not null references central.channels(id),
  external_id           text,
  provider_instance_id  text,
  provider_account_id   text,
  provider_metadata     jsonb,
  connection_status     central.channel_status not null default 'disconnected',
  last_sync_at          timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
```

---

# 20. Migration 004

Arquivo:

```text
20260701000400_create_ca_contacts.sql
```

Criar:

```text
central.contacts
central.contact_identifiers
central.contact_patient_links
central.contact_tags
```

---

# 21. central.contacts

```sql
create table central.contacts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references central.organizations(id),
  name                 text,
  phone                text,
  email                text,
  contact_type         central.contact_type not null default 'other',
  status               text,
  avatar_url           text,
  last_interaction_at  timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
```

---

# 22. central.contact_identifiers

```sql
create table central.contact_identifiers (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references central.contacts(id) on delete cascade,
  identifier_type  text not null,
  identifier_value text not null,
  is_primary       boolean default false,
  created_at       timestamptz default now(),
  unique (contact_id, identifier_type, identifier_value)
);
```

---

# 23. central.contact_patient_links

Vincula contatos da Central aos pacientes do sistema TITA.

```sql
create table central.contact_patient_links (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references central.organizations(id),
  contact_id        uuid not null references central.contacts(id) on delete cascade,
  tita_paciente_id  bigint not null,
  relationship_type text,
  confidence_score  numeric(3,2),
  resolved_by       text,
  resolved_at       timestamptz,
  created_at        timestamptz default now(),
  unique (contact_id, tita_paciente_id)
);
```

Importante: `tita_paciente_id` é do tipo `BIGINT`.

O Pulsar não possui tabela própria de pacientes.
Pacientes existem no sistema TITA com IDs inteiros (`agenda_tita.paciente_id BIGINT`).
Não usar UUID aqui.

---

# 24. central.contact_tags

```sql
create table central.contact_tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  contact_id      uuid not null references central.contacts(id) on delete cascade,
  tag             text not null,
  created_at      timestamptz default now(),
  unique (contact_id, tag)
);
```

---

# 25. Migration 005

Arquivo:

```text
20260701000500_create_ca_conversations.sql
```

Criar:

```text
central.conversations
central.conversation_participants
```

---

# 26. central.conversations

```sql
create table central.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references central.organizations(id),
  inbox_id         uuid not null references central.inboxes(id),
  channel_id       uuid not null references central.channels(id),
  contact_id       uuid not null references central.contacts(id),
  assigned_user_id uuid references public.usuarios(id) on delete set null,
  status           central.conversation_status not null default 'open',
  priority         text,
  intent           central.conversation_intent,
  sentiment        text,
  ai_mode          central.ai_mode not null default 'off',
  last_message_at  timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
```

Nota: `assigned_user_id` referencia `public.usuarios(id)` com `ON DELETE SET NULL`.
Se o operador for removido do sistema clínico, a conversa fica sem atribuição (não é deletada).

---

# 27. central.conversation_participants

```sql
create table central.conversation_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references central.conversations(id) on delete cascade,
  user_id         uuid not null references public.usuarios(id) on delete cascade,
  role            text,
  joined_at       timestamptz default now(),
  unique (conversation_id, user_id)
);
```

---

# 28. Migration 006

Arquivo:

```text
20260701000600_create_ca_messages.sql
```

Criar:

```text
central.messages
central.message_attachments
central.audio_transcriptions
```

---

# 29. central.messages

```sql
create table central.messages (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references central.organizations(id),
  conversation_id     uuid not null references central.conversations(id),
  external_message_id text,
  direction           text,
  message_type        text,
  body                text,
  provider            central.provider_type,
  sent_by_user_id     uuid references public.usuarios(id) on delete set null,
  sent_by_ai          boolean default false,
  status              text,
  sent_at             timestamptz,
  created_at          timestamptz default now()
);
```

Nota: `sent_by_user_id` referencia `public.usuarios(id)` com `ON DELETE SET NULL`.
Mensagens são imutáveis — sem `updated_at`, sem soft delete.

---

# 30. Migration 007

Arquivo:

```text
20260701000700_create_ca_notes_events.sql
```

Criar:

```text
central.conversation_notes
central.conversation_events
```

---

# 31. central.conversation_notes

```sql
create table central.conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  conversation_id uuid not null references central.conversations(id),
  author_user_id  uuid references public.usuarios(id) on delete set null,
  content         text not null,
  is_pinned       boolean default false,
  deleted_at      timestamptz default null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

Soft delete via `deleted_at`. Ver seção de índice parcial.

---

# 32. central.conversation_events

```sql
create table central.conversation_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  conversation_id uuid not null references central.conversations(id),
  event_type      text not null,
  actor_user_id   uuid references public.usuarios(id) on delete set null,
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz default now()
);
```

Append-only: sem `updated_at`, sem soft delete, sem UPDATE/DELETE por cliente.
Toda auditoria de conversa (atribuição, transferência, encerramento) registra aqui.

---

# 33. Migration 008

Arquivo:

```text
20260701000800_create_ca_ai.sql
```

Criar:

```text
central.ai_interactions
```

```sql
create table central.ai_interactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  conversation_id uuid not null references central.conversations(id),
  message_id      uuid references central.messages(id) on delete set null,
  interaction_type text not null,
  model_used      text,
  prompt_tokens   integer,
  completion_tokens integer,
  input_data      jsonb,
  output_data     jsonb,
  cost_usd        numeric(10,6),
  duration_ms     integer,
  created_at      timestamptz default now()
);
```

---

# 34. Migration 009

Arquivo:

```text
20260701000900_create_ca_notifications.sql
```

Criar:

```text
central.notifications
```

```sql
create table central.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references central.organizations(id),
  user_id         uuid not null references public.usuarios(id) on delete cascade,
  type            text not null,
  priority        central.notification_priority not null default 'low',
  title           text not null,
  body            text,
  data            jsonb,
  read_at         timestamptz,
  conversation_id uuid references central.conversations(id) on delete cascade,
  created_at      timestamptz default now()
);
```

---

# 35. Migration 010

Arquivo:

```text
20260701001000_create_ca_provider_logs.sql
```

Criar:

```text
central.provider_webhook_logs
```

---

# 36. central.provider_webhook_logs

```sql
create table central.provider_webhook_logs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references central.organizations(id),
  provider          central.provider_type not null,
  event_type        text not null,
  external_event_id text,
  payload           jsonb not null,
  processed         boolean default false,
  processed_at      timestamptz,
  error_message     text,
  received_at       timestamptz default now()
);
```

Append-only: sem `updated_at`, sem soft delete.
`processed` é o único campo que o worker atualiza (via service role).

---

# 37. Migration 011

Arquivo:

```text
20260701001100_create_ca_metrics.sql
```

Criar:

```text
central.conversation_metrics
central.sla_rules
central.macros
```

---

# 38. Índices Obrigatórios

Em arquitetura multi-tenant toda query começa com `WHERE organization_id = X`.
Todos os índices usam `organization_id` como leading column.

---

# 39. Índices de Contacts

```sql
create index idx_contacts_org_phone
  on central.contacts(organization_id, phone);

create index idx_contacts_org_type
  on central.contacts(organization_id, contact_type);
```

---

# 40. Índices de Conversations

```sql
create index idx_conversations_org_inbox_status
  on central.conversations(organization_id, inbox_id, status);

create index idx_conversations_org_contact
  on central.conversations(organization_id, contact_id);

create index idx_conversations_assigned
  on central.conversations(assigned_user_id)
  where assigned_user_id is not null;
```

---

# 41. Índices de Messages

```sql
create index idx_messages_conversation_sent
  on central.messages(conversation_id, sent_at desc);
```

---

# 42. Índices de Auditoria

```sql
create index idx_events_conversation
  on central.conversation_events(conversation_id, created_at desc);

create index idx_webhook_logs_org_provider_unprocessed
  on central.provider_webhook_logs(organization_id, provider, received_at)
  where processed = false;
```

O índice parcial `WHERE processed = false` é crítico para o worker de processamento:
a tabela cresce rápido e quase todos os registros ficam `processed = true` com o tempo.

---

# 43. Índice de Inbox Members

```sql
create index idx_inbox_members_user
  on central.inbox_members(user_id, inbox_id);
```

Usado pelo `user_has_inbox_access()` em cada checagem de RLS.

---

# 44. Busca Full Text

Preparação futura:

```sql
central.messages.body

central.audio_transcriptions.transcription

central.conversation_notes.content
```

Utilizar:

```sql
tsvector
GIN
```

---

# 45. Triggers

Reutilizar a função de trigger de `updated_at` já existente no projeto.

Verificar nas migrations existentes qual função está em uso
(provável `moddatetime` via extensão Supabase ou `handle_updated_at` custom).
Não criar nova função — referenciar a existente.

Exemplo de uso:

```sql
create trigger set_updated_at
before update on central.inboxes
for each row execute function moddatetime(updated_at);
```

Aplicar nas tabelas:

```text
central.organizations
central.inboxes
central.channels
central.contacts
central.conversations
central.channel_connections
central.conversation_notes
```

---

# 46. Soft Delete

Aplicar apenas em:

```text
central.conversation_notes
```

Campo:

```sql
deleted_at timestamptz default null
```

Índice parcial obrigatório para queries de notas ativas:

```sql
create index idx_notes_conversation_active
  on central.conversation_notes(conversation_id, created_at desc)
  where deleted_at is null;
```

Toda query de listagem de notas deve incluir: `WHERE deleted_at IS NULL`

---

# 47. Não Utilizar Soft Delete

Nunca aplicar em:

```text
central.messages
central.conversation_events
central.provider_webhook_logs
central.ai_interactions
```

---

# 48. Estratégia Realtime

Publicar no Supabase Realtime:

```text
central.conversations
central.messages
central.conversation_notes
central.notifications
```

Todas as subscriptions respeitam RLS automaticamente.

---

# 49. Ordem Obrigatória

Executar migrations:

```text
000  Schema + Organizations
001  Enums
002  Inboxes
003  Channels
004  Contacts
005  Conversations
006  Messages
007  Notes & Events
008  AI
009  Notifications
010  Provider Logs
011  Metrics
```

---

# 50. Critério de Aceite

A fase de banco será considerada concluída quando:

- Todas as migrations executarem sem erro
- Schema `central` existir e isolado de `public`
- Todos os FKs estiverem válidos (incluindo cross-schema para `public.usuarios`)
- Índices criados (compostos com `organization_id` como leading column)
- Índice parcial de soft delete criado
- Realtime habilitado nas 4 tabelas
- Estrutura pronta para RLS

A próxima etapa obrigatória será:

```text
16-supabase-rls.md
```

---

# 51. Histórico de Revisões

## Versão 2.0 — 2026-06-17

Correções aplicadas com base no architecture review:

| # | Correção |
|---|---|
| C1 | Schema alterado de `public` para `central` |
| C2 | Todos os enums prefixados com `central.` |
| C3 | Migration 000 adicionada para `central.organizations` |
| C4 | FKs adicionadas: `organization_id → central.organizations`, `user_id → public.usuarios` |
| C5 | `contact_patient_links.tita_paciente_id` definido como `BIGINT` com DDL explícito |
| C6 | DDL adicionado para `central.channel_status` e `central.notification_priority` |
| C7 | Índices convertidos para compostos com `organization_id` como leading column |
| C8 | Trigger `updated_at` referencia função existente do projeto (não duplica) |
| C9 | Índice parcial `WHERE deleted_at IS NULL` adicionado para `conversation_notes` |
| C10 | `messages.sent_by_user_id` com `references public.usuarios(id) ON DELETE SET NULL` |
