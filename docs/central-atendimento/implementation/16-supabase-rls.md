# Central de Atendimento Pulsar — Supabase RLS

> Documento: Supabase Row Level Security
> Versão: 1.0
> Status: Referência oficial de segurança e isolamento de dados
>
> Este documento define a estratégia de RLS (Row Level Security) para a Central de Atendimento do Pulsar.

---

# 1. Objetivo

Garantir:

- Isolamento entre organizações
- Controle por Inbox
- Controle por Papel
- Segurança LGPD
- Segurança SaaS

---

# 2. Princípio Fundamental

Toda consulta deve respeitar:

```sql
organization_id
```

Nenhum usuário poderá acessar dados de outra organização.

---

# 3. Arquitetura de Segurança

Camadas:

```text
Nível 1
Organization

Nível 2
Inbox

Nível 3
Role

Nível 4
Permission
```

---

# 4. JWT Claims

O Pulsar deve adicionar ao JWT:

```json
{
  "sub": "...",
  "organization_id": "...",
  "role": "admin"
}
```

---

# 5. Funções SQL

Criar helper functions.

---

# 6. current_organization_id()

```sql
create or replace function current_organization_id()
returns uuid
language sql
stable
as $$
  select (
    auth.jwt() ->> 'organization_id'
  )::uuid;
$$;
```

---

# 7. current_role()

```sql
create or replace function current_role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'role';
$$;
```

---

# 8. current_user_id()

```sql
create or replace function current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;
```

---

# 9. Papéis

Papéis globais:

```text
admin

director

supervisor

operator
```

---

# 10. Admin

Possui acesso total.

Dentro da própria organização.

---

# 11. Director

Possui acesso leitura total.

Pode visualizar todas as Inboxes.

---

# 12. Supervisor

Possui acesso apenas às Inboxes autorizadas.

---

# 13. Operator

Possui acesso apenas:

- Inbox autorizada
- Conversas atribuídas
- Conversas da própria Inbox

---

# 14. Inbox Membership

Fonte oficial:

```text
inbox_members
```

---

Estrutura:

```sql
user_id

inbox_id

role
```

---

# 15. Helper Function

Criar:

```sql
user_has_inbox_access()
```

---

# 16. user_has_inbox_access()

```sql
create or replace function user_has_inbox_access(
  target_inbox uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from inbox_members
    where inbox_id = target_inbox
      and user_id = auth.uid()
  );
$$;
```

---

# 17. Habilitar RLS

Obrigatório em todas as tabelas.

---

Exemplo:

```sql
alter table contacts
enable row level security;
```

---

# 18. Tabelas Protegidas

```text
inboxes

channels

contacts

contact_identifiers

contact_patient_links

conversations

messages

message_attachments

conversation_notes

conversation_events

notifications

permissions

ai_interactions

provider_webhook_logs
```

---

# 19. Política Base

Toda tabela deve possuir:

```sql
organization_id =
current_organization_id()
```

---

# 20. Contacts Policy

```sql
create policy contacts_select
on contacts
for select
using (
  organization_id =
  current_organization_id()
);
```

---

# 21. Contacts Insert

```sql
create policy contacts_insert
on contacts
for insert
with check (
  organization_id =
  current_organization_id()
);
```

---

# 22. Contacts Update

```sql
create policy contacts_update
on contacts
for update
using (
  organization_id =
  current_organization_id()
);
```

---

# 23. Inboxes Policy

```sql
create policy inboxes_select
on inboxes
for select
using (
  organization_id =
  current_organization_id()
);
```

---

# 24. Channels Policy

```sql
create policy channels_select
on channels
for select
using (
  organization_id =
  current_organization_id()
);
```

---

# 25. Conversas

Além da organização:

Deve respeitar Inbox.

---

# 26. Conversations Policy

```sql
create policy conversations_select
on conversations
for select
using (

  organization_id =
  current_organization_id()

  and

  (
    current_role() in (
      'admin',
      'director'
    )

    or

    user_has_inbox_access(
      inbox_id
    )
  )
);
```

