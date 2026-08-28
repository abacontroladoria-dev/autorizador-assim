-- Responsável vira ENTIDADE, não campo repetido dentro do paciente.
--
-- Motivo: irmãos atendidos na clínica compartilham responsável, e hoje isso é
-- duplicado linha a linha em pacientes.responsavel_* — com CPF e grafia
-- divergentes entre as cópias. É o mesmo problema que public.pacientes
-- (20260817190000) resolveu para a identidade do paciente.
--
-- As colunas legadas pacientes.responsavel_* NÃO são migradas nem dropadas
-- nesta migration; viram espelho somente-leitura do TiTa. Ver a deprecação
-- declarada por COMMENT em 20260826100000.

create table if not exists public.responsaveis (
  id                       bigint generated always as identity primary key,
  nome                     text not null,
  cpf                      text,
  rg                       text,
  rg_orgao_emissor         text,
  rg_uf                    text,
  data_nascimento          date,
  celular                  text,
  telefone_residencial     text,
  email                    text,
  cep                      text,
  logradouro               text,
  numero                   text,
  complemento              text,
  bairro                   text,
  cidade                   text,
  uf                       text,
  ativo                    boolean not null default true,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  id_usuario               uuid references public.usuarios(id),
  nome_usuario_responsavel text
);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.responsaveis'::regclass
                   and conname = 'responsaveis_rg_uf_check') then
    alter table public.responsaveis
      add constraint responsaveis_rg_uf_check
      check (rg_uf is null or rg_uf ~ '^[A-Z]{2}$');
  end if;
end $$;

-- CPF SEM unique, pela mesma razão de pacientes.cpf: o dado de origem é sujo e
-- um unique transformaria import em falha em bloco. Duplicidade é para ser
-- RELATADA na tela (o picker avisa), não impedida no banco.
create index if not exists idx_responsaveis_cpf
  on public.responsaveis (cpf) where cpf is not null;
create index if not exists idx_responsaveis_nome
  on public.responsaveis (nome);

drop trigger if exists trg_responsaveis_atualizado_em on public.responsaveis;
create trigger trg_responsaveis_atualizado_em
  before update on public.responsaveis
  for each row execute function public.set_atualizado_em();

create table if not exists public.pacientes_responsaveis (
  paciente_id              bigint not null
                             references public.pacientes(id_paciente) on delete cascade,
  responsavel_id           bigint not null
                             references public.responsaveis(id) on delete restrict,
  tipo                     text not null,
  parentesco               text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  id_usuario               uuid references public.usuarios(id),
  nome_usuario_responsavel text,
  constraint pacientes_responsaveis_pkey primary key (paciente_id, tipo),
  constraint pacientes_responsaveis_tipo_check
    check (tipo in ('filiacao_1', 'filiacao_2', 'financeiro', 'pedagogico'))
);

-- O outro lado do vínculo: "quais pacientes este responsável tem" é a consulta
-- do caso dos irmãos, e a PK só indexa (paciente_id, tipo).
create index if not exists idx_pacientes_responsaveis_responsavel
  on public.pacientes_responsaveis (responsavel_id);

drop trigger if exists trg_pacientes_responsaveis_atualizado_em on public.pacientes_responsaveis;
create trigger trg_pacientes_responsaveis_atualizado_em
  before update on public.pacientes_responsaveis
  for each row execute function public.set_atualizado_em();

comment on table public.responsaveis is
  'Pessoa responsável por paciente (filiação, financeiro, pedagógico). Entidade própria porque irmãos compartilham responsável. Substitui, PARA ESCRITA, as colunas pacientes.responsavel_* — que seguem existindo como espelho do sync do TiTa (ver 20260826100000).';
comment on table public.pacientes_responsaveis is
  'Vínculo paciente<->responsável. PK (paciente_id, tipo): um paciente tem no máximo UM responsável de cada tipo, e a segunda filiação tem tipo próprio (filiacao_2) em vez de papel repetido. ON DELETE CASCADE do lado do paciente (o vínculo não sobrevive ao paciente) e RESTRICT do lado do responsável (apagar responsável ainda vinculado tem que ser um ato consciente).';
comment on column public.pacientes_responsaveis.tipo is
  'filiacao_1/filiacao_2 = pai/mãe/tutores; financeiro = quem recebe cobrança; pedagogico = contato de escola/terapia.';
comment on column public.responsaveis.cpf is
  'Sem UNIQUE de propósito: o dado de origem é sujo e um unique transformaria import em falha em bloco. Duplicidade é relatada na tela.';

-- ===== RLS =====
alter table public.responsaveis           enable row level security;
alter table public.pacientes_responsaveis enable row level security;

-- Remoção por catálogo, convenção de 20260818210000: não há nome antigo a
-- adivinhar, e uma policy permissiva sobrevivente anularia o fechamento em
-- silêncio, porque RLS é OR entre policies.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('responsaveis', 'pacientes_responsaveis')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy "responsaveis_all" on public.responsaveis
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

create policy "pacientes_responsaveis_all" on public.pacientes_responsaveis
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

revoke all on public.responsaveis           from public;
revoke all on public.responsaveis           from anon;
revoke all on public.responsaveis           from authenticated;
revoke all on public.pacientes_responsaveis from public;
revoke all on public.pacientes_responsaveis from anon;
revoke all on public.pacientes_responsaveis from authenticated;

grant select, insert, update, delete on public.responsaveis           to authenticated;
grant select, insert, update, delete on public.pacientes_responsaveis to authenticated;

alter table public.responsaveis           force row level security;
alter table public.pacientes_responsaveis force row level security;
