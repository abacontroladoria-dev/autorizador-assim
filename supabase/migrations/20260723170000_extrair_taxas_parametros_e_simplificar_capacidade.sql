-- Continuação da extração de remuneracao_config para tabelas dedicadas
-- (mesmo racional da migration 20260723160000, que já tinha extraído
-- feriados): a antiga aba "Variáveis & Taxas" editava dois desenhos de dado
-- bem diferentes que moravam juntos na mesma linha singleton — uma lista por
-- especialidade (taxas_pa/diarias, JSONB) e parâmetros globais escalares
-- (cc_pa_default etc). Cada um vira sua própria tabela.
--
-- Também simplifica remuneracao_capacidades: os campos "dias" e "padrao"
-- nunca foram lidos por nenhum cálculo/tela (capacidade real de ocupação vem
-- hardcoded de lib/cronograma/ocupacaoProf.ts) — só "limite_cc" é usado de
-- fato (alerta de Coordenador de Caso em Análise Futura). Removidos.
--
-- Com isso, remuneracao_config não sobra com nenhuma coluna útil (feriados já
-- tinha saído, dow_pt nunca foi consumido por ninguém) — a tabela é removida.

-- ===== remuneracao_taxas_especialidade =====
create table if not exists public.remuneracao_taxas_especialidade (
  id             uuid primary key default gen_random_uuid(),
  especialidade  text not null unique,
  taxa_pa        numeric not null default 0,
  diaria         numeric not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.usuarios(id)
);

insert into public.remuneracao_taxas_especialidade (especialidade, taxa_pa, diaria)
select
  esp,
  coalesce((rc.taxas_pa->>esp)::numeric, 0),
  coalesce((rc.diarias->>esp)::numeric, 0)
from public.remuneracao_config rc,
  lateral (
    select jsonb_object_keys(rc.taxas_pa) as esp
    union
    select jsonb_object_keys(rc.diarias)
  ) especialidades
on conflict (especialidade) do nothing;

alter table public.remuneracao_taxas_especialidade enable row level security;

create policy "remuneracao_taxas_especialidade_select"
  on public.remuneracao_taxas_especialidade for select
  to authenticated using (public.remuneracao_has_role(array['rp','admin','diretoria']));

create policy "remuneracao_taxas_especialidade_write"
  on public.remuneracao_taxas_especialidade for all
  to authenticated
  using (public.remuneracao_has_role(array['rp','admin','diretoria']))
  with check (public.remuneracao_has_role(array['rp','admin','diretoria']));

-- ===== remuneracao_parametros_gerais (singleton, mesmo truque de remuneracao_config) =====
create table if not exists public.remuneracao_parametros_gerais (
  id                 uuid primary key default gen_random_uuid(),
  singleton          boolean not null default true unique,
  cc_pa_default      numeric not null default 35.00,
  cc_pe_default      numeric not null default 133.34,
  cc_lim_default     numeric not null default 18,
  eta_bonus_default  numeric not null default 500,
  presenca_padrao    numeric not null default 80,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.usuarios(id)
);

insert into public.remuneracao_parametros_gerais
  (cc_pa_default, cc_pe_default, cc_lim_default, eta_bonus_default, presenca_padrao)
select cc_pa_default, cc_pe_default, cc_lim_default, eta_bonus_default, presenca_padrao
from public.remuneracao_config
limit 1;

-- garante que sempre exista 1 linha, mesmo se remuneracao_config nunca tivesse sido semeada
insert into public.remuneracao_parametros_gerais (id)
select gen_random_uuid()
where not exists (select 1 from public.remuneracao_parametros_gerais);

alter table public.remuneracao_parametros_gerais enable row level security;

create policy "remuneracao_parametros_gerais_select"
  on public.remuneracao_parametros_gerais for select
  to authenticated using (public.remuneracao_has_role(array['rp','admin','diretoria']));

create policy "remuneracao_parametros_gerais_write"
  on public.remuneracao_parametros_gerais for all
  to authenticated
  using (public.remuneracao_has_role(array['rp','admin','diretoria']))
  with check (public.remuneracao_has_role(array['rp','admin','diretoria']));

-- ===== remuneracao_capacidades: remove campos mortos =====
alter table public.remuneracao_capacidades drop column if exists dias;
alter table public.remuneracao_capacidades drop column if exists padrao;

-- ===== remuneracao_config: extração concluída, tabela removida =====
drop table if exists public.remuneracao_config;
