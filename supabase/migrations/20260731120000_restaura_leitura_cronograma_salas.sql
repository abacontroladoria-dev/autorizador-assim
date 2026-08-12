-- A migration 20260724200000 removeu o papel 'cronograma' do SELECT de
-- cronograma_salas/cronograma_salas_alocacoes (só admin/diretoria liam).
-- A pedido do usuário (2026-07-31): quem já tem a permissão de tela
-- `cronograma_ocupacao_salas` (role default OU override individual em
-- usuarios_permissoes) precisa também conseguir LER o dado, senão a tela
-- carrega vazia/sem dado mesmo aparecendo no menu. Checado em
-- usuarios_permissoes (2026-07-24): 5 pessoas têm essa permissão liberada —
-- 3 já cobertas por admin/diretoria, + role 'cronograma' (Victoria França) e
-- role 'terapeutico' (Juliana) que ainda não estavam na RLS. Escrita
-- continua restrita a admin/diretoria (sem mudança nesse ponto).

DROP POLICY IF EXISTS "cronograma_salas_select" ON public.cronograma_salas;
CREATE POLICY "cronograma_salas_select" ON public.cronograma_salas
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']));

DROP POLICY IF EXISTS "cronograma_salas_alocacoes_select" ON public.cronograma_salas_alocacoes;
CREATE POLICY "cronograma_salas_alocacoes_select" ON public.cronograma_salas_alocacoes
  FOR SELECT TO authenticated USING (public.remuneracao_has_role(ARRAY['admin','diretoria','cronograma','terapeutico']));
