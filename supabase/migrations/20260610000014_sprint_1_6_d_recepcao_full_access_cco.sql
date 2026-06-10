-- Sprint 1.6-D: Add Recepcao Full Access to CCO Schema
-- Recepcao role needs complete access to CCO tables for operational purposes
-- Access level: Full (SELECT + INSERT + UPDATE + DELETE)

-- ===== CCO.ATENDIMENTOS TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_atendimentos_recepcao_all"
  ON cco.atendimentos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.OCCURRENCES TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_occurrences_recepcao_all"
  ON cco.occurrences
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.DASHBOARD_SNAPSHOT TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_dashboard_snapshot_recepcao_all"
  ON cco.dashboard_snapshot
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.PROCESSING_LOGS TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_processing_logs_recepcao_all"
  ON cco.processing_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.SESSION_AUTHORIZATIONS TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_session_authorizations_recepcao_all"
  ON cco.session_authorizations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.SESSION_MUTATIONS TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_session_mutations_recepcao_all"
  ON cco.session_mutations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );

-- ===== CCO.SESSION_SUBSTITUTIONS TABLE =====
-- Recepcao: full access
CREATE POLICY "cco_session_substitutions_recepcao_all"
  ON cco.session_substitutions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
        AND role = 'recepcao'
        AND ativo = true
    )
  );
