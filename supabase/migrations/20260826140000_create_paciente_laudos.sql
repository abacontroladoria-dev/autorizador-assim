-- Formaliza no histórico as tabelas de Laudos e Altas/Individualidades do
-- cadastro de pacientes, criadas manualmente pelo SQL Editor a partir do script
-- solto MIGRATION_LAUDOS_ALTAS.sql (raiz do repo) e, portanto, ausentes de
-- supabase/migrations/ até aqui.
--
-- ESTA MIGRATION NÃO CRIA NADA NOVO EM PRODUÇÃO. As três tabelas já existem lá.
-- O conteúdo foi conferido contra o schema REAL antes de ser escrito (colunas
-- lidas via PostgREST em 2026-08-26), e não contra o script solto — que estava
-- desatualizado: faltava nele `paciente_laudos.em_uso`, adicionada depois pelo
-- MIGRATION_LAUDO_EM_USO.sql e formalizada em 20260826140200.
--
-- Tudo é IF NOT EXISTS / OR REPLACE / DROP IF EXISTS de propósito: o objetivo é
-- que rodar isto contra produção seja no-op, e contra um banco limpo (dev, CI,
-- `db reset`) produza exatamente o mesmo schema.
--
-- Sobre as policies: elas são reproduzidas AQUI COMO ESTÃO EM PRODUÇÃO —
-- `USING (true)` para todo `authenticated`, isto é, qualquer usuário logado lê
-- e apaga laudo de qualquer paciente. Isso destoa do padrão de
-- `usuario_tem_permissao('cadastros_pacientes')` já aplicado em `pacientes`
-- (20260826100500) e em `cadastros_auditoria` (20260826120000). Migration de
-- histórico tem que ser fiel ao que existe; o aperto vem separado, em
-- 20260826140700_laudos_altas_rls_por_permissao.sql.

