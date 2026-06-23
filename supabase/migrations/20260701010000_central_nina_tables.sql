-- Central de Atendimento — Nina Integration: Tables & Schema Extensions
-- M-N01 | Nina Integration Block
-- Depends on:
--   20260701000000_create_ca_schema.sql       (central.organizations, grants)
--   20260701000001_extend_usuarios_central.sql (public.usuarios)
--   20260701000100_create_ca_enums.sql        (central enums)
--   20260701000200_create_ca_inboxes.sql      (central.inboxes, central.inbox_members)
--   20260701000400_create_ca_contacts.sql     (central.contacts)
--   20260701000500_create_ca_conversations.sql (central.conversations)
--   20260701000600_create_ca_messages.sql     (central.messages)
--
-- O que faz:
--   1. Novos enums: queue_status, appointment_type
--   2. Nova tabela: central.teams (grupos de operadores)
--   3. Nova tabela: central.agent_settings (configurações IA por org/inbox)
--   4. Nova tabela: central.tag_definitions (tags reutilizáveis)
--   5. Nova tabela: central.appointments (agendamentos criados via IA)
--   6. Nova tabela: central.conversation_states (estado do orquestrador IA)
--   7. Nova tabela: central.message_grouping_queue (fila de agrupamento)
--   8. Nova tabela: central.send_queue (fila de envio ao provider)
--   9. ALTER TABLE: central.contacts — colunas IA
--   10. ALTER TABLE: central.conversations — colunas IA
--   11. ALTER TABLE: central.messages — métrica IA
--   12. ALTER TABLE: central.inbox_members — weight + team_id
--   13. ALTER TABLE: central.organizations — timezone + horário comercial + agent_name

-- ============================================================================
-- ROLLBACK REFERENCE (execute em ordem inversa para desfazer):
--
--   alter table central.organizations drop column if exists agent_name, drop column if exists business_days, drop column if exists business_hours_end, drop column if exists business_hours_start, drop column if exists timezone;
--   alter table central.inbox_members drop column if exists team_id, drop column if exists weight;
--   alter table central.messages drop column if exists ai_response_time_ms;
--   alter table central.conversations drop column if exists ai_context, drop column if exists tags;
--   alter table central.contacts drop column if exists ai_memory, drop column if exists tags;
--   drop table if exists central.send_queue;
--   drop table if exists central.message_grouping_queue;
--   drop table if exists central.conversation_states;
--   drop table if exists central.appointments;
--   drop table if exists central.tag_definitions;
--   drop table if exists central.agent_settings;
--   drop table if exists central.teams;
--   drop type if exists central.appointment_type;
--   drop type if exists central.queue_status;
-- ============================================================================

