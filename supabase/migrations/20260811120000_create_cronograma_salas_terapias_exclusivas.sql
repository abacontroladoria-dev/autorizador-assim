-- Pedido do usuário (2026-08-11): algumas salas só comportam determinado(s)
-- tipo(s) de terapia (ex.: sala com tanque = só Fisioterapia Aquática) e
-- algumas terapias só podem ser agendadas nessas salas reservadas (regra
-- OBRIGATÓRIA) ou apenas preferem essas salas sem serem travadas nelas
-- (regra PREFERENCIAL — ex.: Musicoterapia/Fonoaudiologia). Terapias sem
-- nenhuma linha aqui podem ir a qualquer sala que NÃO seja reservada para
-- outra terapia.
--
-- terapia_id vem do mapa fixo TERAPIA_ID em frontend/lib/cronograma/constants.ts
-- (não existe tabela `tipos_terapia` no banco — mesmo padrão já usado em
-- cronograma_salas_alocacoes.terapia_id). terapia_nome é só denormalização
-- para exibição, igual ao padrão de terapia_nome/terapia_id nas alocações.
--
-- Uma sala pode ter mais de uma terapia associada (ex.: Realengo Sala 05 e
-- 21 comportam Terapia Ocupacional E Fisioterapia — 2 linhas, mesma sala).
-- `modo` é por linha (sala+terapia), não por sala: a mesma sala pode ser
-- 'obrigatoria' pra uma terapia e não aparecer em nenhuma linha pra outra.

create table if not exists public.cronograma_salas_terapias_exclusivas (
  id            uuid primary key default gen_random_uuid(),
  sala_id       uuid not null references public.cronograma_salas (id) on delete cascade,
  terapia_id    integer not null,
  terapia_nome  text not null,
  modo          text not null check (modo in ('obrigatoria', 'preferencial')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_cronograma_salas_terapias_exclusivas_sala_terapia
  on public.cronograma_salas_terapias_exclusivas (sala_id, terapia_id);

create index if not exists idx_cronograma_salas_terapias_exclusivas_terapia_id
  on public.cronograma_salas_terapias_exclusivas (terapia_id);

create or replace function public.set_cronograma_salas_terapias_exclusivas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_salas_terapias_exclusivas_updated_at on public.cronograma_salas_terapias_exclusivas;
create trigger trg_cronograma_salas_terapias_exclusivas_updated_at
  before update on public.cronograma_salas_terapias_exclusivas
  for each row
  execute function public.set_cronograma_salas_terapias_exclusivas_updated_at();

alter table public.cronograma_salas_terapias_exclusivas enable row level security;

-- Mesmo padrão de acesso de cronograma_salas (20260731120000): leitura pra
-- quem tem a tela liberada (admin/diretoria/cronograma/terapeutico),
-- escrita restrita a admin/diretoria.
create policy "cronograma_salas_terapias_exclusivas_select" on public.cronograma_salas_terapias_exclusivas
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico']));

create policy "cronograma_salas_terapias_exclusivas_write" on public.cronograma_salas_terapias_exclusivas
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria']))
  with check (public.remuneracao_has_role(array['admin','diretoria']));

-- Trilha de auditoria (cronograma_salas_auditoria) ganha um novo valor de `tabela`.
alter table public.cronograma_salas_auditoria
  drop constraint if exists cronograma_ocupacao_trilha_auditoria_tabela_check;

alter table public.cronograma_salas_auditoria
  add constraint cronograma_ocupacao_trilha_auditoria_tabela_check
  check (tabela in ('sala', 'alocacao', 'nucleo', 'status_label', 'exclusividade_terapia'));
