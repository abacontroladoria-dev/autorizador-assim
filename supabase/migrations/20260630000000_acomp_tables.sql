-- ─── ACOMPANHAMENTO: TABELAS COMPARTILHADAS ──────────────────────────────────
-- Migra os 3 conjuntos de dados da aba Acompanhamento do localStorage para
-- tabelas Supabase compartilhadas entre todos os usuários autenticados.
--
-- Tabelas:
--   acomp_prof_map   → statusMap do OcupProfMode (pac|||prof|||dia|||hora → status)
--   acomp_pac_bundles → bundles de aceite do OcupPacMode (AceitePacBundle[])
--   acomp_conf        → sessões confirmadas (ConfItem[])

-- ─── 1. profMap ───────────────────────────────────────────────────────────────

create table if not exists acomp_prof_map (
  id            text        primary key,          -- "pac|||prof|||dia|||hora"
  status        text        not null,             -- "acompanhamento" | "inviavel"
  atualizado_por uuid       references auth.users,
  atualizado_em  timestamptz not null default now()
);

alter table acomp_prof_map enable row level security;

create policy "acomp_prof_map select" on acomp_prof_map
  for select to authenticated using (true);

create policy "acomp_prof_map insert" on acomp_prof_map
  for insert to authenticated with check (true);

create policy "acomp_prof_map update" on acomp_prof_map
  for update to authenticated using (true);

create policy "acomp_prof_map delete" on acomp_prof_map
  for delete to authenticated using (true);

-- ─── 2. pacBundles ────────────────────────────────────────────────────────────

create table if not exists acomp_pac_bundles (
  id            text        primary key,          -- bundle.id (timestamp_pac)
  dados         jsonb       not null,             -- AceitePacBundle completo
  pac           text        not null,
  status        text        not null default 'pendente',
  atualizado_por uuid       references auth.users,
  atualizado_em  timestamptz not null default now()
);

alter table acomp_pac_bundles enable row level security;

create policy "acomp_pac_bundles select" on acomp_pac_bundles
  for select to authenticated using (true);

create policy "acomp_pac_bundles insert" on acomp_pac_bundles
  for insert to authenticated with check (true);

create policy "acomp_pac_bundles update" on acomp_pac_bundles
  for update to authenticated using (true);

create policy "acomp_pac_bundles delete" on acomp_pac_bundles
  for delete to authenticated using (true);

-- ─── 3. conf ─────────────────────────────────────────────────────────────────

create table if not exists acomp_conf (
  id            text        primary key,          -- gerado no cliente (timestamp_random)
  dados         jsonb       not null,             -- ConfItem completo
  atualizado_por uuid       references auth.users,
  atualizado_em  timestamptz not null default now()
);

alter table acomp_conf enable row level security;

create policy "acomp_conf select" on acomp_conf
  for select to authenticated using (true);

create policy "acomp_conf insert" on acomp_conf
  for insert to authenticated with check (true);

create policy "acomp_conf update" on acomp_conf
  for update to authenticated using (true);

create policy "acomp_conf delete" on acomp_conf
  for delete to authenticated using (true);
