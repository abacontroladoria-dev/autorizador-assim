-- Exceções de valor por PACIENTE específico dentro de um convênio (ex.: Porto
-- Seguro e SulAmérica negociam valores individuais por paciente, diferentes
-- da regra geral do convênio em cronograma_convenio_valores). Quando existe
-- uma linha aqui pra (convenio_nome, paciente_nome), ela tem prioridade sobre
-- qualquer regra geral/por terapia do convênio.

create table if not exists public.cronograma_convenio_valores_paciente (
  id            uuid primary key default gen_random_uuid(),
  convenio_nome text not null,
  paciente_nome text not null,
  valor_hora    numeric(10,2),
  valor_sessao  numeric(10,2),
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_convenio_valores_paciente
  on public.cronograma_convenio_valores_paciente (convenio_nome, paciente_nome);

create or replace function public.set_cronograma_convenio_valores_paciente_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_convenio_valores_paciente_updated_at on public.cronograma_convenio_valores_paciente;
create trigger trg_cronograma_convenio_valores_paciente_updated_at
  before update on public.cronograma_convenio_valores_paciente
  for each row
  execute function public.set_cronograma_convenio_valores_paciente_updated_at();

alter table public.cronograma_convenio_valores_paciente enable row level security;

create policy "cronograma_convenio_valores_paciente_select_authenticated"
  on public.cronograma_convenio_valores_paciente for select to authenticated using (true);

create policy "cronograma_convenio_valores_paciente_insert_authenticated"
  on public.cronograma_convenio_valores_paciente for insert to authenticated with check (true);

create policy "cronograma_convenio_valores_paciente_update_authenticated"
  on public.cronograma_convenio_valores_paciente for update to authenticated using (true) with check (true);

create policy "cronograma_convenio_valores_paciente_delete_authenticated"
  on public.cronograma_convenio_valores_paciente for delete to authenticated using (true);
