-- Achado da revisão de segurança de 2026-07-28: previsao_receitas_historico e
-- previsao_receitas_historico_resumo foram criadas com a mesma policy
-- genérica "authenticated" usada em substituicoes_historico, mas os dados
-- aqui são financeiros sensíveis (receita por paciente/convênio) que devem
-- ser restritos a admin/diretoria — exatamente a mesma classe de problema já
-- corrigida em 20260724120000_restringir_rls_cronograma_valores_salas.sql
-- para cronograma_convenio_valores/cronograma_salas. Sem esta correção,
-- QUALQUER usuário autenticado (recepção, autorização, terapêutico etc.)
-- conseguia ler essas tabelas direto via API do Supabase, ignorando
-- completamente o gate de tela (?tab=historico-receitas / previsao-receitas
-- é só UX, não segurança).

DROP POLICY IF EXISTS "previsao_receitas_historico_select" ON public.previsao_receitas_historico;
CREATE POLICY "previsao_receitas_historico_select"
  ON public.previsao_receitas_historico FOR SELECT
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

DROP POLICY IF EXISTS "previsao_receitas_historico_resumo_select" ON public.previsao_receitas_historico_resumo;
CREATE POLICY "previsao_receitas_historico_resumo_select"
  ON public.previsao_receitas_historico_resumo FOR SELECT
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- As policies de INSERT/UPDATE (só service_role, já corretas desde a criação)
-- não mudam.
