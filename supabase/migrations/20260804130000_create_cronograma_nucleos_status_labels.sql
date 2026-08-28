-- Pedido do usuário (2026-08-04): tela de "Ocupação de Salas" precisa de um
-- lugar pra cadastrar/editar/excluir Núcleo, e editar o rótulo exibido de
-- Status, sem tocar em Andar/Unidade (que continuam fixos no código — ver
-- SalaEditModal.tsx).
--
-- Núcleo até aqui era só texto livre em cronograma_salas.nucleo, com as
-- opções do formulário derivadas de "valores já usados em alguma sala" —
-- não dava pra cadastrar um núcleo novo sem já ter uma sala usando ele, nem
-- excluir um não usado. Agora ganha tabela própria + FK (ON UPDATE CASCADE:
-- renomear um núcleo atualiza automaticamente todas as salas que o usam; ON
-- DELETE RESTRICT: não deixa excluir um núcleo em uso, força reatribuir
-- primeiro).
--
-- Status NÃO ganha uma tabela de valores livres — capacidadeProjetadaSala,
-- os contadores de ResumoUnidadeSalas e o motor de ocupação inteiro tratam
-- os 3 valores (operacional/bloqueada/adm) como fixos (ver salasTypes.ts).
-- Criar um 4º status exigiria reescrever esse cálculo. Aqui só gerenciamos o
-- RÓTULO exibido de cada um dos 3 (dois rótulos: descritivo, usado no
-- formulário, e curto, usado nos filtros/badges) — a lista de códigos
-- possíveis continua fixa via check constraint em cronograma_salas.status.

-- ===== cronograma_nucleos =====
create table if not exists public.cronograma_nucleos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uq_cronograma_nucleos_nome
  on public.cronograma_nucleos (nome);

create or replace function public.set_cronograma_nucleos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_nucleos_updated_at on public.cronograma_nucleos;
create trigger trg_cronograma_nucleos_updated_at
  before update on public.cronograma_nucleos
  for each row
  execute function public.set_cronograma_nucleos_updated_at();

alter table public.cronograma_nucleos enable row level security;

create policy "cronograma_nucleos_select" on public.cronograma_nucleos
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico']));

create policy "cronograma_nucleos_write" on public.cronograma_nucleos
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

-- Backfill: núcleos já em uso em cronograma_salas passam a existir na tabela.
insert into public.cronograma_nucleos (nome)
select distinct trim(nucleo) from public.cronograma_salas
where nucleo is not null and trim(nucleo) <> ''
on conflict (nome) do nothing;

-- FK de cronograma_salas.nucleo pra cronograma_nucleos.nome — renomear um
-- núcleo (update no nome) propaga automaticamente pras salas que o usam;
-- excluir um núcleo em uso é bloqueado (precisa reatribuir as salas antes).
alter table public.cronograma_salas
  add constraint fk_cronograma_salas_nucleo
  foreign key (nucleo) references public.cronograma_nucleos (nome)
  on update cascade on delete restrict;

-- ===== cronograma_status_labels =====
create table if not exists public.cronograma_status_labels (
  codigo       text primary key check (codigo in ('operacional', 'bloqueada', 'adm')),
  label        text not null,
  label_curto  text not null,
  updated_at   timestamptz not null default now()
);

create or replace function public.set_cronograma_status_labels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cronograma_status_labels_updated_at on public.cronograma_status_labels;
create trigger trg_cronograma_status_labels_updated_at
  before update on public.cronograma_status_labels
  for each row
  execute function public.set_cronograma_status_labels_updated_at();

alter table public.cronograma_status_labels enable row level security;

create policy "cronograma_status_labels_select" on public.cronograma_status_labels
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico']));

create policy "cronograma_status_labels_write" on public.cronograma_status_labels
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

insert into public.cronograma_status_labels (codigo, label, label_curto) values
  ('operacional', 'Operacional', 'Operacional'),
  ('bloqueada', 'Bloqueada', 'Bloqueada'),
  ('adm', 'Administrativa (ADM)', 'Adm')
on conflict (codigo) do nothing;
