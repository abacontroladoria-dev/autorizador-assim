-- Avaliação Neuropsicológica (terapia_id 2268) não é cobrada por sessão — é
-- um pacote fixo (8 a 10 sessões, a quantidade exata não importa pro
-- faturamento) cobrado uma vez por paciente, valor diferente por convênio
-- (ex.: Particular vale X, LEVE SAUDE vale Y). Por isso é uma tabela própria,
-- separada de cronograma_convenio_valores (que é sempre por sessão de 40min).

create table if not exists public.cronograma_convenio_pacote_avaliacao (
  id            uuid primary key default gen_random_uuid(),
  convenio_nome text not null,
  valor_pacote  numeric(10,2) not null,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_convenio_pacote_avaliacao_convenio
  on public.cronograma_convenio_pacote_avaliacao (convenio_nome);

create or replace function public.set_cronograma_convenio_pacote_avaliacao_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_convenio_pacote_avaliacao_updated_at on public.cronograma_convenio_pacote_avaliacao;
create trigger trg_cronograma_convenio_pacote_avaliacao_updated_at
  before update on public.cronograma_convenio_pacote_avaliacao
  for each row
  execute function public.set_cronograma_convenio_pacote_avaliacao_updated_at();

alter table public.cronograma_convenio_pacote_avaliacao enable row level security;

create policy "cronograma_convenio_pacote_avaliacao_select_authenticated"
  on public.cronograma_convenio_pacote_avaliacao for select to authenticated using (true);

create policy "cronograma_convenio_pacote_avaliacao_insert_authenticated"
  on public.cronograma_convenio_pacote_avaliacao for insert to authenticated with check (true);

create policy "cronograma_convenio_pacote_avaliacao_update_authenticated"
  on public.cronograma_convenio_pacote_avaliacao for update to authenticated using (true) with check (true);

create policy "cronograma_convenio_pacote_avaliacao_delete_authenticated"
  on public.cronograma_convenio_pacote_avaliacao for delete to authenticated using (true);
