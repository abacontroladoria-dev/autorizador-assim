-- Central de Atendimento — Contacts
-- M-004 | Block 3
-- Depends on:
--   20260701000000_create_ca_schema.sql          (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql   (public.usuarios com organization_id)
--   20260701000100_create_ca_enums.sql           (central.contact_type)

-- ============================================================================
-- TABLE: central.contacts
--
-- Modelagem:
--   Um contato é qualquer pessoa que interage com a clínica via mensageria.
--   Pode ser responsável, paciente, terapeuta ou lead ainda não classificado.
--
--   display_phone / display_email:
--     Cópias desnormalizadas do identificador primário de contact_identifiers.
--     Existem para display e busca rápida sem JOIN. A aplicação mantém a
--     consistência ao atualizar contact_identifiers (upsert no identificador
--     primary → sincroniza display_phone/display_email no contacts).
--
--   is_provisional:
--     Contato criado automaticamente pelo webhook antes da resolução manual.
--     Flag booleana para queries de resolução mais rápidas que
--     WHERE status = 'unidentified' (cabe em índice parcial).
--
--   merged_into_contact_id:
--     Self-reference para deduplicações. Contato "perdedor" aponta para o
--     "vencedor". O Contact Resolution Engine ignora registros com este campo
--     preenchido nas buscas de contato ativo.
--
--   deleted_at:
--     LGPD — soft delete obrigatório. Hard delete impossível: conversas e
--     mensagens referenciam o contact_id. O fluxo de esquecimento ativo é:
--     SET deleted_at = now(), name = 'Contato removido', display_phone = null,
--     display_email = null e remover contact_identifiers associados.
--
--   status valid values:    'active' | 'unidentified' | 'blocked' | 'merged'
--   source valid values:    'whatsapp' | 'instagram' | 'manual' | 'import'
-- ============================================================================
create table central.contacts (
  id                     uuid                  primary key default gen_random_uuid(),
  organization_id        uuid                  not null references central.organizations(id),
  name                   text,
  display_phone          text,
  display_email          text,
  contact_type           central.contact_type  not null default 'other',
  status                 text                  not null default 'active',
  source                 text,
  avatar_url             text,
  is_provisional         boolean               not null default false,
  merged_into_contact_id uuid                  references central.contacts(id),
  last_interaction_at    timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz           default now(),
  updated_at             timestamptz           default now()
);

drop trigger if exists set_updated_at on central.contacts;
create trigger set_updated_at
  before update on central.contacts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.contact_identifiers
--
-- Modelagem:
--   Todos os identificadores conhecidos de um contato. Um contato pode ter
--   múltiplos tipos: telefone E.164, e-mail, WhatsApp ID, Instagram PSID, etc.
--
--   identifier_type valid values:
--     'phone'        — número E.164 normalizado (ex: +5521999998888)
--     'email'        — endereço de e-mail
--     'wa_id'        — remoteJid sem sufixo @s.whatsapp.net (Evolution/Meta)
--     'instagram_id' — Page-Scoped User ID do Instagram
--     'facebook_id'  — Page-Scoped User ID do Facebook Messenger
--
--   Nota wa_id vs phone:
--     O WhatsApp usa wa_id como identificador canônico nos webhooks — pode
--     diferir do número formatado por região/tipo de conta. São dois tipos
--     separados para o mesmo contato.
--
--   organization_id obrigatório:
--     RLS exige filtro por org sem JOIN (contact_identifiers é consultado
--     em cada mensagem recebida — JOIN com contacts seria custo inaceitável).
--
--   Constraints de unicidade duais:
--     uq_identifier_per_contact — evita duplicata do mesmo identificador
--                                  no mesmo contato.
--     uq_identifier_global      — garante unicidade do identificador ENTRE
--                                  contatos da org. Esta é a constraint usada
--                                  pelo Contact Resolution Engine com ON CONFLICT
--                                  para prevenir criação de contatos duplicados.
-- ============================================================================
create table central.contact_identifiers (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references central.organizations(id),
  contact_id       uuid        not null references central.contacts(id) on delete cascade,
  identifier_type  text        not null,
  identifier_value text        not null,
  is_primary       boolean     not null default false,
  created_at       timestamptz default now(),
  constraint uq_identifier_per_contact unique (contact_id, identifier_type, identifier_value),
  constraint uq_identifier_global      unique (organization_id, identifier_type, identifier_value)
);

-- ============================================================================
-- TABLE: central.contact_patient_links
--
-- Modelagem:
--   Vínculo entre um contato (Central) e um paciente do sistema TITA.
--   O Pulsar não possui tabela própria de pacientes — eles existem no TITA
--   com IDs inteiros acessíveis via agenda_tita.paciente_id BIGINT.
--
--   tita_paciente_id BIGINT (não UUID):
--     O TITA usa IDs sequenciais inteiros. Usar UUID aqui seria erro de modelo.
--
--   Cardinalidades:
--     contact → links (1:N) — Maria é responsável de Pedro E Lucas.
--     tita_id → links (N:1 por org) — Pedro tem Mãe e Pai como contatos.
--
--   confidence_score numeric(3,2):
--     Gerado pelo Contact Resolution Engine.
--       >= 0.90 → resolução automática
--       0.50–0.89 → revisão manual assistida pela IA
--       < 0.50 → resolução manual obrigatória
--     CHECK garante intervalo 0.00–1.00 (numeric(3,2) aceitaria até 9.99).
--
--   created_by:
--     Nullable para vínculos automáticos (sistema/IA). Preenchido para
--     vínculos manuais — rastreabilidade de auditoria.
--
--   relationship_type valid values:
--     'guardian' | 'mother' | 'father' | 'grandmother' | 'grandfather' |
--     'sibling' | 'self' | 'caregiver' | 'other'
--   resolved_by valid values: 'automatic' | 'manual' | 'ai'
-- ============================================================================
create table central.contact_patient_links (
  id                uuid         primary key default gen_random_uuid(),
  organization_id   uuid         not null references central.organizations(id),
  contact_id        uuid         not null references central.contacts(id) on delete cascade,
  tita_paciente_id  bigint       not null,
  relationship_type text,
  confidence_score  numeric(3,2) check (confidence_score between 0.00 and 1.00),
  resolved_by       text,
  resolved_at       timestamptz,
  created_by        uuid         references public.usuarios(id) on delete set null,
  created_at        timestamptz  default now(),
  constraint uq_contact_patient unique (contact_id, tita_paciente_id)
);

-- ============================================================================
-- INDEXES — central.contacts
-- ============================================================================

-- Filtrar contatos por status dentro da org (listar ativos, unidentified, etc.)
create index idx_contacts_org_status
  on central.contacts(organization_id, status);

-- Filtrar por tipo de contato (ex: listar todos os responsáveis)
create index idx_contacts_org_type
  on central.contacts(organization_id, contact_type);

-- Busca rápida por telefone para display e autocomplete de atribuição
create index idx_contacts_org_phone
  on central.contacts(organization_id, display_phone)
  where display_phone is not null;

-- Excluir soft-deletados de toda listagem (parcial — exclui rows com deleted_at)
create index idx_contacts_not_deleted
  on central.contacts(organization_id, created_at desc)
  where deleted_at is null;

-- Fila do Contact Resolution Engine — provisórios aguardando resolução manual
create index idx_contacts_provisional
  on central.contacts(organization_id, created_at asc)
  where is_provisional = true and deleted_at is null;

-- ============================================================================
-- INDEXES — central.contact_identifiers
-- ============================================================================

-- Hot path do Contact Resolution Engine: "quem possui este identificador?"
-- Toda mensagem inbound faz esta query antes de criar ou atribuir conversa.
-- A constraint uq_identifier_global já cria índice B-tree implicitamente;
-- listado aqui para documentar o propósito operacional.

-- Listar todos os identificadores de um contato (painel de detalhes)
create index idx_identifiers_contact
  on central.contact_identifiers(contact_id);

-- ============================================================================
-- INDEXES — central.contact_patient_links
-- ============================================================================

-- Lookup reverso: "quais contatos estão vinculados ao paciente X?"
-- Usado pelo painel clínico para mostrar responsáveis de um paciente.
create index idx_patient_links_org_tita
  on central.contact_patient_links(organization_id, tita_paciente_id);

-- Listar vínculos de um contato específico (painel de detalhes do contato)
create index idx_patient_links_contact
  on central.contact_patient_links(contact_id);
