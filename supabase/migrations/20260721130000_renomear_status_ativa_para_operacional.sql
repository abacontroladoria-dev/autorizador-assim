-- Renomeia o valor de status 'ativa' -> 'operacional' em cronograma_salas.
-- Mantém o mesmo significado (sala em uso normal, conta capacidade e entra
-- nas contas de ocupação) — só o rótulo do valor muda, pra não ser confundido
-- com "sala fisicamente ativa/existente" quando na verdade indica que ela
-- está operando normalmente (em oposição a bloqueada/administrativa).

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.cronograma_salas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.cronograma_salas drop constraint %I', c.conname);
  end loop;
end $$;

update public.cronograma_salas set status = 'operacional' where status = 'ativa';

alter table public.cronograma_salas alter column status set default 'operacional';

alter table public.cronograma_salas
  add constraint cronograma_salas_status_check check (status in ('operacional', 'bloqueada', 'adm'));
