-- Cadastro nativo de Convênios + Planos de Saúde (1:N), independente do
-- convênio texto-livre de cronograma_convenio_valores/vw_grade_opcoes
-- (derivado do TiTa, usado em /cadastros/cadastro-valores — não tocado aqui).
--
-- Fonte de verdade para o select "Plano de saúde" da Ficha Médica do
-- paciente (public.pacientes_ficha_medica.plano_saude_id, 20260826100300),
-- que nasceu SEM FK de propósito porque esta tabela ainda não existia — a FK
-- é fechada na migration seguinte (20260826110100).
--
-- PK bigint identity, não uuid: para casar com o tipo de
-- pacientes_ficha_medica.plano_saude_id, já criado como bigint.

create table public.convenios (
  id            bigint generated always as identity primary key,
  nome          text not null,
  razao_social  text,
  cnpj          text,
  ans           text,
  observacao    text,

  -- Dados de contato e endereço (todos opcionais)
  email         text,
  telefone      text,
  cep           text,
  logradouro    text,
  numero        text,
  bairro        text,
  cidade        text,
  uf            text,

  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  id_usuario          uuid references public.usuarios(id),
  nome_usuario_responsavel text
);

-- Nome único só entre ATIVOS (índice parcial): permite recriar um convênio
-- com o mesmo nome de um que foi inativado, sem colidir.
create unique index convenios_nome_ativo_key
  on public.convenios (lower(nome)) where ativo;

create table public.planos_saude (
  id            bigint generated always as identity primary key,
  convenio_id   bigint not null references public.convenios(id) on delete cascade,
  nome          text not null,

  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  id_usuario          uuid references public.usuarios(id),
  nome_usuario_responsavel text
);

create unique index planos_saude_convenio_nome_ativo_key
  on public.planos_saude (convenio_id, lower(nome)) where ativo;

create index idx_planos_saude_convenio_id on public.planos_saude (convenio_id);

drop trigger if exists trg_convenios_atualizado_em on public.convenios;
create trigger trg_convenios_atualizado_em
  before update on public.convenios
  for each row execute function public.set_atualizado_em();

drop trigger if exists trg_planos_saude_atualizado_em on public.planos_saude;
create trigger trg_planos_saude_atualizado_em
  before update on public.planos_saude
  for each row execute function public.set_atualizado_em();

comment on table public.convenios is
  'Cadastro nativo do Pulsar (convênio de saúde), independente do convênio texto-livre de cronograma_convenio_valores/vw_grade_opcoes (derivado do TiTa). Fonte de verdade para o select de plano de saúde na Ficha Médica do paciente.';
comment on table public.planos_saude is
  'Planos de um convênio (1:N), ex: Unimed -> Unimed Nacional, Unimed Volta Redonda, Seguros Unimed. Soft-delete via ativo. Referenciada por pacientes_ficha_medica.plano_saude_id (FK fechada em 20260826110100).';

-- ===== RLS =====
-- Leitura liberada tanto para quem administra o cadastro de Convênios quanto
-- para quem só precisa popular o select da Ficha Médica de paciente (sem
-- acesso à tela de Convênios). Escrita restrita a cadastros_convenios.
alter table public.convenios enable row level security;

create policy "convenios_select" on public.convenios
  for select to authenticated
  using (
    public.usuario_tem_permissao('cadastros_convenios')
    or public.usuario_tem_permissao('cadastros_pacientes')
  );

create policy "convenios_insert" on public.convenios
  for insert to authenticated
  with check (public.usuario_tem_permissao('cadastros_convenios'));

create policy "convenios_update" on public.convenios
  for update to authenticated
  using (public.usuario_tem_permissao('cadastros_convenios'))
  with check (public.usuario_tem_permissao('cadastros_convenios'));

create policy "convenios_delete" on public.convenios
  for delete to authenticated
  using (public.usuario_tem_permissao('cadastros_convenios'));

alter table public.planos_saude enable row level security;

create policy "planos_saude_select" on public.planos_saude
  for select to authenticated
  using (
    public.usuario_tem_permissao('cadastros_convenios')
    or public.usuario_tem_permissao('cadastros_pacientes')
  );

create policy "planos_saude_insert" on public.planos_saude
  for insert to authenticated
  with check (public.usuario_tem_permissao('cadastros_convenios'));

create policy "planos_saude_update" on public.planos_saude
  for update to authenticated
  using (public.usuario_tem_permissao('cadastros_convenios'))
  with check (public.usuario_tem_permissao('cadastros_convenios'));

create policy "planos_saude_delete" on public.planos_saude
  for delete to authenticated
  using (public.usuario_tem_permissao('cadastros_convenios'));

revoke all on public.convenios from public;
revoke all on public.convenios from anon;
revoke all on public.convenios from authenticated;
grant select, insert, update, delete on public.convenios to authenticated;

revoke all on public.planos_saude from public;
revoke all on public.planos_saude from anon;
revoke all on public.planos_saude from authenticated;
grant select, insert, update, delete on public.planos_saude to authenticated;
