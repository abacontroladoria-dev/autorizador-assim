-- Auditoria de segurança pré-redeploy (2026-07-23) encontrou 5 tabelas
-- criadas com policy "using (true)" para qualquer authenticated — ou seja,
-- qualquer usuário logado no sistema (recepção, autorização, terapêutico
-- etc.) conseguia ler e escrever valores de convênio/receita e a grade de
-- salas direto via API do Supabase, ignorando o gate de tela em
-- frontend/lib/permissions/routes.ts (que só esconde menu, não protege).
--
-- Alinha ao mesmo padrão já usado em feriados/remuneracao_* (helper
-- remuneracao_has_role, criado em 20260706000005), restrito ao mesmo
-- conjunto de roles que roleDefaults já concede pras permissões
-- 'cronograma_valores_convenio' e 'cronograma_ocupacao_salas': admin,
-- diretoria, cronograma.

-- ===== cronograma_convenio_valores =====
drop policy if exists "cronograma_convenio_valores_select_authenticated" on public.cronograma_convenio_valores;
drop policy if exists "cronograma_convenio_valores_insert_authenticated" on public.cronograma_convenio_valores;
drop policy if exists "cronograma_convenio_valores_update_authenticated" on public.cronograma_convenio_valores;
drop policy if exists "cronograma_convenio_valores_delete_authenticated" on public.cronograma_convenio_valores;

create policy "cronograma_convenio_valores_select" on public.cronograma_convenio_valores
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

create policy "cronograma_convenio_valores_write" on public.cronograma_convenio_valores
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

-- ===== cronograma_convenio_valores_paciente =====
drop policy if exists "cronograma_convenio_valores_paciente_select_authenticated" on public.cronograma_convenio_valores_paciente;
drop policy if exists "cronograma_convenio_valores_paciente_insert_authenticated" on public.cronograma_convenio_valores_paciente;
drop policy if exists "cronograma_convenio_valores_paciente_update_authenticated" on public.cronograma_convenio_valores_paciente;
drop policy if exists "cronograma_convenio_valores_paciente_delete_authenticated" on public.cronograma_convenio_valores_paciente;

create policy "cronograma_convenio_valores_paciente_select" on public.cronograma_convenio_valores_paciente
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

create policy "cronograma_convenio_valores_paciente_write" on public.cronograma_convenio_valores_paciente
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

-- ===== cronograma_convenio_pacote_avaliacao =====
drop policy if exists "cronograma_convenio_pacote_avaliacao_select_authenticated" on public.cronograma_convenio_pacote_avaliacao;
drop policy if exists "cronograma_convenio_pacote_avaliacao_insert_authenticated" on public.cronograma_convenio_pacote_avaliacao;
drop policy if exists "cronograma_convenio_pacote_avaliacao_update_authenticated" on public.cronograma_convenio_pacote_avaliacao;
drop policy if exists "cronograma_convenio_pacote_avaliacao_delete_authenticated" on public.cronograma_convenio_pacote_avaliacao;

create policy "cronograma_convenio_pacote_avaliacao_select" on public.cronograma_convenio_pacote_avaliacao
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

create policy "cronograma_convenio_pacote_avaliacao_write" on public.cronograma_convenio_pacote_avaliacao
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

-- ===== cronograma_salas =====
drop policy if exists "cronograma_salas_select_authenticated" on public.cronograma_salas;
drop policy if exists "cronograma_salas_insert_authenticated" on public.cronograma_salas;
drop policy if exists "cronograma_salas_update_authenticated" on public.cronograma_salas;
drop policy if exists "cronograma_salas_delete_authenticated" on public.cronograma_salas;

create policy "cronograma_salas_select" on public.cronograma_salas
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

create policy "cronograma_salas_write" on public.cronograma_salas
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

-- ===== cronograma_salas_alocacoes =====
drop policy if exists "cronograma_salas_alocacoes_select_authenticated" on public.cronograma_salas_alocacoes;
drop policy if exists "cronograma_salas_alocacoes_insert_authenticated" on public.cronograma_salas_alocacoes;
drop policy if exists "cronograma_salas_alocacoes_update_authenticated" on public.cronograma_salas_alocacoes;
drop policy if exists "cronograma_salas_alocacoes_delete_authenticated" on public.cronograma_salas_alocacoes;

create policy "cronograma_salas_alocacoes_select" on public.cronograma_salas_alocacoes
  for select to authenticated using (public.remuneracao_has_role(array['admin','diretoria','cronograma']));

create policy "cronograma_salas_alocacoes_write" on public.cronograma_salas_alocacoes
  for all to authenticated
  using (public.remuneracao_has_role(array['admin','diretoria','cronograma']))
  with check (public.remuneracao_has_role(array['admin','diretoria','cronograma']));
