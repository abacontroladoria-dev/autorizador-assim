-- Central de Atendimento — RLS Policies
-- M-RLS-002 | Block 4 — Security Layer
-- Depends on:
--   20260701000700_create_ca_rls_helpers.sql (helper functions)
--   All M-000 through M-006 migrations (tables must exist)
--
-- Roles: admin | director
-- Architecture:
--   admin    — full control within org
--   director — org-wide read + operational updates; no infra/config writes
--   channel_connections — admin only (credentials table)
--   organizations — read-only for all central roles
--   messages/attachments — service_role handles worker writes (bypasses RLS)

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table central.organizations          enable row level security;
alter table central.inboxes                enable row level security;
alter table central.inbox_members          enable row level security;
alter table central.channels               enable row level security;
alter table central.channel_connections    enable row level security;
alter table central.contacts               enable row level security;
alter table central.contact_identifiers    enable row level security;
alter table central.contact_patient_links  enable row level security;
alter table central.conversations          enable row level security;
alter table central.messages               enable row level security;
alter table central.message_attachments    enable row level security;

-- ============================================================================
-- TABLE: central.organizations
--
-- Read-only for all central roles.
-- Structural changes reserved for service_role / migrations.
-- ============================================================================

create policy organizations_select
  on central.organizations
  for select
  to authenticated
  using (
    id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.inboxes
--
-- admin + director: org-wide SELECT
-- admin: INSERT / UPDATE
-- ============================================================================

create policy inboxes_select
  on central.inboxes
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy inboxes_insert_admin
  on central.inboxes
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy inboxes_update_admin
  on central.inboxes
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.inbox_members
--
-- admin + director: org-wide SELECT (director: oversight, read-only)
-- admin: INSERT / UPDATE / DELETE
-- ============================================================================

create policy inbox_members_select
  on central.inbox_members
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy inbox_members_insert_admin
  on central.inbox_members
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy inbox_members_update_admin
  on central.inbox_members
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy inbox_members_delete_admin
  on central.inbox_members
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.channels
--
-- admin + director: org-wide SELECT
-- admin: INSERT / UPDATE
-- ============================================================================

create policy channels_select
  on central.channels
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy channels_insert_admin
  on central.channels
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy channels_update_admin
  on central.channels
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.channel_connections
--
-- Admin only: provider credentials and infrastructure state.
-- Director excluded by design — no direct access to provider config.
-- Worker/webhook use service_role (bypasses RLS).
-- ============================================================================

create policy channel_connections_select_admin
  on central.channel_connections
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy channel_connections_insert_admin
  on central.channel_connections
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy channel_connections_update_admin
  on central.channel_connections
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.contacts
--
-- admin    : SELECT including soft-deleted rows (audit / LGPD recovery)
-- director : SELECT excluding soft-deleted rows
-- admin + director: INSERT / UPDATE
-- DELETE   : never (LGPD soft delete; hard delete impossible — FK references)
-- ============================================================================

create policy contacts_select_admin
  on central.contacts
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

create policy contacts_select_director
  on central.contacts
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'director'
    and deleted_at is null
  );

create policy contacts_insert
  on central.contacts
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contacts_update
  on central.contacts
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
    and deleted_at is null
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.contact_identifiers
--
-- admin + director: org-wide SELECT / INSERT
-- admin: DELETE (identifier cleanup)
-- ============================================================================

create policy contact_identifiers_select
  on central.contact_identifiers
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contact_identifiers_insert
  on central.contact_identifiers
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contact_identifiers_delete_admin
  on central.contact_identifiers
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.contact_patient_links
--
-- admin + director: org-wide SELECT / INSERT / UPDATE
-- admin: DELETE
-- ============================================================================

create policy contact_patient_links_select
  on central.contact_patient_links
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contact_patient_links_insert
  on central.contact_patient_links
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contact_patient_links_update
  on central.contact_patient_links
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy contact_patient_links_delete_admin
  on central.contact_patient_links
  for delete
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() = 'admin'
  );

-- ============================================================================
-- TABLE: central.conversations
--
-- admin + director: org-wide SELECT / INSERT / UPDATE
-- DELETE: never
-- ============================================================================

create policy conversations_select
  on central.conversations
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy conversations_insert
  on central.conversations
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy conversations_update
  on central.conversations
  for update
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  )
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.messages
--
-- admin + director: org-wide SELECT / INSERT
-- UPDATE: service_role only (delivery status updates by worker — bypasses RLS)
-- DELETE: never (soft delete via deleted_at; hard delete impossible)
-- ============================================================================

create policy messages_select
  on central.messages
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

create policy messages_insert
  on central.messages
  for insert
  to authenticated
  with check (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- ============================================================================
-- TABLE: central.message_attachments
--
-- admin + director: org-wide SELECT
-- INSERT / UPDATE: service_role only (worker pipeline — bypasses RLS)
-- ============================================================================

create policy message_attachments_select
  on central.message_attachments
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );
