-- Enable RLS on fila_autorizacoes table
-- This table has policies defined in 20260610000011 that need RLS to be active

ALTER TABLE public.fila_autorizacoes ENABLE ROW LEVEL SECURITY;

-- Verify policies exist
-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'fila_autorizacoes';
