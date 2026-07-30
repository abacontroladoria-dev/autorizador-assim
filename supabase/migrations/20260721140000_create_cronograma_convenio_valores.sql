-- Cadastro de valores por convênio, usado pra cruzar com as sessões já
-- calculadas em pacientesDashboard.ts e projetar receita mensal. Uma linha
-- com terapia_nome = null é a regra GERAL do convênio; uma linha com
-- terapia_nome preenchido é uma regra específica pra aquela terapia dentro
-- do convênio (ex.: ASSIM Saúde tem valores diferentes por terapia).
-- Exceções por PACIENTE específico ficam em cronograma_convenio_valores_paciente
-- (migration seguinte), não aqui.

create table if not exists public.cronograma_convenio_valores (
  id            uuid primary key default gen_random_uuid(),
  convenio_nome text not null,
  terapia_nome  text,
  valor_hora    numeric(10,2),
  valor_sessao  numeric(10,2),
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_convenio_valores_geral
  on public.cronograma_convenio_valores (convenio_nome) where terapia_nome is null;

create unique index if not exists uq_convenio_valores_terapia
  on public.cronograma_convenio_valores (convenio_nome, terapia_nome) where terapia_nome is not null;

create or replace function public.set_cronograma_convenio_valores_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_convenio_valores_updated_at on public.cronograma_convenio_valores;
create trigger trg_cronograma_convenio_valores_updated_at
  before update on public.cronograma_convenio_valores
  for each row
  execute function public.set_cronograma_convenio_valores_updated_at();

alter table public.cronograma_convenio_valores enable row level security;

create policy "cronograma_convenio_valores_select_authenticated"
  on public.cronograma_convenio_valores for select to authenticated using (true);

create policy "cronograma_convenio_valores_insert_authenticated"
  on public.cronograma_convenio_valores for insert to authenticated with check (true);

create policy "cronograma_convenio_valores_update_authenticated"
  on public.cronograma_convenio_valores for update to authenticated using (true) with check (true);

create policy "cronograma_convenio_valores_delete_authenticated"
  on public.cronograma_convenio_valores for delete to authenticated using (true);
