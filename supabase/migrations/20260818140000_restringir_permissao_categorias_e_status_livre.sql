-- Pedido do usuário (2026-08-14):
-- 1. Só Administrador/Diretoria podem editar Núcleo/Status em "Gerenciar
--    categorias" (relacionamento-prestador/ocupacao-salas) — mesmo que outros
--    papéis (ex.: cronograma) tenham acesso à página. Antes a RLS de escrita
--    dessas duas tabelas incluía 'cronograma'; agora fica só admin/diretoria.
-- 2. Status deixa de ser uma lista fixa (operacional/bloqueada/adm/nti) — vira
--    CRUD livre igual Núcleo já é. cronograma_salas.status ganha FK pra
--    cronograma_status_labels (mesmo padrão ON UPDATE CASCADE / ON DELETE
--    RESTRICT do núcleo) no lugar do CHECK fixo.

-- ===== RLS: só admin/diretoria escrevem categorias =====
drop policy if exists "cronograma_nucleos_write" on public.cronograma_nucleos;
create policy "cronograma_nucleos_write" on public.cronograma_nucleos
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria']))
  with check (public.remuneracao_has_role(array['admin','diretoria']));

drop policy if exists "cronograma_status_labels_write" on public.cronograma_status_labels;
create policy "cronograma_status_labels_write" on public.cronograma_status_labels
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria']))
  with check (public.remuneracao_has_role(array['admin','diretoria']));

-- ===== Status vira lista livre (mesmo padrão do Núcleo) =====
alter table public.cronograma_status_labels
  drop constraint if exists cronograma_status_labels_codigo_check;

alter table public.cronograma_salas
  drop constraint if exists cronograma_salas_status_check;

alter table public.cronograma_salas
  add constraint fk_cronograma_salas_status
  foreign key (status) references public.cronograma_status_labels (codigo)
  on update cascade on delete restrict;