-- ============================================================================
-- ENUM: central.queue_status
--
-- Estado comum para todas as filas assíncronas (message_grouping_queue, send_queue).
-- pending    → aguardando processamento pelo worker
-- processing → worker em execução (FOR UPDATE SKIP LOCKED)
-- completed  → processado com sucesso
-- failed     → falhou após max_retries; requer intervenção manual
-- cancelled  → cancelado por regra de negócio (ex: conversa encerrada)
-- ============================================================================
create type central.queue_status as enum (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

-- ============================================================================
-- ENUM: central.appointment_type
--
-- Tipos de agendamento criados pelo agente de IA via WhatsApp.
-- Adaptado do Nina (demo/meeting/support/followup) para contexto clínico.
-- triagem   → primeira consulta para avaliação do paciente
-- retorno   → acompanhamento de paciente em tratamento
-- reuniao   → reunião com responsável ou equipe clínica
-- followup  → acompanhamento administrativo ou pós-alta
-- demo      → apresentação comercial da clínica (lead não-convertido)
-- other     → outros casos não classificados
-- ============================================================================
create type central.appointment_type as enum (
  'triagem',
  'retorno',
  'reuniao',
  'followup',
  'demo',
  'other'
);

-- ============================================================================
-- TABLE: central.teams
--
-- Grupos lógicos de operadores para distribuição de conversas.
-- Substituição da tabela Nina teams, adaptada para multi-tenant.
--
-- inbox_members.team_id → FK para esta tabela (adicionada mais abaixo).
-- Não possui FK para inboxes: times são cross-inbox por design —
-- um time de "Recepção" pode atuar em múltiplas inboxes simultaneamente.
--
-- color: hexadecimal ou nome CSS. Usado na UI para diferenciar times visualmente.
-- UNIQUE (organization_id, name): times com mesmo nome na mesma org são ambíguos.
-- ============================================================================
create table central.teams (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  name            text        not null,
  description     text,
  color           text,
  is_active       boolean     not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint uq_teams_org_name unique (organization_id, name)
);

drop trigger if exists set_updated_at on central.teams;
create trigger set_updated_at
  before update on central.teams
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.agent_settings
--
-- Configurações do agente de IA por organização ou por inbox.
-- Substituição da tabela Nina nina_settings, com separação de responsabilidades:
--   - Credenciais WhatsApp → central.channel_connections.provider_metadata
--   - Dados da empresa → central.organizations (colunas adicionadas abaixo)
--   - Configurações IA + TTS → esta tabela
--
-- inbox_id nullable:
--   NULL  → configuração padrão da organização (org-level default)
--   UUID  → override específico por inbox
--   Índice parcial uq_agent_settings_org_default impede múltiplos defaults por org.
--
-- Campos de credencial (elevenlabs_api_key):
--   Armazenados em texto puro nesta migration. Em produção, recomenda-se
--   migrar para Supabase Vault (pgsodium.create_key / pgsodium.encrypt).
--   Aceitos como texto enquanto o Vault não estiver configurado.
--
-- response_delay_min / response_delay_max:
--   Intervalo em segundos para simular digitação humana antes de enviar.
--   Nina usa 3–8 s por padrão; ajustável por inbox.
-- ============================================================================
create table central.agent_settings (
  id                          uuid    primary key default gen_random_uuid(),
  organization_id             uuid    not null references central.organizations(id),
  inbox_id                    uuid    references central.inboxes(id) on delete cascade,

  -- Comportamento do agente
  ai_model_mode               text    not null default 'gpt-4o',
  system_prompt               text,
  auto_response_enabled       boolean not null default false,
  response_delay_min          integer not null default 3,
  response_delay_max          integer not null default 8,
  message_breaking_enabled    boolean not null default true,
  openai_assistant_id         text,

  -- ElevenLabs TTS
  elevenlabs_api_key          text,
  elevenlabs_voice_id         text,
  elevenlabs_model            text    default 'eleven_multilingual_v2',
  elevenlabs_stability        numeric(3,2) default 0.50,
  elevenlabs_similarity_boost numeric(3,2) default 0.75,
  elevenlabs_speed            numeric(3,2) default 1.00,
  tts_enabled                 boolean not null default false,

  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

drop trigger if exists set_updated_at on central.agent_settings;
create trigger set_updated_at
  before update on central.agent_settings
  for each row execute function public.set_updated_at();

-- Garante no máximo um registro padrão (inbox_id IS NULL) por organização.
create unique index uq_agent_settings_org_default
  on central.agent_settings(organization_id)
  where inbox_id is null;

-- Garante unicidade para overrides por inbox específica.
create unique index uq_agent_settings_org_inbox
  on central.agent_settings(organization_id, inbox_id)
  where inbox_id is not null;

-- ============================================================================
-- TABLE: central.tag_definitions
--
-- Catálogo de tags reutilizáveis por organização.
-- Tags são referenciadas por central.contacts.tags TEXT[] e
-- central.conversations.tags TEXT[] (arrays de tag key).
--
-- Abordagem TEXT[] em vez de tabela junction (contact_tags):
--   Prioridade: simplicidade de leitura e escrita.
--   A busca "todos os contatos com tag X" usa índice GIN em contacts.tags.
--   Se no futuro surgir necessidade de metadados por tag-contato (created_at,
--   created_by), migrar para tabela junction em migration separada.
--
-- key: identificador de código único por org (ex: 'lead_quente', 'sem_resposta').
-- label: texto exibido na UI (ex: 'Lead quente', 'Sem resposta').
-- category: agrupamento na UI (ex: 'Triagem', 'Comercial', 'Atendimento').
-- ============================================================================
create table central.tag_definitions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id),
  key             text        not null,
  label           text        not null,
  color           text,
  category        text,
  is_active       boolean     not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint uq_tag_key_per_org unique (organization_id, key)
);

drop trigger if exists set_updated_at on central.tag_definitions;
create trigger set_updated_at
  before update on central.tag_definitions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.appointments
--
-- Agendamentos criados pelo agente de IA via WhatsApp ou por operadores.
-- Independente de agenda_tita: não replica dados do TITA — é um registro
-- de intenção de agendamento originado pelo canal de mensageria.
--
-- Vínculo com agenda_tita: quando o agendamento é confirmado no TITA,
-- o campo tita_session_id pode ser preenchido para rastreabilidade.
-- Esta vinculação é bidirecional e feita pela aplicação, não por FK
-- (o TITA usa IDs inteiros e não é controlado pelo Central).
--
-- status valid values: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
-- ============================================================================
create table central.appointments (
  id              uuid                      primary key default gen_random_uuid(),
  organization_id uuid                      not null references central.organizations(id),
  contact_id      uuid                      references central.contacts(id) on delete set null,
  conversation_id uuid                      references central.conversations(id) on delete set null,
  title           text                      not null,
  description     text,
  date            date                      not null,
  time            time,
  duration        integer,
  type            central.appointment_type  not null default 'other',
  attendees       text[],
  meeting_url     text,
  status          text                      not null default 'scheduled',
  tita_session_id bigint,
  created_by_ai   boolean                   not null default false,
  created_at      timestamptz               default now(),
  updated_at      timestamptz               default now()
);

