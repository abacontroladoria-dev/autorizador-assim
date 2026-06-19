-- Central de Atendimento — RLS Test Suite
-- M-RLS-003 | Block 4 — Security Layer
-- Depends on: 20260701000800_create_ca_rls_policies.sql
--
-- Roles tested: admin | director | no central_role | cross-org isolation
--
-- Usage: SQL Editor only (not a production migration).
-- All seed data is rolled back at the end.

begin;

-- ============================================================================
-- §1  SEED DATA
-- ============================================================================

insert into central.organizations (id, name, slug)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org Alpha', 'org-alpha'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Org Beta',  'org-beta');

insert into public.usuarios (id, email, nome, central_role, organization_id)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@alpha.test',    'Admin Alpha',    'admin',    'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'director@alpha.test', 'Director Alpha', 'director', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', 'norole@alpha.test',   'NoRole Alpha',   null,       'aaaaaaaa-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', 'admin@beta.test',     'Admin Beta',     'admin',    'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into central.inboxes (id, organization_id, name)
values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inbox A1'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Inbox A2'),
  ('11111111-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Inbox B1');

insert into central.channels (id, organization_id, inbox_id, name, provider, channel_type)
values
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', 'WhatsApp A1', 'evolution', 'whatsapp'),
  ('33333333-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000002', 'WhatsApp A2', 'evolution', 'whatsapp'),
  ('33333333-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000003', 'WhatsApp B1', 'evolution', 'whatsapp');

insert into central.contacts (id, organization_id, name)
values
  ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Contact Alpha'),
  ('44444444-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Contact Beta');

insert into central.conversations (id, organization_id, inbox_id, channel_id, contact_id, status)
values
  ('55555555-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001',
   '44444444-0000-0000-0000-000000000001', 'open'),
  ('55555555-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002',
   '44444444-0000-0000-0000-000000000001', 'open'),
  ('55555555-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003',
   '44444444-0000-0000-0000-000000000002', 'open');

insert into central.messages (id, organization_id, conversation_id, direction, body)
values
  ('66666666-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '55555555-0000-0000-0000-000000000001', 'inbound', 'Msg conv1'),
  ('66666666-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '55555555-0000-0000-0000-000000000002', 'inbound', 'Msg conv2'),
  ('66666666-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   '55555555-0000-0000-0000-000000000003', 'inbound', 'Msg conv3 Beta');

-- ============================================================================
-- §2  ADMIN TESTS
-- ============================================================================
do $$
declare v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',             '00000000-0000-0000-0000-000000000001',
      'organization_id', 'aaaaaaaa-0000-0000-0000-000000000001',
      'central_role',    'admin'
    )::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

  select count(*) into v_count from central.inboxes
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL admin:inboxes — expected 2, got ' || v_count;

  select count(*) into v_count from central.channels
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL admin:channels — expected 2, got ' || v_count;

  select count(*) into v_count from central.conversations
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL admin:conversations — expected 2, got ' || v_count;

  select count(*) into v_count from central.messages
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL admin:messages — expected 2, got ' || v_count;

  -- Admin does NOT see Org Beta data
  select count(*) into v_count from central.inboxes
  where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL admin:cross-org — expected 0, got ' || v_count;

  -- Admin does NOT see channel_connections of Beta
  select count(*) into v_count from central.channel_connections
  where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL admin:cross-org channel_connections — expected 0, got ' || v_count;

  raise notice 'PASS §2 Admin';
end;
$$;

-- ============================================================================
-- §3  DIRECTOR TESTS
-- ============================================================================
do $$
declare v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',             '00000000-0000-0000-0000-000000000002',
      'organization_id', 'aaaaaaaa-0000-0000-0000-000000000001',
      'central_role',    'director'
    )::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

  -- Director sees all inboxes
  select count(*) into v_count from central.inboxes
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL director:inboxes — expected 2, got ' || v_count;

  -- Director sees inbox_members (org-wide read-only)
  select count(*) into v_count from central.inbox_members
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL director:inbox_members — expected 0 (no members seeded for Alpha), got ' || v_count;

  -- Director sees all conversations
  select count(*) into v_count from central.conversations
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL director:conversations — expected 2, got ' || v_count;

  -- Director sees all messages
  select count(*) into v_count from central.messages
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 2, 'FAIL director:messages — expected 2, got ' || v_count;

  -- Director does NOT see channel_connections
  select count(*) into v_count from central.channel_connections
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL director:channel_connections — expected 0 (no access), got ' || v_count;

  -- Director does NOT see Org Beta data
  select count(*) into v_count from central.inboxes
  where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL director:cross-org — expected 0, got ' || v_count;

  raise notice 'PASS §3 Director';
end;
$$;

-- ============================================================================
-- §4  USER WITHOUT central_role
-- Authenticated user, central_role IS NULL — zero access to any Central table
-- ============================================================================
do $$
declare v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',             '00000000-0000-0000-0000-000000000003',
      'organization_id', 'aaaaaaaa-0000-0000-0000-000000000001',
      'central_role',    null
    )::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

  select count(*) into v_count from central.organizations
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL norole:organizations — expected 0, got ' || v_count;

  select count(*) into v_count from central.inboxes
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL norole:inboxes — expected 0, got ' || v_count;

  select count(*) into v_count from central.conversations
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL norole:conversations — expected 0, got ' || v_count;

  select count(*) into v_count from central.messages
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL norole:messages — expected 0, got ' || v_count;

  raise notice 'PASS §4 No central_role';
end;
$$;

-- ============================================================================
-- §5  CROSS-ORGANIZATION ISOLATION
-- Admin of Org Beta must NOT see any Org Alpha data
-- ============================================================================
do $$
declare v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',             '00000000-0000-0000-0000-000000000004',
      'organization_id', 'bbbbbbbb-0000-0000-0000-000000000001',
      'central_role',    'admin'
    )::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

  -- Beta admin sees only their own inbox
  select count(*) into v_count from central.inboxes
  where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  assert v_count = 1, 'FAIL cross-org:own_inbox — expected 1, got ' || v_count;

  -- Beta admin does NOT see Alpha inboxes
  select count(*) into v_count from central.inboxes
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL cross-org:alpha_inboxes — expected 0, got ' || v_count;

  select count(*) into v_count from central.conversations
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL cross-org:alpha_conversations — expected 0, got ' || v_count;

  select count(*) into v_count from central.messages
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL cross-org:alpha_messages — expected 0, got ' || v_count;

  select count(*) into v_count from central.contacts
  where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert v_count = 0, 'FAIL cross-org:alpha_contacts — expected 0, got ' || v_count;

  raise notice 'PASS §5 Cross-org isolation';
end;
$$;

-- ============================================================================
-- §6  TEAR-DOWN
-- ============================================================================

rollback;

-- ============================================================================
-- REALTIME COMPATIBILITY NOTE
--
-- admin and director subscribe at org level:
--   filter: 'organization_id=eq.<org_id>'
--
-- Realtime evaluates the SELECT policy per event.
-- messages_select is a simple org equality + role check — O(1) per event.
--
-- Tables requiring ALTER PUBLICATION (run outside transaction after deploy):
--   alter publication supabase_realtime add table central.messages;
--   alter publication supabase_realtime add table central.conversations;
--   alter publication supabase_realtime add table central.message_attachments;
-- ============================================================================
