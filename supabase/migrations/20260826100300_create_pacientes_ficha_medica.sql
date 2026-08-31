-- Ficha médica do paciente: 1:1, tabela separada em vez de mais seis colunas em
-- `pacientes`.
--
-- A razão é de SEGURANÇA, não de organização. A policy pacientes_select é
-- `for select to authenticated using (true)` (20260817190000, linha 307) e
-- PRECISA continuar assim — Cronograma, CCO, Central de Pacientes e
-- listar_central_pacientes() dependem de resolver paciente por ali. Alergia,
-- doença e tipo sanguíneo são dado sensível de saúde (LGPD) e não podem herdar
-- essa abertura: aqui a leitura exige a permissão da tela.

create table if not exists public.pacientes_ficha_medica (
  paciente_id              bigint primary key
                             references public.pacientes(id_paciente) on delete cascade,
  tipo_sanguineo           text,
  restricoes_alimentares   text,
  alergias                 text,
  doencas                  text,
  -- SEM foreign key POR ORA, de propósito: a tabela de planos de saúde está
  -- sendo criada em outra frente de trabalho. Quando ela existir, fechar com:
  --
  --   alter table public.pacientes_ficha_medica
  --     add constraint pacientes_ficha_medica_plano_saude_id_fkey
  --     foreign key (plano_saude_id) references public.<tabela_planos>(id);
  --
  -- Até lá o valor é um id solto, SEM integridade referencial garantida.
  plano_saude_id           bigint,
  numero_carteirinha       text,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  id_usuario               uuid references public.usuarios(id),
  nome_usuario_responsavel text,
  constraint pacientes_ficha_medica_tipo_sanguineo_check
    check (tipo_sanguineo is null or tipo_sanguineo in
      ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
);

drop trigger if exists trg_pacientes_ficha_medica_atualizado_em on public.pacientes_ficha_medica;
create trigger trg_pacientes_ficha_medica_atualizado_em
  before update on public.pacientes_ficha_medica
  for each row execute function public.set_atualizado_em();

comment on table public.pacientes_ficha_medica is
  'Ficha médica 1:1 do paciente (PK = FK). Tabela própria, e não colunas em `pacientes`, porque pacientes_select é aberta a todo authenticated e dado de saúde não pode herdar isso.';
comment on column public.pacientes_ficha_medica.plano_saude_id is
  'Sem FK ainda — a tabela de planos de saúde está em outra frente de trabalho. Ver o ALTER de fechamento no comentário do DDL.';
comment on column public.pacientes_ficha_medica.numero_carteirinha is
  'Carteirinha do PLANO DE SAÚDE, digitada no cadastro. NÃO confundir com pacientes.numero_carteirinha, que é CACHE derivado da última sessão em agenda_tita.';

-- ===== RLS =====
alter table public.pacientes_ficha_medica enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pacientes_ficha_medica'
  loop
    execute format('drop policy %I on public.pacientes_ficha_medica', pol.policyname);
  end loop;
end $$;

create policy "pacientes_ficha_medica_all" on public.pacientes_ficha_medica
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

revoke all on public.pacientes_ficha_medica from public;
revoke all on public.pacientes_ficha_medica from anon;
revoke all on public.pacientes_ficha_medica from authenticated;
grant select, insert, update, delete on public.pacientes_ficha_medica to authenticated;

alter table public.pacientes_ficha_medica force row level security;
