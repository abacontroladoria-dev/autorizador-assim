-- Trilha de auditoria de recusas de agendamento (Ocupação Clínica, Ocupação
-- Profissional, Ocupação Paciente, Saída de Profissional). Antes disso, uma
-- recusa não registrava quem clicou nem em que hora exata — vivia só em
-- localStorage (rec), sem usuário nem timestamp confiável. Mesmo padrão de
-- cronograma_salas_auditoria: tabela insert-only (sem UPDATE/DELETE), então
-- "reativar" nunca apaga uma linha — só insere uma nova. Isso dá histórico
-- de graça: recusar → reativar → recusar de novo é 3 linhas com o mesmo
-- slot_chave, em ordem cronológica.

create table if not exists public.cronograma_recusas_auditoria (
  id                 uuid        primary key default gen_random_uuid(),
  origem             text        not null check (origem in ('ocp-clinica','ocp-profissional','ocp-paciente','saida-profissional')),
  acao               text        not null check (acao in ('recusar','reativar')),
  paciente           text        not null,
  profissional       text,
  especialidade      text,
  unidade            text,
  dia                text,
  hora               text,
  slot_chave         text        not null,
  motivo             text,
  usuario_id         uuid        references public.usuarios(id),
  usuario_nome       text,
  criado_em          timestamptz not null default now(),
  criado_em_brasilia text
);

comment on column public.cronograma_recusas_auditoria.slot_chave is
  'Chave de agrupamento/histórico: paciente|||profissional|||dia|||hora — mesma chave usada nos handlers do frontend (waKey/pacRecDerived).';

create index if not exists idx_cronograma_recusas_auditoria_slot on public.cronograma_recusas_auditoria (slot_chave);
create index if not exists idx_cronograma_recusas_auditoria_paciente on public.cronograma_recusas_auditoria (paciente);
create index if not exists idx_cronograma_recusas_auditoria_criado_em on public.cronograma_recusas_auditoria (criado_em desc);

alter table public.cronograma_recusas_auditoria enable row level security;

create policy "cronograma_recusas_auditoria select" on public.cronograma_recusas_auditoria
  for select to authenticated using (true);

create policy "cronograma_recusas_auditoria insert" on public.cronograma_recusas_auditoria
  for insert to authenticated with check (true);

-- Sem policy de update/delete: histórico é imutável por design (mesma regra
-- de cronograma_salas_auditoria).

create or replace function public.set_cronograma_recusas_auditoria_criado_em_brasilia()
returns trigger
language plpgsql
as $$
begin
  new.criado_em_brasilia := to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  return new;
end;
$$;

drop trigger if exists trg_cronograma_recusas_auditoria_criado_em_brasilia on public.cronograma_recusas_auditoria;
create trigger trg_cronograma_recusas_auditoria_criado_em_brasilia
  before insert on public.cronograma_recusas_auditoria
  for each row
  execute function public.set_cronograma_recusas_auditoria_criado_em_brasilia();
