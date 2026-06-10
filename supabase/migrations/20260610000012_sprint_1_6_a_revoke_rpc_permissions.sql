-- Sprint 1.6-A: Revoke Exposed RPC Permissions
-- Security hardening: restrict CCO detection RPCs to service_role only
-- Prevents unauthenticated and authenticated users from calling CCO introspection RPCs

-- ===== BATCH AUTO RESOLVE =====
REVOKE EXECUTE ON FUNCTION public.batch_auto_resolve_occurrences(text, text[])
FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.batch_auto_resolve_occurrences(text, text[])
TO service_role;

-- ===== SAMPLE CCO DATA =====
REVOKE EXECUTE ON FUNCTION public.sample_cco_data()
FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.sample_cco_data()
TO service_role;

-- ===== GET CCO STATS =====
REVOKE EXECUTE ON FUNCTION public.get_cco_stats()
FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.get_cco_stats()
TO service_role;

-- ===== COUNT CCO RECORDS =====
REVOKE EXECUTE ON FUNCTION public.count_cco_records()
FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.count_cco_records()
TO service_role;
