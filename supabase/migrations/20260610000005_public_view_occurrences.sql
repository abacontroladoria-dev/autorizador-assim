-- Create public view to expose cco.occurrences for REST API access
-- Allows test scripts to validate occurrences via Supabase REST API

DROP VIEW IF EXISTS public.occurrences CASCADE;

CREATE VIEW public.occurrences AS
SELECT
  id,
  session_key,
  tipo,
  severity,
  titulo,
  descricao,
  impacto_financeiro,
  responsavel_acao,
  acao_recomendada,
  fingerprint,
  resolved_at,
  resolved_by,
  resolution_note,
  created_at,
  updated_at
FROM cco.occurrences
ORDER BY created_at DESC;

COMMENT ON VIEW public.occurrences IS
  'Public proxy view for cco.occurrences. Enables REST API access for dashboards and test validation scripts.';

-- Grant SELECT to anon and authenticated roles
GRANT SELECT ON public.occurrences TO anon, authenticated, service_role;
