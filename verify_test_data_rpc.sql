-- Verificar dados de teste via RPC (não precisa de Data API)
-- Execute no SQL Editor do Supabase

-- 1. Criar RPC function que retorna contagem de test data
CREATE OR REPLACE FUNCTION public.count_test_data()
RETURNS TABLE (
  table_name text,
  test_row_count integer
) AS $$
BEGIN
  RETURN QUERY SELECT 'sessions'::text, COUNT(*)::integer FROM cco.atendimentos WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'mutations'::text, COUNT(*)::integer FROM cco.session_mutations WHERE session_key_old LIKE 'test_%'
  UNION ALL
  SELECT 'authorizations'::text, COUNT(*)::integer FROM cco.session_authorizations WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'substitutions'::text, COUNT(*)::integer FROM cco.session_substitutions WHERE session_key LIKE 'test_%';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.count_test_data TO service_role;

-- 2. Execute para ver os dados
SELECT * FROM public.count_test_data();
