-- Debug: RPC to count records in CCO tables
CREATE OR REPLACE FUNCTION public.count_cco_records()
RETURNS TABLE (
  table_name text,
  record_count bigint
) AS $$
BEGIN
  RETURN QUERY SELECT 'atendimentos'::text, COUNT(*) FROM cco.atendimentos;
  RETURN QUERY SELECT 'session_authorizations'::text, COUNT(*) FROM cco.session_authorizations;
  RETURN QUERY SELECT 'session_substitutions'::text, COUNT(*) FROM cco.session_substitutions;
  RETURN QUERY SELECT 'occurrences'::text, COUNT(*) FROM cco.occurrences;
  RETURN QUERY SELECT 'dashboard_snapshot'::text, COUNT(*) FROM cco.dashboard_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.count_cco_records TO service_role;

COMMENT ON FUNCTION public.count_cco_records IS
  'Count records in all CCO tables for debugging purposes.';
