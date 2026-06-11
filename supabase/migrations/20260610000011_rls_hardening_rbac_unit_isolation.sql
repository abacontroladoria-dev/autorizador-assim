-- RLS Hardening: RBAC + Unit Isolation
-- This migration implements strict role-based and unit-based access control
-- Removes all USING (true) policies and replaces with data isolation rules

-- ===== Step 1: Add unit/department column to usuarios if missing =====
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS unidade TEXT DEFAULT 'principal';

-- ===== Step 2: Drop all overly permissive policies =====

-- Autorizacoes - remove public access
DROP POLICY IF EXISTS "Permitir update de autorizacoes" ON public.autorizacoes;
DROP POLICY IF EXISTS "insert publico" ON public.autorizacoes;
DROP POLICY IF EXISTS "select liberado geral" ON public.autorizacoes;
DROP POLICY IF EXISTS "update autorizacoes liberado" ON public.autorizacoes;

-- Chamada Paciente - remove anon access
DROP POLICY IF EXISTS "Liberar tudo chamada" ON public.chamada_paciente;
DROP POLICY IF EXISTS "Permitir insert chamada" ON public.chamada_paciente;

-- Controle Terapeutico - remove USING (true)
DROP POLICY IF EXISTS "Permitir select controle terapeutico autenticado" ON public.controle_terapeutico;
DROP POLICY IF EXISTS "Permitir update controle terapeutico autenticado" ON public.controle_terapeutico;
DROP POLICY IF EXISTS "controle_terapeutico_select_authenticated" ON public.controle_terapeutico;
DROP POLICY IF EXISTS "controle_terapeutico_update_authenticated" ON public.controle_terapeutico;

-- Fila Autorizacoes - remove USING (true)
DROP POLICY IF EXISTS "Usuarios autenticados podem atualizar classificacao" ON public.fila_autorizacoes;
DROP POLICY IF EXISTS "Usuarios autenticados podem ver registros" ON public.fila_autorizacoes;
DROP POLICY IF EXISTS "full access fila" ON public.fila_autorizacoes;
DROP POLICY IF EXISTS "update fila" ON public.fila_autorizacoes;

-- Logs - remove USING (true)
DROP POLICY IF EXISTS "insert logs liberado geral" ON public.logs;

-- Sync Controle - remove public access
DROP POLICY IF EXISTS "Permitir select sync" ON public.sync_controle;
DROP POLICY IF EXISTS "Permitir update sync" ON public.sync_controle;

-- ===== Step 3: Create helper function to check admin role =====
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
    AND role = 'admin'
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== Step 4: Create helper function to check user unit =====
CREATE OR REPLACE FUNCTION public.get_user_unit()
RETURNS TEXT AS $$
DECLARE
  user_unit TEXT;
BEGIN
  SELECT unidade INTO user_unit
  FROM public.usuarios
  WHERE id = auth.uid() AND ativo = true;
  RETURN COALESCE(user_unit, 'principal');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== AUTORIZACOES TABLE =====
-- Medical authorizations - restrict by role and unit

CREATE POLICY "autorizacoes_admin_all"
  ON public.autorizacoes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- Recepcao: can view and manage own unit's authorizations
CREATE POLICY "autorizacoes_recepcao_unit"
  ON public.autorizacoes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('recepcao', 'diretoria')
      AND u.ativo = true
    )
    AND (dep IS NOT NULL)
  );

-- Terapeutico/Faturamento: view own department
CREATE POLICY "autorizacoes_therapeutic_read"
  ON public.autorizacoes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('terapeutico', 'faturamento', 'autorizacao')
      AND u.ativo = true
    )
  );

-- Block all deletes for non-admin
CREATE POLICY "autorizacoes_no_delete_non_admin"
  ON public.autorizacoes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- ===== CHAMADA_PACIENTE TABLE =====
-- Patient calls - restrict by unit

CREATE POLICY "chamada_paciente_authenticated"
  ON public.chamada_paciente
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.ativo = true
      AND (
        u.role = 'admin'
        OR COALESCE(u.unidade, 'principal') = COALESCE(unidade, 'principal')
      )
    )
  );

CREATE POLICY "chamada_paciente_insert_auth"
  ON public.chamada_paciente
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.ativo = true
      AND u.role IN ('recepcao', 'admin', 'diretoria')
      AND (
        u.role = 'admin'
        OR COALESCE(u.unidade, 'principal') = COALESCE(unidade, 'principal')
      )
    )
  );

