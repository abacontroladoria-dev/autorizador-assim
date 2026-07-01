# Central de Atendimento Pulsar — Supabase RLS

> Documento: Supabase Row Level Security
> Versão: 2.0
> Status: Revisado — pronto para implementation planning
>
> Este documento define a estratégia de RLS (Row Level Security) para a Central de Atendimento do Pulsar.
>
> **Revisão 2.0 (2026-06-17):** aplicadas 11 correções arquiteturais
> derivadas do architecture review. Ver seção "Histórico de Revisões".

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

O Pulsar deve adicionar claims customizadas ao JWT via Supabase Auth Hook.

Claims a adicionar:

```json
{
  "sub": "...",
  "organization_id": "...",
  "central_role": "operator"
}
```

Importante: não utilizar `"role"` como claim customizada.
O Supabase usa internamente `"role": "authenticated" | "anon" | "service_role"`.
Sobrescrever este campo quebra o sistema de autenticação.
Por isso a claim de papel na Central é `central_role`.

---

# 5. Auth Hook — Enriquecimento do JWT

O Supabase não popula claims customizadas automaticamente.
É obrigatório criar um Database Function Hook no Supabase Auth.

Mecanismo:

```text
Supabase → Auth Hooks → Customize Access Token (JWT Claims)
→ Database Function: public.custom_access_token_hook(event jsonb)
```

A função lê `organization_id` e `central_role` de `public.usuarios`
onde `id = (event->>'user_id')::uuid` e os injeta no JWT.

Sem este hook, `central.current_organization_id()` retorna NULL
e nenhuma política RLS da Central funcionará.

Referência: Supabase Docs → Auth Hooks → Customize Access Token

---

# 6. Funções SQL

Criar helper functions no schema `central`.

Não criar funções no schema `public` para evitar conflito com
as funções existentes do sistema clínico (`is_admin()`, `get_user_unit()`).

---

# 7. central.current_organization_id()

```sql
create or replace function central.current_organization_id()
returns uuid
language sql
stable
security definer
as $$
  select coalesce(
    (auth.jwt() ->> 'organization_id')::uuid,
    (
      select organization_id
      from public.usuarios
      where id = auth.uid()
      limit 1
    )
  );
$$;
```

O `COALESCE` garante fallback via lookup em `public.usuarios`
durante o bootstrap (antes do Auth Hook estar configurado).
`SECURITY DEFINER` é necessário pois a função lê `public.usuarios`
que pode ter RLS próprio.

---

# 8. central.ca_current_role()

```sql
create or replace function central.ca_current_role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'central_role';
$$;
```

Nota: a função se chama `ca_current_role`, não `current_role`.
`current_role` é uma função built-in do PostgreSQL e não pode ser redefinida.

---

# 9. central.current_user_id()

```sql
create or replace function central.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;
```

---

# 10. Papéis

Papéis da Central armazenados em `public.usuarios.central_role`:

```text
admin
director
supervisor
operator
operator_special
```

Estes papéis são independentes do campo `public.usuarios.role`
que controla acesso ao sistema clínico (recepcao, terapeutico, etc.).

---

# 11. Admin

Possui acesso total dentro da própria organização.

---

# 12. Director

Possui acesso leitura total.
Pode visualizar todas as Inboxes sem precisar ser membro.

---

# 13. Supervisor

Possui acesso apenas às Inboxes onde é membro em `central.inbox_members`.

---

# 14. Operator / Operator Special

Possui acesso apenas:

- Inbox onde é membro em `central.inbox_members`
- Conversas atribuídas diretamente a ele

---

# 15. Inbox Membership

Fonte oficial:

```text
central.inbox_members
```

Estrutura:

```sql
user_id   uuid references public.usuarios(id)
inbox_id  uuid references central.inboxes(id)
role      text
```

---

# 16. central.user_has_inbox_access()

```sql
create or replace function central.user_has_inbox_access(
  target_inbox uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from central.inbox_members
    where inbox_id = target_inbox
      and user_id = auth.uid()
  );
$$;
```

---

# 17. Habilitar RLS

Obrigatório em todas as tabelas do schema `central`.

Exemplo:

```sql
alter table central.contacts
enable row level security;
```

---

# 18. Tabelas Protegidas

