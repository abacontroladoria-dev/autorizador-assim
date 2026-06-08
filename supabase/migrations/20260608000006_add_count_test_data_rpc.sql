-- RPC Function to count test data (doesn't require Data API schema enablement)

CREATE OR REPLACE FUNCTION public.count_test_data()
RETURNS TABLE (
  table_name text,
  test_row_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'sessions'::text, COUNT(*)::bigint FROM cco.atendimentos WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'mutations'::text, COUNT(*)::bigint FROM cco.session_mutations WHERE session_key_old LIKE 'test_%'
  UNION ALL
  SELECT 'authorizations'::text, COUNT(*)::bigint FROM cco.session_authorizations WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'substitutions'::text, COUNT(*)::bigint FROM cco.session_substitutions WHERE session_key LIKE 'test_%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.count_test_data TO service_role, authenticated, anon;

COMMENT ON FUNCTION public.count_test_data IS
  'Returns count of test data (test_*) in CCO tables. Useful for validation without needing Data API schema access.';