drop trigger if exists set_updated_at on central.appointments;
create trigger set_updated_at
  before update on central.appointments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.conversation_states
--
-- Estado da máquina de estados do orquestrador de IA por conversa.
-- Necessária para que o nina-orchestrator (portado como Edge Function ou
-- worker externo) persista o passo atual do fluxo entre mensagens.
--
-- current_state valid values (definidos pelo orquestrador):
--   'idle'          → aguardando nova mensagem
--   'processing'    → IA processando resposta
--   'scheduling'    → em fluxo de agendamento
--   'handoff'       → transferindo para humano
--   'waiting_human' → aguardando resposta do operador humano
--
-- scheduling_context JSONB:
--   Dados parciais coletados durante o fluxo de agendamento.
--   Ex: { "collected_date": "2026-07-15", "collected_time": null, "step": 2 }
--   Persiste entre mensagens para que o orquestrador retome do passo correto.
--
-- UNIQUE (conversation_id): uma conversa tem exatamente um estado ativo.
-- Criação via upsert: INSERT ON CONFLICT (conversation_id) DO UPDATE.
-- ============================================================================
create table central.conversation_states (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references central.organizations(id),
  conversation_id     uuid        not null references central.conversations(id) on delete cascade,
  current_state       text        not null default 'idle',
  last_action         text,
  last_action_at      timestamptz,
  scheduling_context  jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint uq_conversation_state unique (conversation_id)
);

drop trigger if exists set_updated_at on central.conversation_states;
create trigger set_updated_at
  before update on central.conversation_states
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.message_grouping_queue
--
-- Fila de agrupamento com delay: mensagens recebidas são enfileiradas e
-- aguardam N segundos antes de serem enviadas ao orquestrador. Isso permite
-- agrupar múltiplas mensagens enviadas em rápida sucessão (ex: usuário envia
-- 3 mensagens curtas seguidas) em um único turno de processamento.
--
-- process_after: timestamp a partir do qual o worker pode processar.
--   DEFAULT now() + '15 seconds' — ajustável por inbox em agent_settings.
--   Não hardcodado aqui para permitir override sem migration.
--
-- whatsapp_message_id: ID externo da mensagem no provider.
--   Usado para deduplicação — webhooks duplicados não devem enfileirar duas vezes.
--
-- status (central.queue_status):
--   Substitui o campo processed BOOLEAN do Nina original.
--   Permite rastrear falhas e retentativas (retry_count).
--
-- Worker: usa FOR UPDATE SKIP LOCKED para claims concorrentes seguros.
-- Função: central.claim_message_grouping_batch() em 20260701010400.
-- ============================================================================
create table central.message_grouping_queue (
  id                   uuid                  primary key default gen_random_uuid(),
  organization_id      uuid                  not null references central.organizations(id),
  whatsapp_message_id  text                  not null,
  phone_number_id      text                  not null,
  message_data         jsonb                 not null,
  contacts_data        jsonb,
  status               central.queue_status  not null default 'pending',
  process_after        timestamptz           not null default now() + interval '15 seconds',
  message_id           uuid                  references central.messages(id) on delete set null,
  processed_at         timestamptz,
  error_message        text,
  retry_count          integer               not null default 0,
  created_at           timestamptz           default now(),
  updated_at           timestamptz           default now()
);

drop trigger if exists set_updated_at on central.message_grouping_queue;
create trigger set_updated_at
  before update on central.message_grouping_queue
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.send_queue
--
-- Fila de envio de mensagens ao provider.
-- Desacopla a geração da resposta pela IA do envio efetivo ao WhatsApp/Instagram,
-- permitindo retentativas, scheduling e throttling independentes.
--
-- direction:
--   Quase sempre 'outbound' (central → contato).
--   Manter o campo para consistência com central.messages.
--
-- message_id FK:
--   Referencia a mensagem em central.messages já persistida.
--   Nullable: a mensagem pode ser enfileirada antes de ser persistida em
--   cenários de draft (raro, mas permitido pela arquitetura).
--
-- Worker: usa FOR UPDATE SKIP LOCKED para claims concorrentes seguros.
-- Função: central.claim_send_queue_batch() em 20260701010400.
-- ============================================================================
create table central.send_queue (
  id              uuid                  primary key default gen_random_uuid(),
  organization_id uuid                  not null references central.organizations(id),
  conversation_id uuid                  not null references central.conversations(id) on delete cascade,
  contact_id      uuid                  not null references central.contacts(id) on delete cascade,
  message_id      uuid                  references central.messages(id) on delete set null,
  message_type    text                  not null default 'text',
  direction       text                  not null default 'outbound',
  body            text,
  media_url       text,
  status          central.queue_status  not null default 'pending',
  scheduled_at    timestamptz           not null default now(),
  sent_at         timestamptz,
  error_message   text,
  retry_count     integer               not null default 0,
  created_at      timestamptz           default now(),
  updated_at      timestamptz           default now()
);

