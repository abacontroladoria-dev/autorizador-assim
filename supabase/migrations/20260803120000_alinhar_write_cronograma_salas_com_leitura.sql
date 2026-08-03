-- Bug reportado (2026-08-03): Juliana (role 'terapeutico') tem acesso à tela
-- Ocupação de Salas e consegue VER a grade, mas ao clicar em "Excluir" numa
-- alocação nada acontece — nenhum erro aparece. Causa: a migration
-- 20260731120000 liberou SELECT em cronograma_salas/cronograma_salas_alocacoes
-- para quem tem a permissão de tela (admin, diretoria, cronograma,
-- terapeutico), mas o WRITE (insert/update/delete) continuou restrito a
-- admin/diretoria (herdado de 20260724200000). RLS em DELETE não gera erro
-- quando a policy não bate com a linha — só filtra silenciosamente, por isso
-- o botão "parecia" não fazer nada.
--
-- Decisão do usuário: quem tem acesso à aba precisa poder usar todas as
-- ferramentas da tela (criar/editar/excluir sala, criar/editar/excluir
-- alocação) — não só leitura. Alinha WRITE ao mesmo conjunto de roles do
-- SELECT em ambas as tabelas.

DROP POLICY IF EXISTS "cronograma_salas_write" ON public.cronograma_salas;
CREATE POLICY "cronograma_salas_write" ON public.cronograma_salas
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']));

DROP POLICY IF EXISTS "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes;
CREATE POLICY "cronograma_salas_alocacoes_write" ON public.cronograma_salas_alocacoes
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']));