```text
central.inboxes
central.channels
central.channel_connections
central.contacts
central.contact_identifiers
central.contact_patient_links
central.contact_tags
central.conversations
central.conversation_participants
central.messages
central.message_attachments
central.conversation_notes
central.conversation_events
central.notifications
central.inbox_members
central.ai_interactions
central.provider_webhook_logs
central.sla_rules
central.macros
central.conversation_metrics
```

Nota: a tabela `public.permissoes` não faz parte desta lista.
Permissões de acesso ao módulo Central são gerenciadas pela tabela existente
`public.permissoes` + `public.usuarios_permissoes` com suas próprias políticas.

---

# 19. Política Base

Toda tabela deve possuir isolamento por organização:

```sql
organization_id = central.current_organization_id()
```

---

# 20. Contacts Policy — SELECT

```sql
create policy contacts_select
on central.contacts
for select
using (
  organization_id = central.current_organization_id()
);
```

---

# 21. Contacts Policy — INSERT

```sql
create policy contacts_insert
on central.contacts
for insert
with check (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin', 'director', 'supervisor', 'operator', 'operator_special')
);
```

---

# 22. Contacts Policy — UPDATE

```sql
create policy contacts_update
on central.contacts
for update
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin', 'director', 'supervisor', 'operator', 'operator_special')
);
```

---

# 23. Inboxes Policy — SELECT

```sql
create policy inboxes_select
on central.inboxes
for select
using (
  organization_id = central.current_organization_id()
);
```

---

# 24. Inboxes Policy — INSERT/UPDATE

```sql
create policy inboxes_write
on central.inboxes
for all
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin')
)
with check (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin')
);
```

---

# 25. Channels Policy — SELECT

```sql
create policy channels_select
on central.channels
for select
using (
  organization_id = central.current_organization_id()
);
```

---

# 26. Conversas — Políticas de SELECT

Três políticas separadas para garantir isolamento correto por papel.

---

# 27. Conversations — Admin e Director

Admin e Director visualizam todas as conversas da organização
sem restrição de inbox membership.

```sql
create policy conversations_admin_director_select
on central.conversations
for select
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin', 'director')
);
```

---

# 28. Conversations — Supervisor

Supervisor visualiza apenas conversas de inboxes onde é membro.

```sql
create policy conversations_supervisor_select
on central.conversations
for select
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() = 'supervisor'
  and central.user_has_inbox_access(inbox_id)
);
```

---

# 29. Conversations — Operator / Operator Special

Operator visualiza conversas de inbox autorizada ou atribuídas a ele.

```sql
create policy conversations_operator_select
on central.conversations
for select
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('operator', 'operator_special')
  and (
    assigned_user_id = central.current_user_id()
    or central.user_has_inbox_access(inbox_id)
  )
);
```

---

# 30. Conversations — INSERT

```sql
create policy conversations_insert
on central.conversations
for insert
with check (
  organization_id = central.current_organization_id()
  and (
    central.ca_current_role() in ('admin', 'director', 'supervisor')
    or central.user_has_inbox_access(inbox_id)
  )
);
```

---

# 31. Conversations — UPDATE

```sql
create policy conversations_update
on central.conversations
for update
using (
  organization_id = central.current_organization_id()
  and (
    central.ca_current_role() in ('admin', 'director')
    or (
      central.ca_current_role() in ('supervisor', 'operator', 'operator_special')
      and (
        assigned_user_id = central.current_user_id()
        or central.user_has_inbox_access(inbox_id)
      )
    )
  )
);
```

---

# 32. Conversations — DELETE

Nunca permitido por cliente.
Arquivamento via UPDATE SET status = 'archived'.

```sql
-- Sem policy de DELETE em conversations.
-- Sem policy = RLS bloqueia DELETE automaticamente.
```

---

# 33. Messages

Mensagens herdam acesso da conversa.
Mensagens são imutáveis: apenas INSERT permitido por cliente.

---

# 34. Messages — SELECT

```sql
create policy messages_select
on central.messages
for select
using (
  exists (
    select 1
    from central.conversations c
    where c.id = messages.conversation_id
      and c.organization_id = central.current_organization_id()
      and (
        central.ca_current_role() in ('admin', 'director')
        or central.user_has_inbox_access(c.inbox_id)
        or c.assigned_user_id = central.current_user_id()
      )
  )
);
```

---

# 35. Messages — INSERT

