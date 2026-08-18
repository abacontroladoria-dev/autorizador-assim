-- Bug: Diovanna (role 'rp', RP — Remuneração e Pagamentos) tem permissão de
-- página liberada em usuarios_permissoes para /relacionamento-prestador/ocupacao-salas
-- (grupo cronograma_ocupacao_salas), mas as policies de SELECT das tabelas dessa
-- tela nunca incluíram o role 'rp' — ela abre a página mas vê "0 salas cadastradas".
-- Mesma classe do bug já corrigido em 2026-07-31/2026-08-03: leitura deve
-- acompanhar quem tem a permissão de tela, não só admin/diretoria/cronograma/terapeutico.

drop policy if exists "cronograma_salas_select" on public.cronograma_salas;
create policy "cronograma_salas_select" on public.cronograma_salas
  for select to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico','rp']));

drop policy if exists "cronograma_salas_alocacoes_select" on public.cronograma_salas_alocacoes;
create policy "cronograma_salas_alocacoes_select" on public.cronograma_salas_alocacoes
  for select to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico','rp']));

drop policy if exists "cronograma_nucleos_select" on public.cronograma_nucleos;
create policy "cronograma_nucleos_select" on public.cronograma_nucleos
  for select to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico','rp']));

drop policy if exists "cronograma_status_labels_select" on public.cronograma_status_labels;
create policy "cronograma_status_labels_select" on public.cronograma_status_labels
  for select to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico','rp']));

drop policy if exists "cronograma_salas_terapias_exclusivas_select" on public.cronograma_salas_terapias_exclusivas;
create policy "cronograma_salas_terapias_exclusivas_select" on public.cronograma_salas_terapias_exclusivas
  for select to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma','terapeutico','rp']));