-- ===== 1. paciente_laudos =====
create table if not exists public.paciente_laudos (
  id                 bigserial   primary key,
  paciente_id        int8        not null references public.pacientes(id_paciente) on delete cascade,
  data_laudo         date        not null,
  validade           date,
  autorizado_em      date,
  comp_agressivo     boolean,
  paciente_verbal    boolean,
  ambiente_natural   boolean,
  nivel_suporte      text        check (nivel_suporte in ('1','2','3','NA')),
  alta               boolean     not null default false,
  data_alta          date,
  especialidade_alta text,
  arquivo_path       text,
  observacoes        text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- ===== 2. paciente_laudo_especialidades =====
-- 1:N do laudo. Uma linha por especialidade constante do laudo, com a
-- quantidade prescrita (qt_laudo) e a autorizada pelo convênio (qt_autorizacao)
-- — que divergem, e é justamente a divergência que a aba precisa mostrar.
create table if not exists public.paciente_laudo_especialidades (
  id             bigserial   primary key,
  laudo_id       int8        not null references public.paciente_laudos(id) on delete cascade,
  especialidade  text        not null,
  qt_laudo       int4,
  qt_autorizacao int4,
  criado_em      timestamptz not null default now()
);

-- ===== 3. paciente_altas_individualidades =====
-- UNIQUE em paciente_id: individualidade é 0-ou-1 por paciente, e o service
-- depende disso — salvarAltaIndividualidade() faz upsert com
-- onConflict: "paciente_id". As colunas de alta que existiam aqui saíram em
-- 20260826140100, quando alta virou 1:N.
create table if not exists public.paciente_altas_individualidades (
  id               bigserial   primary key,
  paciente_id      int8        not null unique references public.pacientes(id_paciente) on delete cascade,
  comp_agressivo   boolean,
  paciente_verbal  boolean,
  ambiente_natural boolean,
  nivel_suporte    text        check (nivel_suporte in ('1','2','3','NA')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- ===== 4. Trigger de atualizado_em =====
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_paciente_laudos_atualizado_em on public.paciente_laudos;
create trigger trg_paciente_laudos_atualizado_em
  before update on public.paciente_laudos
  for each row execute function public.set_atualizado_em();

drop trigger if exists trg_paciente_altas_atualizado_em on public.paciente_altas_individualidades;
create trigger trg_paciente_altas_atualizado_em
  before update on public.paciente_altas_individualidades
  for each row execute function public.set_atualizado_em();

-- ===== 5. View plana vw_paciente_laudos_flat =====
-- NÃO é criada aqui, de propósito. Em produção ela já existe com a coluna
-- `em_uso` (acrescentada pelo MIGRATION_LAUDO_EM_USO.sql), e
-- `create or replace view` não aceita remover coluna de uma view existente
-- (erro 42P16). A forma completa dela — a mesma que já está em produção — é
-- criada em 20260826140200, que é quem formaliza `em_uso`. Criar uma versão
-- "mais antiga" aqui só para ser substituída duas migrations depois não tem
-- vantagem nenhuma e quebra a idempotência contra produção.

-- ===== 6. RLS (fiel à produção — ver cabeçalho) =====
alter table public.paciente_laudos enable row level security;

drop policy if exists "paciente_laudos_select" on public.paciente_laudos;
create policy "paciente_laudos_select"
  on public.paciente_laudos for select to authenticated using (true);

drop policy if exists "paciente_laudos_insert" on public.paciente_laudos;
create policy "paciente_laudos_insert"
  on public.paciente_laudos for insert to authenticated with check (true);

drop policy if exists "paciente_laudos_update" on public.paciente_laudos;
create policy "paciente_laudos_update"
  on public.paciente_laudos for update to authenticated using (true) with check (true);

drop policy if exists "paciente_laudos_delete" on public.paciente_laudos;
create policy "paciente_laudos_delete"
  on public.paciente_laudos for delete to authenticated using (true);

alter table public.paciente_laudo_especialidades enable row level security;

drop policy if exists "paciente_laudo_esp_select" on public.paciente_laudo_especialidades;
create policy "paciente_laudo_esp_select"
  on public.paciente_laudo_especialidades for select to authenticated using (true);

drop policy if exists "paciente_laudo_esp_insert" on public.paciente_laudo_especialidades;
create policy "paciente_laudo_esp_insert"
  on public.paciente_laudo_especialidades for insert to authenticated with check (true);

drop policy if exists "paciente_laudo_esp_update" on public.paciente_laudo_especialidades;
create policy "paciente_laudo_esp_update"
  on public.paciente_laudo_especialidades for update to authenticated using (true) with check (true);

drop policy if exists "paciente_laudo_esp_delete" on public.paciente_laudo_especialidades;
create policy "paciente_laudo_esp_delete"
  on public.paciente_laudo_especialidades for delete to authenticated using (true);

alter table public.paciente_altas_individualidades enable row level security;

drop policy if exists "paciente_altas_select" on public.paciente_altas_individualidades;
create policy "paciente_altas_select"
  on public.paciente_altas_individualidades for select to authenticated using (true);

drop policy if exists "paciente_altas_insert" on public.paciente_altas_individualidades;
create policy "paciente_altas_insert"
  on public.paciente_altas_individualidades for insert to authenticated with check (true);

drop policy if exists "paciente_altas_update" on public.paciente_altas_individualidades;
create policy "paciente_altas_update"
  on public.paciente_altas_individualidades for update to authenticated using (true) with check (true);

drop policy if exists "paciente_altas_delete" on public.paciente_altas_individualidades;
create policy "paciente_altas_delete"
  on public.paciente_altas_individualidades for delete to authenticated using (true);

-- ===== 7. Índices =====
-- Toda leitura das abas é "os laudos DESTE paciente" / "as especialidades
-- DESTE laudo"; sem estes dois índices as duas viram seq scan.
create index if not exists paciente_laudos_paciente_id_idx
  on public.paciente_laudos (paciente_id);

create index if not exists paciente_laudo_esp_laudo_id_idx
  on public.paciente_laudo_especialidades (laudo_id);
