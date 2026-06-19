-- Central de Atendimento — Inboxes
-- M-002 | Block 2
-- Depends on:
--   20260701000000_create_ca_schema.sql   (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql  (public.usuarios.organization_id)

-- ============================================================================
-- TABLE: central.inboxes
--
-- Modelagem:
--   Uma inbox é o container lógico de atendimento — agrupa canais (WhatsApp,
--   Instagram) e operadores em uma unidade funcional (ex: "Recepção Central",
--   "Pós-alta"). Todo canal e toda conversa pertencem exatamente a uma inbox.
--
--   UNIQUE (organization_id, name): inboxes com o mesmo nome na mesma org são
--   operacionalmente ambíguas. Reforça nomeação clara no cadastro.
-- ============================================================================
create table central.inboxes (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  name            text        not null,
  description     text,
  active          boolean     default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint uq_inboxes_org_name unique (organization_id, name)
);

drop trigger if exists set_updated_at on central.inboxes;
create trigger set_updated_at
  before update on central.inboxes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.inbox_members
--
-- Modelagem:
--   Registra quais usuários do sistema têm acesso a uma inbox e com qual papel
--   dentro dela. A FK para public.usuarios usa ON DELETE CASCADE: se um usuário
--   for removido do sistema clínico, ele é automaticamente removido das inboxes
--   sem deixar registros órfãos. Mesmo comportamento para exclusão da inbox.
--
--   role (text, sem CHECK constraint): os valores serão definidos e validados
--   pela camada de aplicação. Valores esperados: 'member', 'supervisor'.
--   Uma constraint CHECK será adicionada quando os papéis estiverem finalizados.
--
--   UNIQUE (inbox_id, user_id): um usuário pode ser membro de uma inbox apenas
--   uma vez. Operações de "reatribuição de papel" fazem UPDATE, não INSERT.
--
--   Sem coluna updated_at: inbox_members é imutável após criação exceto pelo
--   campo role. Se o papel mudar, o registro é deletado e recriado (ou via UPDATE
--   direto sem necessidade de auditoria automática de timestamp).
-- ============================================================================
create table central.inbox_members (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  inbox_id        uuid        not null references central.inboxes(id)    on delete cascade,
  user_id         uuid        not null references public.usuarios(id)    on delete cascade,
  role            text        not null default 'member',
  created_at      timestamptz default now(),
  constraint uq_inbox_members_inbox_user unique (inbox_id, user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- inboxes: listagem por org filtrando ativas (query mais comum no painel admin)
create index idx_inboxes_org_active
  on central.inboxes(organization_id, active);

-- inbox_members: para RLS futuro — filtrar membros de uma inbox dentro da org
create index idx_inbox_members_org_inbox
  on central.inbox_members(organization_id, inbox_id);

-- inbox_members: "quais inboxes este usuário pode acessar?" — usado por
-- central.user_has_inbox_access() e pela policy de conversations para operators
create index idx_inbox_members_org_user
  on central.inbox_members(organization_id, user_id);