---

# 27. Operator Restriction

Operador visualiza:

```text
Inbox autorizada
```

ou

```text
Conversa atribuída
```

---

# 28. Policy Operador

```sql
create policy conversations_operator
on conversations
for select
using (

  organization_id =
  current_organization_id()

  and

  (

    assigned_user_id =
    current_user_id()

    or

    user_has_inbox_access(
      inbox_id
    )
  )
);
```

---

# 29. Messages

Mensagens herdam acesso da conversa.

---

# 30. Message Access

```sql
create policy messages_select
on messages
for select
using (

  exists (

    select 1
    from conversations c
    where c.id =
      messages.conversation_id

    and c.organization_id =
      current_organization_id()

    and (
      current_role() in (
        'admin',
        'director'
      )

      or

      user_has_inbox_access(
        c.inbox_id
      )
    )
  )
);
```

---

# 31. Notes

Mesma regra das conversas.

---

# 32. Events

Mesma regra das conversas.

---

# 33. Notifications

Somente dono da notificação.

---

# 34. Notifications Policy

```sql
create policy notifications_select
on notifications
for select
using (
  user_id =
  current_user_id()
);
```

---

# 35. AI Interactions

Visibilidade:

```text
Admin
Director
Supervisor
```

---

Operador:

Apenas da conversa acessível.

---

# 36. Provider Logs

Acesso extremamente restrito.

---

Podem acessar:

```text
Admin

Director
```

---

# 37. provider_webhook_logs Policy

```sql
create policy provider_logs_select
on provider_webhook_logs
for select
using (

  organization_id =
  current_organization_id()

  and

  current_role() in (
    'admin',
    'director'
  )
);
```

---

# 38. Permissions Table

Somente Admin.

---

```sql
create policy permissions_select
on permissions
for select
using (
  current_role() = 'admin'
);
```

---

# 39. QR Code Security

QR Codes nunca devem ser armazenados.

Devem existir apenas:

```text
Memória

Cache

Provider
```

---

# 40. Service Role

O backend utilizará:

```text
SUPABASE_SERVICE_ROLE_KEY
```

apenas para:

```text
Webhooks

Jobs

IA

Integrações
```

---

Nunca:

```text
Frontend
```

---

# 41. Realtime Security

Todas as subscriptions devem respeitar RLS.

---

Tabelas realtime:

```text
messages

conversations

notifications

conversation_notes
```

---

# 42. Storage Buckets

Buckets:

```text
chat-images

chat-audio

chat-documents
```

---

# 43. Storage Policy

Download permitido apenas se:

```sql
organization_id =
current_organization_id()
```

---

# 44. Auditoria

Toda tentativa de acesso negado deve registrar:

```text
user_id

resource

timestamp
```

---

# 45. Testes Obrigatórios

Validar:

### Admin

```text
Vê tudo
```

### Director

```text
Vê tudo
Não altera permissões
```

### Supervisor

```text
Vê apenas inboxes autorizadas
```

### Operator

```text
Não vê outras inboxes
```

### Multiempresa

```text
Empresa A não vê Empresa B
```

---

# 46. Checklist de Segurança

Antes da produção:

```text
[ ] RLS habilitado em todas as tabelas

[ ] Policies criadas

[ ] Storage protegido

[ ] JWT possui organization_id

[ ] JWT possui role

[ ] Service Role somente backend

[ ] Realtime validado

[ ] Testes multiempresa executados
```

---

# 47. Decisões Arquiteturais

Consideradas definitivas:

✅ Segurança baseada em organization_id

✅ Controle por Inbox

✅ Controle por Papel

✅ JWT enriquecido

✅ RLS em todas as tabelas

✅ Realtime protegido

✅ Provider Logs restritos

✅ Service Role apenas backend

✅ Arquitetura SaaS segura

A próxima etapa obrigatória será:

```text
17-backend-services.md
```