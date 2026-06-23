-- CRM — Tables & Cross-Schema Trigger
-- M-C02 | CRM Block
-- Depends on:
--   20260701020000_crm_schema.sql              (schema crm + grants)
--   20260701000000_create_ca_schema.sql        (central.organizations)
--   20260701000400_create_ca_contacts.sql      (central.contacts — trigger target)
--   20260701000500_create_ca_conversations.sql (central.conversations)
--
-- O que faz:
--   1. crm.pipeline_stages  — estágios Kanban por organização
--   2. crm.deals            — oportunidades de negócio
--   3. crm.deal_activities  — log de atividades por deal
--   4. crm.team_functions   — funções: SDR, Closer, CS...
--   5. crm.teams            — times de vendas (≠ central.teams de roteamento)
--   6. crm.team_members     — membros dos times CRM
--   7. crm.auto_create_deal_on_lead() — trigger cross-schema em central.contacts
--
-- Distinção central.teams vs crm.teams:
--   central.teams  → roteamento de conversas entre operadores (inbox routing)
--   crm.teams      → times comerciais de vendas (Vendas, Suporte, Marketing)
--
-- ROLLBACK:
--   drop trigger if exists auto_create_deal_on_lead_contact on central.contacts;
--   drop function if exists crm.auto_create_deal_on_lead();
--   drop table if exists crm.team_members;
--   drop table if exists crm.team_functions;
--   drop table if exists crm.teams;
--   drop table if exists crm.deal_activities;
--   drop table if exists crm.deals;
--   drop table if exists crm.pipeline_stages;

-- ============================================================================
-- TABLE: crm.pipeline_stages
--
-- Estágios do funil de vendas Kanban por organização.
-- position: ordem de exibição no Kanban; UNIQUE por org para evitar ambiguidade.
-- is_system: estágios de sistema (Fechado/Ganho, Perdido) não podem ser deletados
--   pelo usuário — apenas desativados. Protege a integridade do histórico.
-- auto_win: mover um deal para este estágio fecha-o como 'won' automaticamente.
-- auto_lose: mover um deal para este estágio fecha-o como 'lost' automaticamente.
-- ============================================================================
create table crm.pipeline_stages (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id) on delete cascade,
  title           text        not null,
  description     text,
  color           text        not null default '#64748b',
  position        integer     not null default 0,
  is_system       boolean     not null default false,
  is_active       boolean     not null default true,
  auto_win        boolean     not null default false,
  auto_lose       boolean     not null default false,
  created_at      timestamptz          default now(),
  updated_at      timestamptz          default now(),
  constraint uq_pipeline_stage_org_position unique (organization_id, position)
);

