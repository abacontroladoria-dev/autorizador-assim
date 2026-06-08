-- Create RPC to verify public.occurrences view

DROP FUNCTION IF EXISTS public.test_occurrences_view();

CREATE FUNCTION public.test_occurrences_view()
RETURNS TABLE (view_exists boolean, record_count bigint) AS $$
DECLARE
  v_exists boolean;
  v_count bigint;
BEGIN
  -- Check if view exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name = 'occurrences'
  ) INTO v_exists;

  -- Count records if exists
  IF v_exists THEN
    SELECT COUNT(*) INTO v_count FROM public.occurrences;
  ELSE
    v_count := -1;
  END IF;

  RETURN QUERY SELECT v_exists, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.test_occurrences_view TO service_role, authenticated, anon;

-- Also create a simple RPC to list all occurrences
DROP FUNCTION IF EXISTS public.list_all_occurrences();

CREATE FUNCTION public.list_all_occurrences()
RETURNS TABLE (
  id uuid,
  session_key text,
  tipo text,
  severity text,
  titulo text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.session_key, o.tipo::text, o.severity::text, o.titulo, o.created_at
  FROM cco.occurrences o
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.list_all_occurrences TO service_role, authenticated, anon;
