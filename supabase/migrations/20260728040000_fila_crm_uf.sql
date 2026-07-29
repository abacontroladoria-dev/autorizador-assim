-- ITEM 4 — UF do CRM na fila de autorizações.
--
-- O robô preenche o número do CRM solicitante no portal ASSIM mas nunca troca a
-- UF (fica no default RJ). Quando o médico é de outro estado (ex.: SP) a guia é
-- rejeitada. A UF vem do Órbita embutida no crm ("52949442/RJ") e agora é gravada
-- em agenda_orbita.crm_uf (fix no sync). Aqui levamos essa UF até a fila para o
-- robô selecioná-la — sem tocar view/RPC/frontend: um gatilho preenche crm_uf a
-- partir de agenda_orbita por paciente, no momento do insert.

-- 1) Coluna
alter table public.fila_autorizacoes add column if not exists crm_uf text;

-- 2) Gatilho BEFORE INSERT — resolve a UF do médico por paciente (linha mais
--    recente de agenda_orbita com crm_uf). Só age se veio null; nunca falha.
create or replace function public.fn_set_crm_uf()
returns trigger
language plpgsql
as $$
begin
  if new.crm_uf is null and new.paciente_id is not null then
    select o.crm_uf
      into new.crm_uf
    from public.agenda_orbita o
    where o.paciente_id = (new.paciente_id)::text
      and o.crm_uf is not null
    order by o.updated_at desc nulls last
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_crm_uf on public.fila_autorizacoes;
create trigger trg_set_crm_uf
  before insert on public.fila_autorizacoes
  for each row
  execute function public.fn_set_crm_uf();

-- 3) Backfill das linhas pendentes/erro (as que o robô ainda vai processar)
update public.fila_autorizacoes fa
set crm_uf = (
  select o.crm_uf
  from public.agenda_orbita o
  where o.paciente_id = (fa.paciente_id)::text
    and o.crm_uf is not null
  order by o.updated_at desc nulls last
  limit 1
)
where fa.crm_uf is null
  and fa.status in ('pendente', 'erro');
