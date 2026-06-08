-- R3: EVOLUCAO_ATRASADA detection RPC
-- Detects sessions without evolution/treatment record
-- Matches: orphaned_at IS NULL AND (possui_tratativa = false OR possui_tratativa IS NULL)

CREATE OR REPLACE FUNCTION public.detect_r3_evolucao_atrasada()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  WHERE a.orphaned_at IS NULL
    AND (a.possui_tratativa = false OR a.possui_tratativa IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r3_evolucao_atrasada TO service_role;
