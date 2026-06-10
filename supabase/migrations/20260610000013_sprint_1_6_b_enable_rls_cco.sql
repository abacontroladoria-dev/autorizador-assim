-- Sprint 1.6-B: Enable RLS on CCO Schema
-- Security hardening: enforce row-level security on all CCO tables
-- Admin: full access (all operations)
-- Diretoria: read-only access
-- Others: no access
-- Service role: bypasses RLS (as designed)

-- ===== ENABLE RLS ON ALL CCO TABLES =====
ALTER TABLE cco.atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.dashboard_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.session_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.session_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cco.session_substitutions ENABLE ROW LEVEL SECURITY;

-- ===== CCO.ATENDIMENTOS TABLE =====

-- Admin: full access
CREATE POLICY "cco_atendimentos_admin_all"
  ON cco.atendimentos
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_atendimentos_read_admin_diretoria"
  ON cco.atendimentos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.OCCURRENCES TABLE =====

-- Admin: full access
CREATE POLICY "cco_occurrences_admin_all"
  ON cco.occurrences
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_occurrences_read_admin_diretoria"
  ON cco.occurrences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.DASHBOARD_SNAPSHOT TABLE =====

-- Admin: full access
CREATE POLICY "cco_dashboard_snapshot_admin_all"
  ON cco.dashboard_snapshot
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_dashboard_snapshot_read_admin_diretoria"
  ON cco.dashboard_snapshot
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.PROCESSING_LOGS TABLE =====

-- Admin: full access
CREATE POLICY "cco_processing_logs_admin_all"
  ON cco.processing_logs
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_processing_logs_read_admin_diretoria"
  ON cco.processing_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.SESSION_AUTHORIZATIONS TABLE =====

-- Admin: full access
CREATE POLICY "cco_session_authorizations_admin_all"
  ON cco.session_authorizations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_session_authorizations_read_admin_diretoria"
  ON cco.session_authorizations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.SESSION_MUTATIONS TABLE =====

-- Admin: full access
CREATE POLICY "cco_session_mutations_admin_all"
  ON cco.session_mutations
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_session_mutations_read_admin_diretoria"
  ON cco.session_mutations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );

-- ===== CCO.SESSION_SUBSTITUTIONS TABLE =====

-- Admin: full access
CREATE POLICY "cco_session_substitutions_admin_all"
  ON cco.session_substitutions
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Diretoria: read-only
CREATE POLICY "cco_session_substitutions_read_admin_diretoria"
  ON cco.session_substitutions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );
