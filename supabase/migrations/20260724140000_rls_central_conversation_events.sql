-- Achado do novo script scripts/check-rls.js: central.conversation_events
-- (tabela de auditoria da Central de Atendimento, M-010) foi criada em
-- 20260701001000_create_ca_audit.sql SEM `enable row level security`,
-- diferente de todas as outras 10 tabelas do schema `central`
-- (organizations, inboxes, channels, contacts, conversations, messages etc,
-- todas habilitadas em 20260701000800_create_ca_rls_policies.sql). Parece
-- ter sido um esquecimento — a própria tabela guarda `payload jsonb` com
-- contexto de conversas ligadas a pacientes (ver central.contact_patient_links).
--
-- Sem risco de regressão: AuditRepository (frontend/modules/atendimento/
-- repositories/audit.repository.ts) sempre usa o client de service role
-- pra ler/escrever essa tabela (nunca anon/authenticated), então RLS não
-- muda nenhum comportamento hoje — só fecha a mesma superfície de acesso
-- direto ao Postgres que as outras tabelas de central já fecham.

alter table central.conversation_events enable row level security;

create policy conversation_events_select
  on central.conversation_events
  for select
  to authenticated
  using (
    organization_id = central.current_organization_id()
    and central.ca_current_role() in ('admin', 'director')
  );

-- Sem policy de insert/update/delete para 'authenticated': a tabela é
-- append-only e só é escrita via service_role (que ignora RLS), igual ao
-- padrão já usado em central.messages/central.message_attachments.
