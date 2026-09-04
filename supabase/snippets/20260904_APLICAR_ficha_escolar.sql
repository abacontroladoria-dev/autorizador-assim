-- =============================================================================
-- APLICAR NO SQL EDITOR — dados escolares declarados pelo responsável
-- 2026-09-04
-- =============================================================================
--
-- POR QUE
-- A equipe terapêutica precisa saber onde a criança estuda, em que turma, com
-- quem falar na escola. Hoje esse dado não existe em lugar nenhum do sistema —
-- `pacientes` não tem uma única coluna escolar. A alternativa (Google Forms +
-- alguém transcrevendo) deixa dado de criança em tratamento numa planilha fora
-- do controle de acesso do Pulsar, e na prática metade nunca é transcrita.
--
-- O QUE ISTO CRIA
-- Uma tabela, `public.pacientes_dados_escolares`, alimentada por um formulário
-- PÚBLICO (/ficha-escolar) que o responsável abre por um link único no WhatsApp.
-- Nada mais: nenhuma função, nenhuma view, nenhuma alteração em tabela existente.
--
-- SEGURANÇA — leia antes de aplicar
-- 1. A tabela nasce com RLS ligada pelo event trigger `rls_auto_enable` e SEM
--    policy, ou seja, fechada. O bloco abaixo cria a policy (leitura pela
--    permissão `cadastros_pacientes`) e os GRANTs — sem os dois, o PostgREST
--    devolve 403 mesmo com a policy no lugar.
-- 2. A ESCRITA pública NÃO passa por esta policy: o route handler usa
--    service_role, que ignora RLS. A barreira daquele caminho é a whitelist de
--    colunas em app/api/ficha-escolar/enviar/route.ts. Não afrouxar aqui
--    pensando em "liberar o formulário" — ele não precisa.
-- 3. `anon` fica explicitamente sem grant. A rota pública nunca fala com o banco
--    pelo client.
--
-- DEPENDÊNCIA
-- `public.usuario_tem_permissao(text)` e `public.pacientes(id_paciente)` já
-- existem em produção. Se algum dia esta migration for reaplicada num banco
-- limpo, ela é idempotente (if not exists / drop policy por catálogo).
--
-- O CÓDIGO PRECISA IR JUNTO
-- Sem o deploy do frontend, a tabela existe e ninguém a alimenta nem a lê. Com o
-- frontend e sem a tabela, a aba Escola e o formulário quebram. Aplicar isto e
-- redeployar o Coolify na mesma janela.
--
-- IMPACTO
-- Zero sobre o que já roda: tabela nova, nenhuma alteração de estrutura
-- existente. Reversível com `drop table public.pacientes_dados_escolares;`
-- (perde os envios já recebidos).
--
-- Detalhamento do raciocínio na migration de mesmo nome:
--   supabase/migrations/20260904090000_create_pacientes_dados_escolares.sql
-- =============================================================================

create table if not exists public.pacientes_dados_escolares (
  id                       bigint generated always as identity primary key,
  paciente_id              bigint not null
                             references public.pacientes(id_paciente) on delete cascade,

  -- ===== Escola =====
  escola_nome              text not null,
  escola_endereco          text,
  escola_telefone          text,
  escola_email             text,

  -- ===== Pedagógico =====
  coordenador_nome         text,
  turma                    text,
  turno                    text,

  -- ===== Quem preencheu (declarado, não autenticado) =====
  preenchido_por_nome       text not null,
  preenchido_por_parentesco text,
  preenchido_por_telefone   text,

  -- ===== Gravado pelo sistema =====
  telefone_confere         boolean,
  criado_em                timestamptz not null default now(),

  constraint pacientes_dados_escolares_turno_check
    check (turno is null or turno in ('Manhã', 'Tarde', 'Integral')),

  constraint pacientes_dados_escolares_parentesco_check
    check (preenchido_por_parentesco is null or preenchido_por_parentesco in
      ('Mãe', 'Pai', 'Madrasta', 'Padrasto', 'Avó', 'Avô', 'Irmã', 'Irmão',
       'Tia', 'Tio', 'Tutor(a) legal', 'Responsável legal', 'Próprio paciente',
       'Outro'))
);

-- A leitura da ficha é sempre "o envio mais recente deste paciente".
create index if not exists idx_pacientes_dados_escolares_paciente
  on public.pacientes_dados_escolares (paciente_id, criado_em desc);

comment on table public.pacientes_dados_escolares is
  'Dados escolares declarados pelo responsável em formulário público (/ficha-escolar). Histórico: uma linha por envio, nunca sobrescrita — a ficha lê a mais recente. Não é dado conferido.';
comment on column public.pacientes_dados_escolares.escola_endereco is
  'Texto livre de propósito: quem preenche é o responsável no celular e não sabe o CEP da escola. Não fatiar em logradouro/bairro/cidade sem uma razão de consulta concreta.';
comment on column public.pacientes_dados_escolares.preenchido_por_parentesco is
  'Mesma lista fechada de pacientes_responsaveis.parentesco (20260828170050) e de frontend/types/responsavel.ts. Mudar um lado sem os outros faz o insert morrer no CHECK.';
comment on column public.pacientes_dados_escolares.telefone_confere is
  'true = o telefone informado bate com algum responsável cadastrado do paciente; false = não bate; null = não foi possível comparar (paciente sem telefone cadastrado). Comparação pelos ÚLTIMOS 8 DÍGITOS, porque responsaveis.celular é texto livre sem normalização — "(21) 99999-9999" e "21999999999" são a mesma pessoa. É INDÍCIO de autenticidade, não prova: a tela rotula "conferido"/"verificar", nunca "suspeito".';

-- ===== RLS =====
alter table public.pacientes_dados_escolares enable row level security;

-- Remoção por catálogo: RLS é OR entre policies, e uma permissiva sobrevivente
-- anularia o fechamento em silêncio.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pacientes_dados_escolares'
  loop
    execute format('drop policy %I on public.pacientes_dados_escolares', pol.policyname);
  end loop;
end $$;

create policy "pacientes_dados_escolares_all" on public.pacientes_dados_escolares
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

revoke all on public.pacientes_dados_escolares from public;
revoke all on public.pacientes_dados_escolares from anon;
revoke all on public.pacientes_dados_escolares from authenticated;
grant select, insert, update, delete on public.pacientes_dados_escolares to authenticated;

alter table public.pacientes_dados_escolares force row level security;

-- =============================================================================
-- CONFERÊNCIA — rode depois de aplicar; as três linhas devem vir como esperado
-- =============================================================================
--
-- 1) A tabela existe, com RLS ligada E forçada:
--
--   select relrowsecurity as rls_ligada, relforcerowsecurity as rls_forcada
--   from pg_class where relname = 'pacientes_dados_escolares';
--   -- esperado: t | t
--
-- 2) Existe exatamente UMA policy, e ela exige a permissão:
--
--   select policyname, roles::text, qual
--   from pg_policies
--   where tablename = 'pacientes_dados_escolares';
--   -- esperado: 1 linha, {authenticated}, usuario_tem_permissao('cadastros_pacientes')
--
-- 3) `anon` NÃO tem grant nenhum (a rota pública não usa o client):
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_name = 'pacientes_dados_escolares' and grantee = 'anon';
--   -- esperado: 0 linhas
-- =============================================================================