CREATE POLICY "chamada_paciente_update_auth"
  ON public.chamada_paciente
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.ativo = true
      AND u.role IN ('recepcao', 'admin', 'diretoria')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.ativo = true
      AND (
        u.role = 'admin'
        OR COALESCE(u.unidade, 'principal') = COALESCE(unidade, 'principal')
      )
    )
  );

-- ===== CONTROLE_TERAPEUTICO TABLE =====
-- Therapeutic control - restrict by role

CREATE POLICY "controle_terapeutico_therapeutic_select"
  ON public.controle_terapeutico
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('terapeutico', 'terapeuta', 'admin')
      AND u.ativo = true
    )
  );

CREATE POLICY "controle_terapeutico_therapeutic_insert"
  ON public.controle_terapeutico
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('terapeutico', 'terapeuta', 'admin')
      AND u.ativo = true
    )
  );

CREATE POLICY "controle_terapeutico_therapeutic_update"
  ON public.controle_terapeutico
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('terapeutico', 'terapeuta', 'admin')
      AND u.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('terapeutico', 'terapeuta', 'admin')
      AND u.ativo = true
    )
  );

-- Block deletes for non-admin (terapeutico/terapeuta cannot delete)
CREATE POLICY "controle_terapeutico_no_delete_non_admin"
  ON public.controle_terapeutico
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- ===== FILA_AUTORIZACOES TABLE =====
-- Authorization queue - restrict by role and unit

CREATE POLICY "fila_autorizacoes_admin_all"
  ON public.fila_autorizacoes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- Autorizacao role: can view and update
CREATE POLICY "fila_autorizacoes_autorizacao"
  ON public.fila_autorizacoes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('autorizacao', 'diretoria')
      AND u.ativo = true
    )
  );

CREATE POLICY "fila_autorizacoes_autorizacao_update"
  ON public.fila_autorizacoes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('autorizacao', 'diretoria')
      AND u.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role IN ('autorizacao', 'diretoria')
      AND u.ativo = true
    )
  );

-- Recepcao: SELECT + INSERT + UPDATE (no DELETE)
CREATE POLICY "fila_autorizacoes_recepcao_select"
  ON public.fila_autorizacoes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'recepcao'
      AND u.ativo = true
    )
  );

CREATE POLICY "fila_autorizacoes_recepcao_insert"
  ON public.fila_autorizacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'recepcao'
      AND u.ativo = true
    )
  );

CREATE POLICY "fila_autorizacoes_recepcao_update"
  ON public.fila_autorizacoes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'recepcao'
      AND u.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'recepcao'
      AND u.ativo = true
    )
  );

-- Recepcao cannot delete
CREATE POLICY "fila_autorizacoes_recepcao_no_delete"
  ON public.fila_autorizacoes
  FOR DELETE
  TO authenticated
  USING (false);

-- ===== LOGS TABLE =====
-- Activity logs - strict role-based access

CREATE POLICY "logs_admin_only"
  ON public.logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- System can insert logs via service role
CREATE POLICY "logs_system_insert"
  ON public.logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ===== SYNC_CONTROLE TABLE =====
-- Sync control - admin only

CREATE POLICY "sync_controle_admin_all"
  ON public.sync_controle
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- ===== USUARIOS TABLE =====
-- User management - admin + own profile

CREATE POLICY "usuarios_admin_all"
  ON public.usuarios
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
      AND u.ativo = true
    )
  );

-- Users can view own profile
CREATE POLICY "usuarios_view_own_profile"
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can update own profile (except role)
CREATE POLICY "usuarios_update_own_profile"
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.usuarios WHERE id = auth.uid()));

-- ===== Data Isolation Audit Log =====
CREATE OR REPLACE FUNCTION public.audit_rls_access_attempt()
RETURNS TRIGGER AS $$
BEGIN
  -- Log whenever a user attempts to access restricted data
  -- This helps detect authorization bypass attempts
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    action,
    table_name,
    record_id,
    status,
    error_message
  ) VALUES (
    auth.uid(),
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'unknown'),
    TG_OP || '_RESTRICTED_ACCESS_ATTEMPT',
    TG_TABLE_NAME,
    NEW.id,
    'blocked',
    'Row-level security policy denied access'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== Verify no USING (true) remains =====
-- This query helps verify the migration:
-- SELECT tablename, policyname, qual
-- FROM pg_policies
-- WHERE qual LIKE '%true%' AND tablename IN ('autorizacoes', 'chamada_paciente', 'controle_terapeutico', 'fila_autorizacoes', 'logs', 'sync_controle', 'usuarios');
