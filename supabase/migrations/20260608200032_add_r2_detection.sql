-- R2: SESSAO_SEM_AUTORIZACAO detection RPC
-- Detects sessions in cco.atendimentos that have no corresponding entry in cco.session_authorizations

CREATE OR REPLACE FUNCTION public.detect_r2_sessao_sem_autorizacao()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  LEFT JOIN cco.session_authorizations sa ON sa.session_key = a.session_key
  WHERE sa.session_key IS NULL
    AND a.orphaned_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r2_sessao_sem_autorizacao TO service_role;
