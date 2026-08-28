-- Sequência de 20260708150000: SELECT em remuneracao_contratos_atuais/antigos
-- (PII) já libera diretoria. Escrita (FOR ALL) continuava restrita a rp/admin,
-- então digitar valores na tela de Config salvava silenciosamente com erro de
-- RLS para quem loga como diretoria. Estende a mesma liberação para escrita.

DROP POLICY IF EXISTS "remuneracao_contratos_antigos_write" ON remuneracao_contratos_antigos;
CREATE POLICY "remuneracao_contratos_antigos_write" ON remuneracao_contratos_antigos FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

DROP POLICY IF EXISTS "remuneracao_contratos_atuais_write" ON remuneracao_contratos_atuais;
CREATE POLICY "remuneracao_contratos_atuais_write" ON remuneracao_contratos_atuais FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));
