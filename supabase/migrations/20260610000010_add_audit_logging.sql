-- Create audit log table for critical operations
-- Tracks: role changes, user creation/deletion, data access for LGPD compliance

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  status TEXT DEFAULT 'success' NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
DROP POLICY IF EXISTS "audit_logs_view_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_view_admin"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND role = 'admin'
      AND ativo = true
    )
  );

-- No one can delete audit logs (immutable)
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete"
  ON public.audit_logs
  FOR DELETE
  TO authenticated
  USING (false);

-- Only system can insert (via trigger)
DROP POLICY IF EXISTS "audit_logs_insert_system" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_system"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ===== TRIGGER: Log role changes =====
CREATE OR REPLACE FUNCTION public.log_usuario_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.ativo IS DISTINCT FROM NEW.ativo) THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      CASE
        WHEN OLD.role IS DISTINCT FROM NEW.role THEN 'ROLE_CHANGE'
        WHEN OLD.ativo IS DISTINCT FROM NEW.ativo THEN 'USER_STATUS_CHANGE'
      END,
      'usuarios',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'ativo', OLD.ativo),
      jsonb_build_object('role', NEW.role, 'ativo', NEW.ativo),
      'success'
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'USER_DELETED',
      'usuarios',
      OLD.id,
      jsonb_build_object('email', OLD.email, 'role', OLD.role),
      'success'
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'USER_CREATED',
      'usuarios',
      NEW.id,
      jsonb_build_object('email', NEW.email, 'role', NEW.role),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_usuario_changes ON public.usuarios;
CREATE TRIGGER trigger_log_usuario_changes
AFTER INSERT OR UPDATE OR DELETE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.log_usuario_changes();

-- ===== TRIGGER: Log authorization access (LGPD compliance) =====
CREATE OR REPLACE FUNCTION public.log_authorization_access()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      TG_OP,
      'autorizacoes',
      NEW.id,
      CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_authorization_access ON public.autorizacoes;
CREATE TRIGGER trigger_log_authorization_access
AFTER UPDATE OR DELETE ON public.autorizacoes
FOR EACH ROW
EXECUTE FUNCTION public.log_authorization_access();

-- Data retention policy: Keep audit logs for 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.audit_logs
  WHERE timestamp < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;
