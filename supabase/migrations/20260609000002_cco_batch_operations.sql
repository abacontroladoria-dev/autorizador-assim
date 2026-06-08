-- Batch operations for CCO engine optimization

-- ============================================================================
-- RPC: Get CCO Statistics (for testing/validation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cco_stats()
RETURNS TABLE (
  atendimentos_total bigint,
  atendimentos_ativos bigint,
  session_authorizations bigint,
  session_mutations bigint,
  session_substitutions bigint,
  occurrences_total bigint,
  occurrences_ativas bigint,
  dashboard_snapshots bigint
) AS $$
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM cco.atendimentos),
    (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NULL),
    (SELECT COUNT(*) FROM cco.session_authorizations),
    (SELECT COUNT(*) FROM cco.session_mutations),
    (SELECT COUNT(*) FROM cco.session_substitutions),
    (SELECT COUNT(*) FROM cco.occurrences),
    (SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.dashboard_snapshot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_cco_stats TO service_role;

COMMENT ON FUNCTION public.get_cco_stats IS
  'Returns count of records in CCO tables for validation and monitoring.';

-- ============================================================================
-- RPC: Batch auto-resolve occurrences
-- Auto-resolve all occurrences of a given type that are NOT in the active set
-- ============================================================================
CREATE OR REPLACE FUNCTION public.batch_auto_resolve_occurrences(
  p_tipo text,
  p_active_session_keys text[]
)
RETURNS integer AS $$
DECLARE
  v_resolved_count integer := 0;
BEGIN
  UPDATE cco.occurrences
  SET
    resolved_at = now(),
    resolution_note = 'auto: condição não mais detectada',
    updated_at = now()
  WHERE
    tipo = p_tipo
    AND resolved_at IS NULL
    AND resolved_by IS NULL
    AND (p_active_session_keys IS NULL OR session_key != ALL(p_active_session_keys));

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
  RETURN v_resolved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.batch_auto_resolve_occurrences TO service_role;

COMMENT ON FUNCTION public.batch_auto_resolve_occurrences IS
  'Batch update: mark occurrences as resolved if session_key is NOT in active set. Replaces row-by-row UPDATE loop.';

-- ============================================================================
-- RPC: Get CCO statistics (for validation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_cco_stats()
RETURNS TABLE (
  atendimentos_total bigint,
  atendimentos_ativos bigint,
  occurrences_total bigint,
  occurrences_ativas bigint,
  dashboard_snapshots bigint
) AS $$
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM cco.atendimentos),
    (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences),
    (SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.dashboard_snapshot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_cco_stats TO service_role;

COMMENT ON FUNCTION public.get_cco_stats IS
  'Returns count of records in CCO tables for validation without REST API schema access.';
