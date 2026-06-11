-- RLS Isolation Testing Script
-- Execute this as different roles to verify data isolation

-- ===== SETUP TEST DATA =====
-- Note: Execute these setup queries with service_role permissions

-- 1. Create test users with different roles
INSERT INTO public.usuarios (id, email, nome, role, ativo, unidade, username)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@test.com', 'Admin Test', 'admin', true, 'principal', 'admin_test'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'terapeuta@test.com', 'Terapeuta Test', 'terapeutico', true, 'unidade_a', 'terapeuta_test'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'recepcao@test.com', 'Recepcao Test', 'recepcao', true, 'unidade_a', 'recepcao_test'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'faturamento@test.com', 'Faturamento Test', 'faturamento', true, 'unidade_b', 'faturamento_test')
ON CONFLICT (id) DO NOTHING;

-- 2. Create test authorization records
INSERT INTO public.autorizacoes (paciente_nome, empresa, matricula, dep, status)
VALUES
  ('Paciente Unidade A', 'Empresa 1', 'MAT001', 'TH', 'pendente'),
  ('Paciente Unidade B', 'Empresa 2', 'MAT002', 'RH', 'pendente'),
  ('Paciente Unidade C', 'Empresa 3', 'MAT003', 'TI', 'pendente')
ON CONFLICT DO NOTHING;

-- ===== TEST CASES =====

-- TEST 1: Admin can see all authorizations
-- Expected: 3 records visible
-- Execute as: admin@test.com (id: 00000000-0000-0000-0000-000000000001)
SELECT '=== TEST 1: Admin Visibility ===' AS test;
SELECT COUNT(*) as total_visible FROM public.autorizacoes;

-- TEST 2: Terapeuta can only see therapeutic records
-- Expected: Should see limited records (based on role)
-- Execute as: terapeuta@test.com (id: 00000000-0000-0000-0000-000000000002)
SELECT '=== TEST 2: Terapeuta Visibility ===' AS test;
SELECT COUNT(*) as therapeutic_visible FROM public.autorizacoes;

-- TEST 3: Recepcao can see unit-specific records
-- Expected: Records from unidade_a only
-- Execute as: recepcao@test.com (id: 00000000-0000-0000-0000-000000000003)
SELECT '=== TEST 3: Recepcao Unit Isolation ===' AS test;
SELECT paciente_nome, dep FROM public.autorizacoes;

-- TEST 4: Faturamento can only see their role's data
-- Expected: Should not see admin-only records
-- Execute as: faturamento@test.com (id: 00000000-0000-0000-0000-000000000004)
SELECT '=== TEST 4: Faturamento Visibility ===' AS test;
SELECT COUNT(*) as faturamento_visible FROM public.autorizacoes;

-- TEST 5: Try to insert as non-admin (should fail)
-- Execute as: terapeuta@test.com
SELECT '=== TEST 5: Insert as Terapeuta (should fail) ===' AS test;
INSERT INTO public.autorizacoes (paciente_nome, empresa, status)
VALUES ('Test Paciente', 'Test Empresa', 'pendente');

-- TEST 6: Try to update as non-admin (should fail)
-- Execute as: recepcao@test.com
SELECT '=== TEST 6: Update as Recepcao (should fail) ===' AS test;
UPDATE public.autorizacoes SET status = 'concluido' LIMIT 1;

-- TEST 7: Verify no USING (true) policies remain
-- Execute as: postgres (superuser)
SELECT '=== TEST 7: Verify RLS Hardening ===' AS test;
SELECT tablename, policyname, qual
FROM pg_policies
WHERE
  tablename IN ('autorizacoes', 'chamada_paciente', 'controle_terapeutico',
                'fila_autorizacoes', 'logs', 'sync_controle', 'usuarios')
  AND qual LIKE '%true%'
ORDER BY tablename, policyname;

-- Expected result: 0 rows (all USING (true) removed)

-- TEST 8: Unit isolation - cross-unit access attempt
-- Recepcao from unidade_a tries to see unidade_b data
-- Expected: Fail silently (no records returned)
SELECT '=== TEST 8: Cross-Unit Access Attempt ===' AS test;
SELECT paciente_nome, dep FROM public.autorizacoes WHERE dep = 'RH';

-- TEST 9: Admin override - verify admin can see everything
-- Execute as: admin@test.com
SELECT '=== TEST 9: Admin Override ===' AS test;
SELECT COUNT(*) as admin_total_visible FROM public.autorizacoes;

-- TEST 10: Verify user can view own profile
-- Execute as: terapeuta@test.com
SELECT '=== TEST 10: User Own Profile Access ===' AS test;
SELECT id, email, role, unidade FROM public.usuarios WHERE id = auth.uid();

-- TEST 11: Verify user cannot view other profiles (unless admin)
-- Execute as: recepcao@test.com - trying to see terapeuta's profile
-- Expected: 0 rows
SELECT '=== TEST 11: Cross-User Profile Access (should fail) ===' AS test;
SELECT id, email FROM public.usuarios WHERE email = 'terapeuta@test.com';

-- TEST 12: Check audit logs for RLS access attempts
-- Execute as: admin@test.com
SELECT '=== TEST 12: Audit RLS Access Attempts ===' AS test;
SELECT
  timestamp,
  user_email,
  action,
  table_name,
  status
FROM public.audit_logs
WHERE action LIKE '%RESTRICTED_ACCESS_ATTEMPT%'
ORDER BY timestamp DESC
LIMIT 10;

-- ===== CLEANUP (optional) =====
-- Uncomment to clean up test data
-- DELETE FROM public.usuarios WHERE id IN (
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   '00000000-0000-0000-0000-000000000002'::uuid,
--   '00000000-0000-0000-0000-000000000003'::uuid,
--   '00000000-0000-0000-0000-000000000004'::uuid
-- );
