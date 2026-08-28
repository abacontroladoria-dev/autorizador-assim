-- Camada de PLANEJAMENTO de salas: quem é o profissional/terapia "dono"
-- recorrente de uma sala num dia da semana × turno. Isso é só uso interno do
-- Pulsar para organizar o espaço físico — NÃO cria/altera nenhum agendamento
-- real na TiTa (decisão explícita do usuário: "só planejamento de salas").
--
-- O cruzamento com csv_grades_profissionais (feito em frontend/lib/cronograma
-- /salas.ts) só serve para mostrar quantas sessões reais desse profissional
-- bateram com essa sala/dia/turno ("X/Y com paciente"), não para validar nem
-- gravar nada na agenda oficial.

create table if not exists public.cronograma_salas_alocacoes (
  id                uuid primary key default gen_random_uuid(),
  sala_id           uuid not null references public.cronograma_salas(id) on delete cascade,
  dow               smallint not null check (dow between 1 and 5),
  turno             text not null check (turno in ('Manhã', 'Tarde')),
  profissional_nome text not null,
  terapia_nome      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id)
);

-- Não há UNIQUE em (sala_id, dow, turno): salas duplo/multiplo comportam mais
-- de uma alocação simultânea no mesmo bloco. A validação de capacidade
-- (não deixar alocar além de capacidadeProjetadaSala) é feita na aplicação.
create index if not exists idx_cronograma_salas_alocacoes_sala
  on public.cronograma_salas_alocacoes (sala_id, dow, turno);

create index if not exists idx_cronograma_salas_alocacoes_profissional
  on public.cronograma_salas_alocacoes (profissional_nome);

create or replace function public.set_cronograma_salas_alocacoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_salas_alocacoes_updated_at on public.cronograma_salas_alocacoes;
create trigger trg_cronograma_salas_alocacoes_updated_at
  before update on public.cronograma_salas_alocacoes
  for each row
  execute function public.set_cronograma_salas_alocacoes_updated_at();

alter table public.cronograma_salas_alocacoes enable row level security;

create policy "cronograma_salas_alocacoes_select_authenticated"
  on public.cronograma_salas_alocacoes for select to authenticated using (true);

create policy "cronograma_salas_alocacoes_insert_authenticated"
  on public.cronograma_salas_alocacoes for insert to authenticated with check (true);

create policy "cronograma_salas_alocacoes_update_authenticated"
  on public.cronograma_salas_alocacoes for update to authenticated using (true) with check (true);

create policy "cronograma_salas_alocacoes_delete_authenticated"
  on public.cronograma_salas_alocacoes for delete to authenticated using (true);
