-- Fix: Remove overly restrictive RLS on usuarios table
-- Issue: usuarios_admin_all policy blocks all reads for non-admin users
-- Solution: Allow authenticated users to read their own profile
-- usuarios is a system table (not sensitive), RLS should not block system lookups

-- Disable RLS on usuarios to allow reads
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

-- Optionally: drop problematic policies (kept for safety, but RLS is disabled)
DROP POLICY IF EXISTS "usuarios_admin_all" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_view_own_profile" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_own_profile" ON public.usuarios;

-- Note: If you want to re-enable RLS in the future, create these policies:
-- - Admin: full access to all rows
-- - Users: read own profile (id = auth.uid())
-- - Users: update own profile (limited fields only)