drop trigger if exists set_updated_at on central.send_queue;
create trigger set_updated_at
  before update on central.send_queue
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ALTER TABLE: central.contacts
--
-- tags TEXT[]:
--   Array de tag keys (ex: ['lead_quente', 'sem_resposta']).
--   Indexado com GIN em 20260701010100 para queries de filtragem por tag.
--   Chaves devem existir em central.tag_definitions; validação na camada da aplicação.
--
-- ai_memory JSONB:
--   Memória acumulada do agente sobre este contato.
--   Equivale ao campo client_memory do Nina.
--   Estrutura sugerida: { "profile": {...}, "preferences": {...}, "history_summary": "..." }
--   Atualizado pela função central.update_contact_ai_memory() em 20260701010400.
-- ============================================================================
alter table central.contacts
  add column if not exists tags       text[],
  add column if not exists ai_memory  jsonb;

-- ============================================================================
-- ALTER TABLE: central.conversations
--
-- tags TEXT[]:
--   Array de tag keys da conversa (ex: ['urgente', 'matricula']).
--   Separado de contacts.tags: uma conversa pode ter tags diferentes do contato.
--
-- ai_context JSONB:
--   Contexto acumulado do agente para esta conversa específica.
--   Equivale ao campo nina_context do Nina.
--   Estrutura sugerida: { "thread_id": "...", "last_summary": "...", "intent_stack": [...] }
-- ============================================================================
alter table central.conversations
  add column if not exists tags        text[],
  add column if not exists ai_context  jsonb;

-- ============================================================================
-- ALTER TABLE: central.messages
--
-- ai_response_time_ms INTEGER:
--   Tempo de resposta do modelo de IA em milissegundos para mensagens outbound
--   geradas pela IA (sent_by_ai = true).
--   Equivale ao campo nina_response_time do Nina.
--   NULL para mensagens humanas e inbound.
--   Usado em métricas de performance do agente.
-- ============================================================================
alter table central.messages
  add column if not exists ai_response_time_ms integer;

-- ============================================================================
-- ALTER TABLE: central.inbox_members
--
-- weight INTEGER DEFAULT 1:
--   Peso para algoritmo de distribuição de conversas por carga.
--   Copiado do Nina (team_members.weight).
--   Valores sugeridos: 1 (padrão) a 10 (operador premium de alta capacidade).
--   O algoritmo de distribuição divide a carga proporcionalmente.
--
-- team_id UUID FK central.teams:
--   Vincula o membro a um time dentro da inbox.
--   ON DELETE SET NULL: excluir o time não remove o membro da inbox.
--   Nullable: membro pode não pertencer a nenhum time (atendimento individual).
-- ============================================================================
alter table central.inbox_members
  add column if not exists weight   integer  not null default 1,
  add column if not exists team_id  uuid     references central.teams(id) on delete set null;

-- ============================================================================
-- ALTER TABLE: central.organizations
--
-- Campos vindos de nina_settings que descrevem a empresa, não o canal.
--
-- timezone TEXT:
--   Timezone da organização em formato IANA (ex: 'America/Sao_Paulo').
--   Usado para converter business_hours_start/end para UTC no orquestrador.
--
-- business_hours_start / business_hours_end TIME:
--   Horário comercial. Agente só responde automaticamente neste intervalo
--   quando auto_response_enabled = true em agent_settings.
--
-- business_days INTEGER[]:
--   Dias úteis como array de inteiros ISO (1=Segunda … 7=Domingo).
--   Ex: {1,2,3,4,5} = segunda a sexta.
--   Escolhido sobre TEXT[] para facilitar comparações aritméticas no orquestrador.
--
-- agent_name TEXT:
--   Nome do agente de IA exibido nas mensagens (ex: 'Nina', 'Kira').
--   Equivale ao campo sdr_name do Nina.
-- ============================================================================
alter table central.organizations
  add column if not exists timezone              text      default 'America/Sao_Paulo',
  add column if not exists business_hours_start  time      default '08:00',
  add column if not exists business_hours_end    time      default '18:00',
  add column if not exists business_days         integer[] default '{1,2,3,4,5}',
  add column if not exists agent_name            text;
