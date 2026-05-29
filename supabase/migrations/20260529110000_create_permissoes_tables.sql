-- Tabela de módulos do sistema
create table if not exists public.permissoes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  rota text,
  grupo text,
  created_at timestamptz default now()
);

alter table public.permissoes enable row level security;

create policy "permissoes_select_authenticated"
  on public.permissoes for select to authenticated using (true);

create policy "permissoes_all_admin"
  on public.permissoes for all to authenticated
  using (exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin'));

-- Tabela de permissões individuais por usuário
create table if not exists public.usuarios_permissoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  permissao_codigo text not null references public.permissoes(codigo) on delete cascade,
  permitido boolean not null default true,
  created_at timestamptz default now(),
  constraint uq_usuario_permissao unique (usuario_id, permissao_codigo)
);

alter table public.usuarios_permissoes enable row level security;

create policy "usuarios_permissoes_select"
  on public.usuarios_permissoes for select to authenticated
  using (
    usuario_id = auth.uid()
    or exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin')
  );

create policy "usuarios_permissoes_write_admin"
  on public.usuarios_permissoes for all to authenticated
  using (exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.usuarios where id = auth.uid() and role = 'admin'));

-- Seed: módulos iniciais
insert into public.permissoes (codigo, nome, rota, grupo) values
  ('dashboard',          'Dashboard',          '/',                   'Geral'),
  ('atendimentos',       'Atendimentos',       '/solicitar',          'Pacientes'),
  ('gestao',             'Gestão',             '/central-pacientes',  'Pacientes'),
  ('cronograma',         'Cronograma',         '/agenda/pacientes',   'Pacientes'),
  ('escala_terapeutica', 'Escala Terapêutica', '/central-terapeutas', 'Terapêutico'),
  ('agenda_terapeutica', 'Agenda Terapêutica', '/agenda/terapeutas',  'Terapêutico'),
  ('salas',              'Salas',              '/agenda/salas',       'Terapêutico'),
  ('auditoria_assim',    'Auditoria ASSIM',    '/auditoria-assim',    'Operações'),
  ('guias_digitais',     'Guias Digitais',     '/guias-digitais',     'Operações'),
  ('usuarios',           'Usuários',           '/admin',              'Administração'),
  ('permissoes',         'Permissões',         '/admin/permissoes',   'Administração')
on conflict (codigo) do nothing;
