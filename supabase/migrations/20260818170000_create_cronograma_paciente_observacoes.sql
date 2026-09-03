-- Pedido do usuário (2026-08-18): campo de "Observações" livre por paciente na
-- tela /cronograma/ocupacao-paciente, abaixo do seletor de paciente. Uma nota
-- por paciente (chave = pac, o mesmo texto usado em toda a tela e em
-- acomp_pac_bundles.pac — não existe id/uuid de paciente nesse módulo, só o
-- nome). Trilha própria e imutável (criação/edição/exclusão), mesmo padrão de
-- cronograma_salas_auditoria (20260810161045), mas separada dela porque essa
-- tela usa RLS aberta a qualquer autenticado (mesmo padrão de
-- acomp_pac_bundles, 20260630000000) em vez de restringir por papel.

create table if not exists public.cronograma_paciente_observacoes (
  id            uuid primary key default gen_random_uuid(),
  pac           text not null unique,
  texto         text not null,
  criado_por    uuid references auth.users,
  criado_em     timestamptz not null default now(),
  atualizado_por uuid references auth.users,
  atualizado_em timestamptz not null default now()
);

alter table public.cronograma_paciente_observacoes enable row level security;

drop policy if exists "cronograma_paciente_observacoes_all" on public.cronograma_paciente_observacoes;
create policy "cronograma_paciente_observacoes_all" on public.cronograma_paciente_observacoes
  for all to authenticated
  using (true)
  with check (true);

create table if not exists public.cronograma_paciente_observacoes_auditoria (
  id            uuid primary key default gen_random_uuid(),
  pac           text not null,
  acao          text not null check (acao in ('criar', 'editar', 'excluir')),
  texto_antes   text,
  texto_depois  text,
  usuario_id    uuid references auth.users,
  usuario_nome  text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_cronograma_paciente_observacoes_auditoria_pac
  on public.cronograma_paciente_observacoes_auditoria (pac);

create index if not exists idx_cronograma_paciente_observacoes_auditoria_criado_em
  on public.cronograma_paciente_observacoes_auditoria (criado_em desc);

alter table public.cronograma_paciente_observacoes_auditoria enable row level security;

drop policy if exists "cronograma_paciente_observacoes_auditoria_select" on public.cronograma_paciente_observacoes_auditoria;
create policy "cronograma_paciente_observacoes_auditoria_select" on public.cronograma_paciente_observacoes_auditoria
  for select to authenticated using (true);

-- Só INSERT — a trilha não pode ser editada nem apagada por ninguém, senão
-- deixa de ser trilha de auditoria confiável.
drop policy if exists "cronograma_paciente_observacoes_auditoria_insert" on public.cronograma_paciente_observacoes_auditoria;
create policy "cronograma_paciente_observacoes_auditoria_insert" on public.cronograma_paciente_observacoes_auditoria
  for insert to authenticated with check (true);