drop trigger if exists set_updated_at on crm.pipeline_stages;
create trigger set_updated_at
  before update on crm.pipeline_stages
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: crm.deals
--
-- Oportunidades de negócio vinculadas a contatos em central.contacts.
--
-- contact_id FK cross-schema:
--   → central.contacts(id) ON DELETE SET NULL
--   SET NULL preserva o histórico do deal quando um contato é removido (LGPD).
--   O deal mantém título, valor e histórico de atividades mesmo sem contato.
--
-- conversation_id FK cross-schema:
--   → central.conversations(id) ON DELETE SET NULL
--   Rastreabilidade: qual conversa originou este deal.
--
-- stage_id ON DELETE RESTRICT:
--   Impede a exclusão de um estágio que tenha deals ativos.
--   Admin deve mover os deals para outro estágio antes de deletar.
--
-- ai_score INTEGER (0-100):
--   Score de qualificação calculado pela função analyze-conversation.
--   NULL = ainda não analisado pela IA.
--
-- status:
--   'open'   → deal ativo, em progresso
--   'won'    → fechado como ganho (matrícula, contrato, venda realizada)
--   'lost'   → fechado como perdido (desistiu, não qualificado, concorrente)
--
-- priority:
--   Mesmos valores do campo priority em central.conversations para consistência.
--
-- source / source_campaign / source_ref:
--   Rastreamento de origem do lead. source válidos: 'whatsapp', 'instagram',
--   'facebook', 'google_ads', 'site', 'indicacao', 'convenio', 'importacao', 'manual'
--   source_campaign = nome da campanha de marketing (ex: "Campanha Julho 2026")
--   source_ref = dados brutos (utm_source, ad_id, referral_code)
-- ============================================================================
create table crm.deals (
  id                  uuid    primary key default gen_random_uuid(),
  organization_id     uuid    not null references central.organizations(id) on delete cascade,

  -- Vínculos cross-schema
  contact_id          uuid    references central.contacts(id) on delete set null,
  conversation_id     uuid    references central.conversations(id) on delete set null,
  stage_id            uuid    not null references crm.pipeline_stages(id) on delete restrict,

  -- Dados do negócio
  title               text    not null,
  description         text,
  value               numeric(12,2),
  currency            text    not null default 'BRL',

  -- Classificação operacional
  priority            text    not null default 'medium'
                              check (priority in ('low','medium','high','urgent')),
  status              text    not null default 'open'
                              check (status in ('open','won','lost')),
  expected_close_date date,
  closed_at           timestamptz,
  closed_reason       text,

  -- Atribuição
  assigned_to         uuid    references public.usuarios(id) on delete set null,

  -- Origem e rastreamento
  source              text,
  source_campaign     text,
  source_ref          text,

  -- IA
  created_by_ai       boolean not null default false,
  ai_score            integer check (ai_score between 0 and 100),
  ai_score_notes      text,
  ai_scored_at        timestamptz,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

drop trigger if exists set_updated_at on crm.deals;
create trigger set_updated_at
  before update on crm.deals
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: crm.deal_activities
--
-- Log de atividades por deal. Appended chronologically — não é editável,
-- apenas novo registro de atividade (audit + timeline de CRM).
--
-- type válidos:
--   note          → nota interna do operador
--   call          → registro de ligação
--   email         → registro de e-mail
--   meeting       → reunião presencial ou remota
--   task          → tarefa atribuída
--   status_change → mudança de estágio ou status (registrado pelo sistema)
--   ai_analysis   → análise e qualificação pela IA (analyze-conversation)
--
-- created_by / created_by_ai:
--   Exatamente um deve ser não-nulo por atividade.
--   atividades de sistema/IA: created_by=NULL, created_by_ai=true.
--   atividades de operador:   created_by=user_id, created_by_ai=false.
-- ============================================================================
create table crm.deal_activities (
  id              uuid    primary key default gen_random_uuid(),
  organization_id uuid    not null references central.organizations(id) on delete cascade,
  deal_id         uuid    not null references crm.deals(id) on delete cascade,

  type            text    not null default 'note'
                          check (type in ('note','call','email','meeting','task','status_change','ai_analysis')),
  title           text    not null,
  description     text,
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  is_completed    boolean not null default false,

  -- Autoria
  created_by      uuid    references public.usuarios(id) on delete set null,
  created_by_ai   boolean not null default false,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

drop trigger if exists set_updated_at on crm.deal_activities;
create trigger set_updated_at
  before update on crm.deal_activities
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: crm.team_functions
--
-- Funções dos membros de times de vendas.
-- Lookup table multi-tenant: cada org define suas próprias funções.
-- Seed padrão em 20260701020400: SDR, Closer, CS, Suporte Técnico, Marketing.
-- ============================================================================
create table crm.team_functions (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id) on delete cascade,
  name            text        not null,
  description     text,
  is_active       boolean     not null default true,
  created_at      timestamptz          default now(),
  updated_at      timestamptz          default now(),
  constraint uq_team_function_org_name unique (organization_id, name)
);

drop trigger if exists set_updated_at on crm.team_functions;
create trigger set_updated_at
  before update on crm.team_functions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: crm.teams
--
-- Times comerciais: Vendas, Suporte, Marketing.
--
-- NÃO confundir com central.teams:
--   central.teams → roteamento de conversas (qual time atende qual inbox)
--   crm.teams     → organização de pipeline (qual time de vendas é responsável)
--
-- Um operador pode ser membro de um crm.team e de um central.team
-- simultaneamente — os dois vínculos são independentes.
-- ============================================================================
create table crm.teams (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references central.organizations(id) on delete cascade,
  name            text        not null,
  description     text,
  color           text                   default '#3b82f6',
  is_active       boolean     not null   default true,
  created_at      timestamptz            default now(),
  updated_at      timestamptz            default now(),
  constraint uq_crm_team_org_name unique (organization_id, name)
);

drop trigger if exists set_updated_at on crm.teams;
create trigger set_updated_at
  before update on crm.teams
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABLE: crm.team_members
--
-- Membros dos times de vendas CRM.
-- Difere do Nina original: referencia public.usuarios (operadores do Pulsar)
-- em vez de auth.users direto, pois toda gestão de usuários é via public.usuarios.
--
-- weight INTEGER:
--   Peso para algoritmo de distribuição de deals por carga.
--   Copiado do Nina (team_members.weight) — mesmo conceito.
--   1 = capacidade normal; 2 = dobro de deals; 0 = temporariamente fora de rotação.
--
-- UNIQUE parcial (team_id, user_id) WHERE user_id IS NOT NULL:
--   Permite membros placeholder (user_id NULL) para deals externos ou futuros.
--   Previne duplicatas de membros reais no mesmo time.
-- ============================================================================
create table crm.team_members (
  id              uuid    primary key default gen_random_uuid(),
  organization_id uuid    not null references central.organizations(id) on delete cascade,
  team_id         uuid    not null references crm.teams(id) on delete cascade,
  user_id         uuid    references public.usuarios(id) on delete set null,
  function_id     uuid    references crm.team_functions(id) on delete set null,
  role            text    not null default 'agent'
                          check (role in ('admin','manager','agent')),
  weight          integer not null default 1,
  is_active       boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create unique index uq_crm_team_member
  on crm.team_members(team_id, user_id)
  where user_id is not null;

drop trigger if exists set_updated_at on crm.team_members;
create trigger set_updated_at
  before update on crm.team_members
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION + TRIGGER: crm.auto_create_deal_on_lead
--
-- Cross-schema trigger: executado AFTER INSERT em central.contacts quando
-- o contato criado é do tipo 'lead'. Cria automaticamente um deal no
-- primeiro estágio ativo do funil (menor position).
--
-- Condições para execução:
--   1. contact_type = 'lead' (contatos clínicos não geram deals) — C1
--   2. status != 'blocked' (contatos bloqueados não geram deals)
--   3. is_provisional = false (contatos provisórios aguardam resolução manual)
--   4. Não existe deal 'open' para este contato (previne duplicatas)
--   5. Existência de ao menos um pipeline_stage ativo na organização
--
-- Se nenhuma condição for cumprida, o trigger retorna silenciosamente sem erro.
--
-- Equivale ao trigger auto_create_deal_on_contact do Nina, adaptado para:
--   - Multi-tenant via organization_id
--   - Filtro por contact_type (clínica tem contatos não-lead)
--   - Referência ao crm.pipeline_stages em vez de pipeline_stages global
--   - Segurança: bloqueados (C1), provisórios (C2), duplicatas (C3)
--
-- SECURITY DEFINER necessário porque o trigger roda no contexto do usuário
-- inseridor (que pode não ter GRANT em crm.deals), mas deve poder criar deals
-- para contacts do tipo lead.
-- ============================================================================
create or replace function crm.auto_create_deal_on_lead()
returns trigger
language plpgsql
security definer
set search_path = crm, central, public
as $$
declare
  v_first_stage_id uuid;
begin
  -- C1: Filtro por tipo de contato
  if NEW.contact_type != 'lead' then
    return NEW;
  end if;

  -- Não criar deal para contatos bloqueados
  if NEW.status = 'blocked' then
    return NEW;
  end if;

  -- Não criar deal para contatos provisórios (aguardam resolução manual)
  if NEW.is_provisional = true then
    return NEW;
  end if;

  -- C3: Não criar deal se já existe um deal open para este contato
  if exists (
    select 1 from crm.deals
    where contact_id = NEW.id
      and organization_id = NEW.organization_id
      and status = 'open'
  ) then
    return NEW;
  end if;

  select id into v_first_stage_id
  from crm.pipeline_stages
  where organization_id = NEW.organization_id
    and is_active = true
  order by position asc
  limit 1;

  if v_first_stage_id is null then
    return NEW;
  end if;

  insert into crm.deals (
    organization_id,
    contact_id,
    stage_id,
    title,
    created_by_ai,
    status,
    priority
  )
  values (
    NEW.organization_id,
    NEW.id,
    v_first_stage_id,
    coalesce(nullif(trim(NEW.name), ''), 'Lead sem nome'),
    true,
    'open',
    'medium'
  );

  return NEW;
end;
$$;

grant execute on function crm.auto_create_deal_on_lead() to service_role;

drop trigger if exists auto_create_deal_on_lead_contact on central.contacts;
create trigger auto_create_deal_on_lead_contact
  after insert on central.contacts
  for each row execute function crm.auto_create_deal_on_lead();

-- ============================================================================
-- ALTER TABLE: central.tag_definitions
--
-- Adiciona suporte a domain para separar tags de atendimento de tags comerciais.
-- domain = 'central'  → tags exibidas apenas no workspace de atendimento
-- domain = 'crm'      → tags exibidas apenas no workspace de pipeline
-- domain = 'shared'   → tags exibidas em ambos contextos
-- ============================================================================

alter table central.tag_definitions
  add column if not exists domain text default 'central'
  check (domain in ('central', 'crm', 'shared'));

-- Adicionar colunas de tags em crm.deals para suportar tagging comercial
alter table crm.deals
  add column if not exists tags text[] default '{}';

-- Índice GIN para busca rápida de deals por tag
create index if not exists idx_deals_tags_gin
  on crm.deals
  using gin(tags);
