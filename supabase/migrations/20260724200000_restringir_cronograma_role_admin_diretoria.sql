-- A pedido do usuário (2026-07-24): Ocupação de Salas e Cadastro de Valores
-- de Convênio (dado de receita) deixam de ser acessíveis ao papel
-- 'cronograma' — ficam restritas a admin/diretoria, junto com a remoção
-- já feita em frontend/lib/permissions/routes.ts (roleDefaults.cronograma).
--
-- Substitui as policies criadas em 20260724120000 (que ainda incluíam
-- 'cronograma' no array de roles) por versões só com admin/diretoria.

-- ===== cronograma_convenio_valores =====
DROP POLICY IF EXISTS "cronograma_convenio_valores_select" ON public.cronograma_convenio_valores;
DROP POLICY IF EXISTS "cronograma_convenio_valores_write" ON public.cronograma_convenio_valores;

CREATE POLICY "cronograma_convenio_valores_select" ON public.cronograma_convenio_valores
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

CREATE POLICY "cronograma_convenio_valores_write" ON public.cronograma_convenio_valores
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- ===== cronograma_convenio_valores_paciente =====
DROP POLICY IF EXISTS "cronograma_convenio_valores_paciente_select" ON public.cronograma_convenio_valores_paciente;
DROP POLICY IF EXISTS "cronograma_convenio_valores_paciente_write" ON public.cronograma_convenio_valores_paciente;

CREATE POLICY "cronograma_convenio_valores_paciente_select" ON public.cronograma_convenio_valores_paciente
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

CREATE POLICY "cronograma_convenio_valores_paciente_write" ON public.cronograma_convenio_valores_paciente
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- ===== cronograma_convenio_pacote_avaliacao =====
DROP POLICY IF EXISTS "cronograma_convenio_pacote_avaliacao_select" ON public.cronograma_convenio_pacote_avaliacao;
DROP POLICY IF EXISTS "cronograma_convenio_pacote_avaliacao_write" ON public.cronograma_convenio_pacote_avaliacao;

CREATE POLICY "cronograma_convenio_pacote_avaliacao_select" ON public.cronograma_convenio_pacote_avaliacao
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

CREATE POLICY "cronograma_convenio_pacote_avaliacao_write" ON public.cronograma_convenio_pacote_avaliacao
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- ===== cronograma_salas =====
DROP POLICY IF EXISTS "cronograma_salas_select" ON public.cronograma_salas;
DROP POLICY IF EXISTS "cronograma_salas_write" ON public.cronograma_salas;

CREATE POLICY "cronograma_salas_select" ON public.cronograma_salas
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

CREATE POLICY "cronograma_salas_write" ON public.cronograma_salas
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- ===== cronograma_salas_alocacoes =====
DROP POLICY IF EXISTS "cronograma_salas_alocacoes_select" ON public.cronograma_salas_alocacoes;
DROP POLICY IF EXISTS "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes;

CREATE POLICY "cronograma_salas_alocacoes_select" ON public.cronograma_salas_alocacoes
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

CREATE POLICY "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));