```sql
create policy messages_insert
on central.messages
for insert
with check (
  organization_id = central.current_organization_id()
  and exists (
    select 1
    from central.conversations c
    where c.id = conversation_id
      and (
        central.ca_current_role() in ('admin', 'director', 'supervisor')
        or central.user_has_inbox_access(c.inbox_id)
        or c.assigned_user_id = central.current_user_id()
      )
  )
);
```

---

# 36. Messages — UPDATE / DELETE

Nunca permitido por cliente.
Mensagens são registros imutáveis.

```sql
-- Sem policy de UPDATE em messages.
-- Sem policy de DELETE em messages.
-- RLS bloqueia automaticamente.
```

---

# 37. Conversation Notes

Mesma regra de acesso das conversas.

---

# 38. Notes — SELECT

```sql
create policy notes_select
on central.conversation_notes
for select
using (
  organization_id = central.current_organization_id()
  and deleted_at is null
  and exists (
    select 1
    from central.conversations c
    where c.id = conversation_id
      and (
        central.ca_current_role() in ('admin', 'director')
        or central.user_has_inbox_access(c.inbox_id)
        or c.assigned_user_id = central.current_user_id()
      )
  )
);
```

---

# 39. Notes — INSERT

```sql
create policy notes_insert
on central.conversation_notes
for insert
with check (
  organization_id = central.current_organization_id()
  and author_user_id = central.current_user_id()
);
```

---

# 40. Notes — UPDATE (soft delete e edição)

```sql
create policy notes_update
on central.conversation_notes
for update
using (
  organization_id = central.current_organization_id()
  and deleted_at is null
  and (
    author_user_id = central.current_user_id()
    or central.ca_current_role() in ('admin', 'supervisor')
  )
);
```

---

# 41. Notes — DELETE

Nunca permitido. Usar soft delete via UPDATE SET deleted_at = now().

```sql
-- Sem policy de DELETE em conversation_notes.
```

---

# 42. Conversation Events

Append-only. Somente service role pode inserir.

```sql
-- Sem policy de SELECT para cliente comum
-- (events são visíveis via timeline que usa service role ou função SECURITY DEFINER)
-- Sem policy de UPDATE.
-- Sem policy de DELETE.
```

---

# 43. Notifications

---

# 44. Notifications — SELECT

```sql
create policy notifications_select
on central.notifications
for select
using (
  organization_id = central.current_organization_id()
  and user_id = central.current_user_id()
);
```

---

# 45. Notifications — UPDATE (marcar como lida)

```sql
create policy notifications_update
on central.notifications
for update
using (
  organization_id = central.current_organization_id()
  and user_id = central.current_user_id()
);
```

---

# 46. AI Interactions

Visibilidade restrita por papel.

---

# 47. AI Interactions — SELECT

```sql
create policy ai_interactions_select
on central.ai_interactions
for select
using (
  organization_id = central.current_organization_id()
  and (
    central.ca_current_role() in ('admin', 'director', 'supervisor')
    or (
      central.ca_current_role() in ('operator', 'operator_special')
      and exists (
        select 1
        from central.conversations c
        where c.id = conversation_id
          and (
            c.assigned_user_id = central.current_user_id()
            or central.user_has_inbox_access(c.inbox_id)
          )
      )
    )
  )
);
```

---

# 48. Provider Logs

Acesso extremamente restrito.

---

# 49. provider_webhook_logs — SELECT

```sql
create policy provider_logs_select
on central.provider_webhook_logs
for select
using (
  organization_id = central.current_organization_id()
  and central.ca_current_role() in ('admin', 'director')
);
```

---

# 50. QR Code Security

QR Codes nunca devem ser armazenados no banco.

Devem existir apenas em:

```text
Memória
Cache (Redis)
Provider (Evolution)
```

---

