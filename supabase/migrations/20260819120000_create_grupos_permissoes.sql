-- Grupos de permissões: conceito novo, desacoplado do `role`/perfil do
-- usuário. `role` continua controlando o acesso padrão (RLS, roleDefaults em
-- routes.ts) e não é tocado aqui — renomear/excluir um `role` quebraria
-- políticas de RLS que comparam o valor literal em dezenas de tabelas.
--
-- Grupo é uma camada de conveniência puramente organizacional: agrupa
-- usuários e guarda um modelo de permissões que pode ser aplicado (como
-- overrides em usuarios_permissoes) a todos os membros de uma vez. Como não
-- há nenhuma policy de RLS que compare contra o nome do grupo, criar,
-- renomear e excluir grupos é seguro e livre.

create table if not exists public.grupos_permissoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  modelo_permissoes jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.grupos_permissoes_membros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos_permissoes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  created_at timestamptz default now(),
  constraint uq_grupo_usuario unique (grupo_id, usuario_id)
);

alter table public.grupos_permissoes enable row level security;
alter table public.grupos_permissoes_membros enable row level security;

-- Mesmo padrão de acesso de permissoes/usuarios_permissoes: só quem já
-- administra permissões (admin ou diretoria, ver is_admin()/is_diretoria() em
-- 20260713140000_diretoria_gerencia_permissoes.sql) mexe em grupos.
create policy "grupos_permissoes_admin_diretoria"
  on public.grupos_permissoes for all to authenticated
  using (public.is_admin() or public.is_diretoria())
  with check (public.is_admin() or public.is_diretoria());

create policy "grupos_permissoes_membros_admin_diretoria"
  on public.grupos_permissoes_membros for all to authenticated
  using (public.is_admin() or public.is_diretoria())
  with check (public.is_admin() or public.is_diretoria());

-- Seed: os grupos que já existem informalmente hoje (mesmos rótulos do
-- ROLE_LABELS em PermissoesPageShell.tsx), como ponto de partida editável.
insert into public.grupos_permissoes (nome, descricao) values
  ('Administrador', 'Grupo inicial — acesso administrativo completo'),
  ('Diretoria', 'Grupo inicial — direção'),
  ('Recepção', 'Grupo inicial — recepção'),
  ('Autorização', 'Grupo inicial — autorização'),
  ('Terapêutico', 'Grupo inicial — setor terapêutico'),
  ('Faturamento', 'Grupo inicial — faturamento'),
  ('RP', 'Grupo inicial — relacionamento com prestadores'),
  ('Cronograma', 'Grupo inicial — cronograma')
on conflict (nome) do nothing;

-- Seed: cada usuário entra no grupo que corresponde ao seu role atual, como
-- ponto de partida (a partir daqui grupo e role evoluem independentes).
insert into public.grupos_permissoes_membros (grupo_id, usuario_id)
select g.id, u.id
from public.usuarios u
join public.grupos_permissoes g on g.nome = case u.role
  when 'admin' then 'Administrador'
  when 'diretoria' then 'Diretoria'
  when 'recepcao' then 'Recepção'
  when 'autorizacao' then 'Autorização'
  when 'terapeutico' then 'Terapêutico'
  when 'faturamento' then 'Faturamento'
  when 'rp' then 'RP'
  when 'cronograma' then 'Cronograma'
  else null
end
on conflict (grupo_id, usuario_id) do nothing;
