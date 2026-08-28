-- remuneracao_config e remuneracao_capacidades já liberam SELECT para
-- diretoria (20260706000005), mas a escrita (FOR ALL) continuava restrita a
-- rp/admin. Um usuário diretoria que edita "Variáveis & Taxas", "Feriados" ou
-- "Capacidade" recebia um erro genérico de salvamento. Estende a mesma
-- liberação de escrita já aplicada a remuneracao_contratos_atuais/antigos em
-- 20260708151500.

DROP POLICY IF EXISTS "remuneracao_config_write" ON remuneracao_config;
CREATE POLICY "remuneracao_config_write" ON remuneracao_config FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

DROP POLICY IF EXISTS "remuneracao_capacidades_write" ON remuneracao_capacidades;
CREATE POLICY "remuneracao_capacidades_write" ON remuneracao_capacidades FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));
