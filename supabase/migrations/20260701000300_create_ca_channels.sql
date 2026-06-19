-- Central de Atendimento — Channels
-- M-003 | Block 2
-- Depends on:
--   20260701000000_create_ca_schema.sql   (central.organizations, grants)
--   20260701000100_create_ca_enums.sql    (central.provider_type, central.channel_status)
--   20260701000200_create_ca_inboxes.sql  (central.inboxes)

-- ============================================================================
-- TABLE: central.channels
--
-- Modelagem:
--   Um canal é a identidade de mensageria ligada a uma inbox — representa um
--   número de WhatsApp, uma conta de Instagram, etc. Uma inbox pode ter vários
--   canais (ex: dois números WhatsApp com cargas distintas), mas cada canal
--   pertence a exatamente uma inbox.
--
--   provider (central.provider_type enum): descreve qual API/SDK de integração
--   é usada (Evolution API, Meta WABA, Instagram). Determina qual worker processa
--   os eventos deste canal.
--
--   channel_type (text): descreve o protocolo de mensagem do usuário final
--   (ex: 'whatsapp', 'instagram_dm'). Separado de provider porque dois providers
--   diferentes podem entregar o mesmo tipo de canal (ex: WhatsApp via Evolution
--   e WhatsApp via Meta WABA diretamente).
--
--   FK inbox_id: ON DELETE RESTRICT (padrão PostgreSQL). Inboxes com canais
--   vinculados não podem ser deletadas sem limpeza prévia — proteção contra
--   exclusão acidental.
--
--   status (central.channel_status): estado atual da conexão ao provedor.
--   Gerenciado pelo worker de sincronização, não pela UI diretamente.
-- ============================================================================
create table central.channels (
  id              uuid                   primary key default gen_random_uuid(),
  organization_id uuid                   not null references central.organizations(id),
  inbox_id        uuid                   not null references central.inboxes(id),
  name            text                   not null,
  provider        central.provider_type  not null,
  channel_type    text                   not null,
  status          central.channel_status not null default 'disconnected',
  active          boolean                default true,
  created_at      timestamptz            default now(),
  updated_at      timestamptz            default now()
);

drop trigger if exists set_updated_at on central.channels;
create trigger set_updated_at
  before update on central.channels
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: central.channel_connections
--
-- Modelagem:
--   Armazena o estado e as credenciais da conexão ativa entre o canal e o
--   provedor de mensageria externo. É uma tabela de estado (não histórico):
--   um canal tem no máximo uma linha aqui, atualizada por UPSERT pelo worker.
--
--   Sem UNIQUE (channel_id): por decisão de revisão, a unicidade é deixada
--   para ser enforcement da camada de aplicação (UPSERT ON CONFLICT channel_id)
--   e não do banco. Isso permite flexibilidade para rastrear múltiplas tentativas
--   de conexão em fase de testes antes de fixar a constraint em migração futura.
--
--   provider_metadata (jsonb): payload livre retornado pelo provedor na
--   handshake de autenticação. Estrutura varia por provider_type.
--
--   external_id: identificador do recurso no provedor (ex: phone number ID no Meta).
--   provider_instance_id: ID da instância no serviço intermediário (ex: Evolution).
--   provider_account_id: ID da conta vinculada (ex: WABA ID no Meta).
--
--   last_sync_at: timestamp do último heartbeat bem-sucedido com o provedor.
--   Usado pelo worker de health-check para detectar conexões silenciosamente
--   mortas (connection_status='active' mas sem sync por >N minutos).
--
--   FK channel_id: ON DELETE CASCADE. Se um canal for deletado, seus dados de
--   conexão são removidos junto — sem registros órfãos de credenciais.
-- ============================================================================
create table central.channel_connections (
  id                   uuid                   primary key default gen_random_uuid(),
  organization_id      uuid                   not null references central.organizations(id),
  channel_id           uuid                   not null references central.channels(id)  on delete cascade,
  external_id          text,
  provider_instance_id text,
  provider_account_id  text,
  provider_metadata    jsonb,
  connection_status    central.channel_status not null default 'disconnected',
  last_sync_at         timestamptz,
  created_at           timestamptz            default now(),
  updated_at           timestamptz            default now()
);

drop trigger if exists set_updated_at on central.channel_connections;
create trigger set_updated_at
  before update on central.channel_connections
  for each row execute function public.set_updated_at();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- channels: query mais comum — listar canais de uma inbox filtrando por status
-- (ex: "quais canais desta inbox estão ativos?")
create index idx_channels_org_inbox_status
  on central.channels(organization_id, inbox_id, status);

-- channels: listar todos os canais ativos da org (painel de saúde / dashboard)
create index idx_channels_org_active
  on central.channels(organization_id, active)
  where active = true;

-- channels: filtrar por provider dentro da org (usado pelo worker de routing
-- para saber quais instâncias Evolution vs Meta WABA processar)
create index idx_channels_org_provider
  on central.channels(organization_id, provider);

-- channel_connections: lookup principal — "qual é o estado de conexão deste canal?"
-- Query disparada a cada evento recebido para validar o canal antes de processar
create index idx_channel_connections_org_channel
  on central.channel_connections(organization_id, channel_id);

-- channel_connections: monitoramento de saúde — encontrar canais desconectados
-- na org para alertas e retry automático pelo worker de health-check
create index idx_channel_connections_org_status
  on central.channel_connections(organization_id, connection_status);
