-- Alta virou 1:N. Formaliza no histórico o que o script solto
-- MIGRATION_ALTAS_MULTIPLAS.sql (raiz do repo) já aplicou à mão em produção.
--
-- POR QUÊ: `paciente_altas_individualidades` guardava data_alta /
-- especialidade_alta / arquivo_alta_path como colunas, e a tabela é UNIQUE por
-- paciente. Isso amarrava o paciente a UMA alta — mas alta é por
-- especialidade: o mesmo paciente recebe alta de Fonoaudiologia num mês e
-- continua em Terapia Ocupacional. Registrar a segunda alta apagava a primeira.
--
-- A tabela de individualidades continua existindo e continua 0-ou-1 por
-- paciente: comportamento agressivo, verbal, ambiente natural e nível de
-- suporte descrevem o paciente, não um evento — esses ficam onde estavam.
--
-- Idempotente: rodar contra produção é no-op.

-- ===== 1. Nova tabela 1:N =====
create table if not exists public.paciente_altas (
  id                 bigserial   primary key,
  paciente_id        int8        not null references public.pacientes(id_paciente) on delete cascade,
  data_alta          date        not null,
  especialidade_alta text        not null,
  arquivo_alta_path  text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- ===== 2. Trigger de atualizado_em =====
drop trigger if exists trg_paciente_altas_atualizado_em on public.paciente_altas;
create trigger trg_paciente_altas_atualizado_em
  before update on public.paciente_altas
  for each row execute function public.set_atualizado_em();

-- ===== 3. RLS =====
-- Fiel à produção: `USING (true)`. O aperto por permissão vem em
-- 20260826140700, junto com o das outras três tabelas.
alter table public.paciente_altas enable row level security;

drop policy if exists "paciente_altas_select" on public.paciente_altas;
create policy "paciente_altas_select" on public.paciente_altas
  for select to authenticated using (true);

drop policy if exists "paciente_altas_insert" on public.paciente_altas;
create policy "paciente_altas_insert" on public.paciente_altas
  for insert to authenticated with check (true);

drop policy if exists "paciente_altas_update" on public.paciente_altas;
create policy "paciente_altas_update" on public.paciente_altas
  for update to authenticated using (true) with check (true);

drop policy if exists "paciente_altas_delete" on public.paciente_altas;
create policy "paciente_altas_delete" on public.paciente_altas
  for delete to authenticated using (true);

-- ===== 4. Índice =====
create index if not exists paciente_altas_paciente_id_idx
  on public.paciente_altas (paciente_id);

-- ===== 5. As colunas de alta saem de individualidades =====
-- IF EXISTS porque em produção elas JÁ foram removidas pelo script solto; num
-- banco limpo elas nem chegam a existir, já que 20260826140000 (a criação
-- formalizada) foi escrita a partir do schema real, ou seja, já sem elas.
alter table public.paciente_altas_individualidades
  drop column if exists data_alta,
  drop column if exists especialidade_alta,
  drop column if exists arquivo_alta_path;
