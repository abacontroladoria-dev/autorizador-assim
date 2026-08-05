-- Pedido do usuário (2026-08-05): 4 salas de Realengo (23, 28, 32, 42) não
-- podem receber agendamento de atendimento — precisam de um status próprio
-- "NTI", que se comporta como bloqueada/adm pra ocupação (capacidade zerada,
-- fora dos cálculos de % ocupação — ver capacidadeProjetadaSala/statusDoSlot
-- em salasTypes.ts/salas.ts, que já tratam "qualquer status != operacional"
-- de forma genérica), mas com cor própria pra diferenciar visualmente de
-- Bloqueada (vermelho) e ADM (roxo).
--
-- cronograma_status_labels ganha coluna `tone` — reaproveita a paleta fixa
-- de 6 cores já usada em todo o resto do Cronograma (Tone em
-- components/cronograma/ui/tones.ts: green/amber/blue/purple/red/slate), em
-- vez de inventar cor livre — garante contraste correto em light/dark sem
-- CSS novo.

alter table public.cronograma_salas drop constraint if exists cronograma_salas_status_check;
alter table public.cronograma_salas
  add constraint cronograma_salas_status_check check (status in ('operacional', 'bloqueada', 'adm', 'nti'));

alter table public.cronograma_status_labels drop constraint if exists cronograma_status_labels_codigo_check;
alter table public.cronograma_status_labels
  add constraint cronograma_status_labels_codigo_check check (codigo in ('operacional', 'bloqueada', 'adm', 'nti'));

alter table public.cronograma_status_labels
  add column if not exists tone text not null default 'slate'
  check (tone in ('green', 'amber', 'blue', 'purple', 'red', 'slate'));

update public.cronograma_status_labels set tone = 'green' where codigo = 'operacional';
update public.cronograma_status_labels set tone = 'red' where codigo = 'bloqueada';
update public.cronograma_status_labels set tone = 'purple' where codigo = 'adm';

insert into public.cronograma_status_labels (codigo, label, label_curto, tone) values
  ('nti', 'NTI', 'NTI', 'blue')
on conflict (codigo) do nothing;

update public.cronograma_salas set status = 'nti'
where unidade_nome = 'Realengo' and numero_sala in ('23', '28', '32', '42');
