-- Migra feriados do JSONB embutido em remuneracao_config para uma tabela
-- dedicada. Motivo: feriados não são dado sensível (ao contrário de
-- taxas_pa/diarias/valores de CC) e hoje precisam de uma RPC SECURITY DEFINER
-- só para o role 'terapeutico' conseguir lê-los sem enxergar valores
-- monetários (ver 20260713130000_feriados_rpc_e_fila_terapeutico.sql). Uma
-- tabela própria com RLS direta elimina essa gambiarra.

create table if not exists public.feriados (
  id             uuid primary key default gen_random_uuid(),
  data           date not null unique,
  nome           text not null,
  tipo           text not null check (tipo in ('integral','parcial')),
  horario_inicio text not null,
  horario_fim    text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.usuarios(id)
);

-- Backfill a partir do JSONB existente. parcial_a_partir (campo legado,
-- deprecated) vira horario_inicio quando presente; defaults de dia completo
-- (mesmos hardcoded hoje no frontend) cobrem entradas sem horário.
insert into public.feriados (data, nome, tipo, horario_inicio, horario_fim)
select
  (key)::date,
  value->>'nome',
  value->>'tipo',
  coalesce(value->>'horario_inicio', value->>'parcial_a_partir', '08:00'),
  coalesce(value->>'horario_fim', '17:40')
from public.remuneracao_config, jsonb_each(feriados)
on conflict (data) do nothing;

-- remuneracao_config deixa de ser a fonte de verdade de feriados.
alter table public.remuneracao_config drop constraint if exists remuneracao_config_feriados_check;
drop function if exists public.validar_feriados(jsonb);
alter table public.remuneracao_config drop column if exists feriados;
drop function if exists public.get_remuneracao_feriados();

alter table public.feriados enable row level security;

-- leitura: mesmos roles que hoje enxergam Config (rp/admin/diretoria) + o
-- terapeutico, que antes só conseguia via RPC (Análise de Tratativas).
create policy "feriados_select"
  on public.feriados for select
  to authenticated
  using (public.remuneracao_has_role(array['rp', 'admin', 'diretoria', 'terapeutico']));

-- escrita: mesmos roles que hoje escrevem remuneracao_config (rp/admin/diretoria,
-- ver 20260708153000_remuneracao_config_capacidades_write_diretoria.sql).
create policy "feriados_write"
  on public.feriados for all
  to authenticated
  using (public.remuneracao_has_role(array['rp', 'admin', 'diretoria']))
  with check (public.remuneracao_has_role(array['rp', 'admin', 'diretoria']));