# 51. Service Role

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
Worker de transcrição
```

Nunca:

```text
Frontend
```

---

# 52. Realtime Security

Todas as subscriptions devem respeitar RLS.

Tabelas realtime:

```text
central.messages
central.conversations
central.notifications
central.conversation_notes
```

---

# 53. Storage Buckets

Buckets:

```text
chat-images
chat-audio
chat-documents
```

Path convention obrigatório:

```text
{organization_id}/{conversation_id}/{file_name}
```

---

# 54. Storage Policy — Download (SELECT)

```sql
create policy storage_chat_download
on storage.objects
for select
using (
  bucket_id in ('chat-images', 'chat-audio', 'chat-documents')
  and (storage.foldername(name))[1] = central.current_organization_id()::text
);
```

---

# 55. Storage Policy — Upload (INSERT)

```sql
create policy storage_chat_upload
on storage.objects
for insert
with check (
  bucket_id in ('chat-images', 'chat-audio', 'chat-documents')
  and (storage.foldername(name))[1] = central.current_organization_id()::text
  and central.ca_current_role() in ('admin', 'director', 'supervisor', 'operator', 'operator_special')
);
```

---

# 56. Storage Policy — DELETE

Nunca permitido por cliente.
Deleção somente por jobs internos via service role.

```sql
-- Sem policy de DELETE em storage para buckets da Central.
```

---

# 57. Auditoria de Acesso Negado

Toda tentativa de acesso negado deve registrar:

```text
user_id
resource
timestamp
```

---

# 58. Testes Obrigatórios

Validar com usuários de teste por papel:

### Admin

```text
Vê todas as conversas da organização
Pode configurar inboxes e canais
```

### Director

```text
Vê todas as conversas e inboxes
Não altera permissões nem configurações
```

### Supervisor

```text
Vê apenas inboxes onde é membro
Não vê conversas de inboxes sem acesso
```

### Operator

```text
Vê apenas inbox autorizada e conversas atribuídas
Não vê outras inboxes
```

### Multiempresa

```text
Organização A não vê dados da Organização B
```

### Bootstrap (pré Auth Hook)

```text
current_organization_id() retorna valor via fallback de public.usuarios
Políticas funcionam antes do Auth Hook estar configurado
```

---

# 59. Checklist de Segurança

Antes da produção:

```text
[ ] Schema central criado
[ ] RLS habilitado em todas as tabelas do schema central
[ ] Policies criadas (SELECT + INSERT + UPDATE conforme tabela)
[ ] Storage protegido (download + upload)
[ ] Auth Hook configurado (custom_access_token_hook)
[ ] JWT possui organization_id
[ ] JWT possui central_role (não role)
[ ] Fallback COALESCE em current_organization_id() validado
[ ] Funções helper criadas no schema central (não public)
[ ] Service Role somente backend
[ ] Realtime validado com RLS ativo
[ ] Testes multiempresa executados
[ ] Testes por papel executados (admin, director, supervisor, operator)
[ ] Bootstrap testado antes do Auth Hook
```

---

# 60. Decisões Arquiteturais

Consideradas definitivas:

✅ Schema central isolado de public

✅ Funções helper no schema central (não public)

✅ Claim JWT: central_role (não role)

✅ Auth Hook obrigatório para enriquecimento do JWT

✅ Fallback COALESCE em current_organization_id() para bootstrap

✅ Três policies separadas para conversations (admin/director, supervisor, operator)

✅ organization_id obrigatório em notifications

✅ Storage com policy de upload e download separadas

✅ Políticas de escrita documentadas para todas as tabelas críticas

✅ Mensagens e events append-only (sem UPDATE/DELETE por cliente)

✅ RLS em todas as tabelas

✅ Realtime protegido

✅ Provider Logs restritos a admin/director

✅ Service Role apenas backend

✅ Arquitetura SaaS segura

A próxima etapa obrigatória será:

```text
17-backend-services.md
```

---

# 61. Histórico de Revisões

## Versão 2.0 — 2026-06-17

Correções aplicadas com base no architecture review:

| # | Correção |
|---|---|
| C11 | `current_role()` renomeada para `central.ca_current_role()` (evita conflito com built-in PostgreSQL) |
| C12 | Todas as funções helper movidas para schema `central` (evita conflito com `is_admin()`, `get_user_unit()`) |
| C13 | Claim JWT alterada de `"role"` para `"central_role"`; seção Auth Hook adicionada |
| C14 | `user_has_inbox_access()` corrigida para referenciar `central.inbox_members` |
| C15 | Todas as policies corrigidas com prefixo `central.` em tabelas e funções |
| C16 | `current_organization_id()` com `COALESCE` para fallback de bootstrap |
| C17 | Tabela `permissions` removida da lista protegida; `inbox_members` adicionada |
| C18 | Policies de conversations separadas em 3 (admin/director, supervisor, operator) |
| C19 | `organization_id` adicionado à policy de notifications |
| C20 | Storage policies de upload (INSERT) documentadas |
| C21 | Policies de INSERT/UPDATE/DELETE documentadas para todas as tabelas críticas |
