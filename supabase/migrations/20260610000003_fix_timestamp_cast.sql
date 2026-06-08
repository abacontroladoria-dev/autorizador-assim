-- Fix: Cast timestamp columns properly
DROP FUNCTION IF EXISTS public.upsert_occurrences(jsonb);

CREATE FUNCTION public.upsert_occurrences(p_rows jsonb)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO cco.occurrences (
    session_key, tipo, severity, titulo, descricao,
    fingerprint, created_at, updated_at
  )
  SELECT
    row->>'session_key',
    (row->>'tipo')::occurrence_type_enum,
    (row->>'severity')::severity_enum,
    row->>'titulo',
    row->>'descricao',
    row->>'fingerprint',
    (row->>'created_at')::timestamp with time zone,
    (row->>'updated_at')::timestamp with time zone
  FROM jsonb_array_elements(p_rows) AS row
  ON CONFLICT (fingerprint) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_occurrences TO service_role;
