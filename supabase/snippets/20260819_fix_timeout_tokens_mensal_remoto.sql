-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Idêntico a supabase/migrations/20260819140000_fix_timeout_tokens_mensal.sql
--
-- Depois de rodar, registrar no livro-caixa (bloco final deste arquivo).

-- =============================================================================
-- 20260819140000_fix_timeout_tokens_mensal.sql
-- =============================================================================

ALTER FUNCTION public.get_tokens_mensal(date) SET statement_timeout = '30s';

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260819140000', 'fix_timeout_tokens_mensal')
ON CONFLICT (version) DO NOTHING;
