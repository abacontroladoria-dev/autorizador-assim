-- Cadastro estrutural de salas (inventário físico), usado pela feature
-- "Ocupação de Salas" do módulo Cronograma. Antes desta tabela não existia
-- persistência real de salas — "sala" era apenas uma string livre (sala_nome)
-- dentro de csv_grades_profissionais / agenda_tita_autorizacao_v2. Esta tabela
-- cruza com esses dados de agendamento via sala_nome_referencia (ilike).

create table if not exists public.cronograma_salas (
  id                    uuid primary key default gen_random_uuid(),
  unidade_nome          text not null,
  nucleo                text,
  andar                 text,
  numero_sala           text not null,
  nome_exibicao         text not null,
  capacidade            text not null check (capacidade in ('unico', 'duplo', 'multiplo')),
  status                text not null default 'ativa' check (status in ('ativa', 'bloqueada', 'adm')),
  sala_nome_referencia  text,
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_cronograma_salas_unidade_nome
  on public.cronograma_salas (unidade_nome);

create unique index if not exists uq_cronograma_salas_unidade_numero
  on public.cronograma_salas (unidade_nome, numero_sala);

-- updated_at automático
create or replace function public.set_cronograma_salas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_salas_updated_at on public.cronograma_salas;
create trigger trg_cronograma_salas_updated_at
  before update on public.cronograma_salas
  for each row
  execute function public.set_cronograma_salas_updated_at();

alter table public.cronograma_salas enable row level security;

create policy "cronograma_salas_select_authenticated"
  on public.cronograma_salas for select to authenticated using (true);

create policy "cronograma_salas_insert_authenticated"
  on public.cronograma_salas for insert to authenticated with check (true);

create policy "cronograma_salas_update_authenticated"
  on public.cronograma_salas for update to authenticated using (true) with check (true);

create policy "cronograma_salas_delete_authenticated"
  on public.cronograma_salas for delete to authenticated using (true);