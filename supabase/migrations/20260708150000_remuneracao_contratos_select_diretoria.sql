-- remuneracao_contratos_atuais/antigos (PII) tinham SELECT restrito a rp/admin,
-- diferente de remuneracao_config e remuneracao_capacidades (que já liberam
-- diretoria). Isso fazia a aba Config aparecer com Contratos Atuais/Antigos
-- vazios para quem loga como diretoria, mesmo com dados cadastrados no banco
-- (RLS nega a leitura silenciosamente, sem erro). Alinha o SELECT ao mesmo
-- conjunto de roles das demais abas de Config. A escrita é liberada em
-- seguida por 20260708151500.

DROP POLICY IF EXISTS "remuneracao_contratos_antigos_select" ON remuneracao_contratos_antigos;
CREATE POLICY "remuneracao_contratos_antigos_select" ON remuneracao_contratos_antigos FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

DROP POLICY IF EXISTS "remuneracao_contratos_atuais_select" ON remuneracao_contratos_atuais;
CREATE POLICY "remuneracao_contratos_atuais_select" ON remuneracao_contratos_atuais FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));
