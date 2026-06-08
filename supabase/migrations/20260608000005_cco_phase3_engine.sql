-- Fase 3 — RPC Functions for Conciliation Engine
-- Supports complex detection rules that can't be easily expressed in client

-- ============================================================================
-- RPC: Detect sessions without authorization
-- ============================================================================
CREATE OR REPLACE FUNCTION public.detect_sessions_without_authorization()
RETURNS TABLE (
  session_key text,
  data_sessao date,
  status_agendamento text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.session_key,
    a.data_sessao,
    a.status_agendamento
  FROM cco.atendimentos a
  WHERE a.status_agendamento NOT ILIKE ANY(ARRAY['%cancelad%','%falta%','%remanejad%','%remarcad%'])
    AND a.data_sessao <= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM cco.session_authorizations sa
      WHERE sa.session_key = a.session_key
        AND sa.authorization_status NOT IN ('SEM_SOLICITACAO')
    )
    AND a.orphaned_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_sessions_without_authorization TO service_role;

-- ============================================================================
-- COMMENT: Document the RPC functions
-- ============================================================================
COMMENT ON FUNCTION public.detect_sessions_without_authorization IS
  'Finds sessions that: (1) are active (not cancelled/rescheduled), (2) have passed the session date, (3) lack authorization records (excluding SEM_SOLICITACAO status).';
