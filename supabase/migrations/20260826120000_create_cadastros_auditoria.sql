-- Trilha de auditoria dos cadastros (Pacientes, Responsáveis, Ficha Médica,
-- Convênios e Planos de Saúde).
--
-- Segue o padrão já provado de public.cronograma_salas_auditoria
-- (20260810161045 + 20260810180000 + 20260810190000): uma tabela só, com a
-- coluna `tabela` discriminando a entidade, `antes`/`depois` em jsonb, `resumo`
-- legível calculado no frontend e gravado pronto, e `criado_em_brasilia`
-- preenchido por trigger.
--
-- UMA tabela e não uma por entidade: a tela de histórico do paciente precisa
-- mostrar, na mesma linha do tempo, a edição do paciente, a troca do
-- responsável e a alteração da ficha médica. Com tabelas separadas isso viraria
-- três consultas e uma ordenação no cliente.
--
-- INSERT-ONLY: não existe policy de UPDATE nem de DELETE, de propósito. Trilha
-- que pode ser editada deixa de ser trilha.

create table if not exists public.cadastros_auditoria (
  id          uuid        primary key default gen_random_uuid(),
  tabela      text        not null,
  -- text e não bigint: `plano_saude` e `paciente` usam id numérico, mas manter
  -- text permite entidade com chave composta ou textual sem migrar a coluna.
  registro_id text        not null,
  acao        text        not null,

  -- Contexto legível, denormalizado de propósito: a trilha tem que continuar
  -- fazendo sentido mesmo depois de o registro original ser renomeado ou
  -- apagado. É o mesmo motivo de `usuario_nome` existir ao lado de `usuario_id`.
  paciente_id   bigint,
  paciente_nome text,
  convenio_nome text,
  alvo_nome     text,

  antes  jsonb,
  depois jsonb,
  /** Uma linha pronta: "Nome: João → João Pedro · CPF: — → 123...". */
  resumo text,
  motivo text,

  usuario_id   uuid references public.usuarios(id),
  usuario_nome text,

  criado_em          timestamptz not null default now(),
  /** String já formatada em horário de Brasília — ver trigger abaixo. */
  criado_em_brasilia text,

  constraint cadastros_auditoria_tabela_check
    check (tabela in ('paciente', 'responsavel', 'ficha_medica', 'convenio', 'plano_saude')),
  constraint cadastros_auditoria_acao_check
    check (acao in ('criar', 'editar', 'excluir', 'inativar', 'reativar'))
);

create index if not exists idx_cadastros_auditoria_registro
  on public.cadastros_auditoria (tabela, registro_id);
-- A tela abre ordenada por mais recente; sem este índice a primeira página faz
-- sort da tabela inteira.
create index if not exists idx_cadastros_auditoria_criado_em
  on public.cadastros_auditoria (criado_em desc);
-- "Histórico deste paciente" cruza as três entidades do cadastro de uma vez.
create index if not exists idx_cadastros_auditoria_paciente
  on public.cadastros_auditoria (paciente_id, criado_em desc)
  where paciente_id is not null;

-- Coluna GERADA não serve aqui: to_char() e AT TIME ZONE não são IMMUTABLE.
-- Mesma solução de 20260810180000.
create or replace function public.set_cadastros_auditoria_criado_em_brasilia()
returns trigger language plpgsql set search_path = public as $$
begin
  new.criado_em_brasilia :=
    to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  return new;
end;
$$;

drop trigger if exists trg_cadastros_auditoria_criado_em_brasilia on public.cadastros_auditoria;
create trigger trg_cadastros_auditoria_criado_em_brasilia
  before insert on public.cadastros_auditoria
  for each row execute function public.set_cadastros_auditoria_criado_em_brasilia();

comment on table public.cadastros_auditoria is
  'Trilha de auditoria dos cadastros de Pacientes, Responsáveis, Ficha Médica, Convênios e Planos de Saúde. Insert-only: sem policy de UPDATE/DELETE, de propósito. Escrita pelo frontend (services de cadastro), não por trigger — ver frontend/services/cadastrosAuditoria.service.ts.';
comment on column public.cadastros_auditoria.registro_id is
  'Id do registro alterado, como texto. Para paciente é id_paciente; para os demais, o id da própria entidade.';
comment on column public.cadastros_auditoria.paciente_id is
  'Preenchido também nas linhas de responsavel/ficha_medica, para "Histórico deste paciente" trazer as três entidades numa consulta só.';
comment on column public.cadastros_auditoria.resumo is
  'Linha legível calculada no frontend (lib/cadastros/auditoriaFormat.ts) e gravada pronta, para a listagem não precisar diffar jsonb a cada render.';

-- ===== RLS =====
alter table public.cadastros_auditoria enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'cadastros_auditoria'
  loop
    execute format('drop policy %I on public.cadastros_auditoria', pol.policyname);
  end loop;
end $$;

-- A permissão exigida acompanha a ENTIDADE da linha: quem só tem o cadastro de
-- pacientes não passa a enxergar o histórico de convênios de brinde.
create policy "cadastros_auditoria_select" on public.cadastros_auditoria
  for select to authenticated
  using (
    (tabela in ('paciente', 'responsavel', 'ficha_medica')
      and public.usuario_tem_permissao('cadastros_pacientes'))
    or (tabela in ('convenio', 'plano_saude')
      and public.usuario_tem_permissao('cadastros_convenios'))
  );

create policy "cadastros_auditoria_insert" on public.cadastros_auditoria
  for insert to authenticated
  with check (
    (tabela in ('paciente', 'responsavel', 'ficha_medica')
      and public.usuario_tem_permissao('cadastros_pacientes'))
    or (tabela in ('convenio', 'plano_saude')
      and public.usuario_tem_permissao('cadastros_convenios'))
  );

revoke all on public.cadastros_auditoria from public;
revoke all on public.cadastros_auditoria from anon;
revoke all on public.cadastros_auditoria from authenticated;
-- Sem UPDATE e sem DELETE no grant: a trilha é append-only também no nível de
-- privilégio, não só de policy.
grant select, insert on public.cadastros_auditoria to authenticated;

alter table public.cadastros_auditoria force row level security;
