-- Extrai o padrão "EXISTS (... usuarios ... role IN (...))" repetido em
-- 20260706000002 para um helper único, seguindo o padrão já estabelecido em
-- public.is_admin() (20260610000011_rls_hardening_rbac_unit_isolation.sql).
-- Evita que tabelas futuras (Passo 9) colem a lista de roles errada.
CREATE OR REPLACE FUNCTION public.remuneracao_has_role(roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.ativo = true AND u.role = ANY(roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ===== remuneracao_config =====
DROP POLICY IF EXISTS "remuneracao_config_select" ON remuneracao_config;
DROP POLICY IF EXISTS "remuneracao_config_write" ON remuneracao_config;

CREATE POLICY "remuneracao_config_select" ON remuneracao_config FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

CREATE POLICY "remuneracao_config_write" ON remuneracao_config FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin']));

-- ===== remuneracao_contratos_antigos (PII) =====
DROP POLICY IF EXISTS "remuneracao_contratos_antigos_select" ON remuneracao_contratos_antigos;
DROP POLICY IF EXISTS "remuneracao_contratos_antigos_write" ON remuneracao_contratos_antigos;

CREATE POLICY "remuneracao_contratos_antigos_select" ON remuneracao_contratos_antigos FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin']));

CREATE POLICY "remuneracao_contratos_antigos_write" ON remuneracao_contratos_antigos FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin']));

-- ===== remuneracao_contratos_atuais (PII) =====
DROP POLICY IF EXISTS "remuneracao_contratos_atuais_select" ON remuneracao_contratos_atuais;
DROP POLICY IF EXISTS "remuneracao_contratos_atuais_write" ON remuneracao_contratos_atuais;

CREATE POLICY "remuneracao_contratos_atuais_select" ON remuneracao_contratos_atuais FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin']));

CREATE POLICY "remuneracao_contratos_atuais_write" ON remuneracao_contratos_atuais FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin']));

-- ===== remuneracao_capacidades =====
DROP POLICY IF EXISTS "remuneracao_capacidades_select" ON remuneracao_capacidades;
DROP POLICY IF EXISTS "remuneracao_capacidades_write" ON remuneracao_capacidades;

CREATE POLICY "remuneracao_capacidades_select" ON remuneracao_capacidades FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

CREATE POLICY "remuneracao_capacidades_write" ON remuneracao_capacidades FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin']));

-- ===== remuneracao_historico =====
DROP POLICY IF EXISTS "remuneracao_historico_select" ON remuneracao_historico;
DROP POLICY IF EXISTS "remuneracao_historico_write" ON remuneracao_historico;

CREATE POLICY "remuneracao_historico_select" ON remuneracao_historico FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

CREATE POLICY "remuneracao_historico_write" ON remuneracao_historico FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin']));
