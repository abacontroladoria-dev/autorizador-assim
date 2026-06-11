# RLS Hardening - Sprint 1.5 Validation Guide

## Overview
This document describes the RLS (Row-Level Security) hardening implemented in Sprint 1.5 and provides instructions for validation testing.

## Migration Applied
- **File:** `20260610000011_rls_hardening_rbac_unit_isolation.sql`
- **Changes:**
  - Adds `unidade` column to `usuarios` table
  - Removes all `USING (true)` policies from critical tables
  - Implements role-based access control (RBAC)
  - Implements unit/department-based isolation

## Tables Affected

### 1. **autorizacoes** (Medical Authorizations)
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| admin | ✅ All | ✅ All | ✅ All | ✅ All |
| recepcao | ✅ Own unit | ❌ | ❌ | ❌ |
| terapeutico | ✅ Own role | ❌ | ❌ | ❌ |
| faturamento | ✅ Own role | ❌ | ❌ | ❌ |
| autorizacao | ✅ Own role | ❌ | ❌ | ❌ |
| other | ❌ | ❌ | ❌ | ❌ |

**Key Policy:** Medical data is never visible to unauthenticated users or across role boundaries.

### 2. **chamada_paciente** (Patient Calls)
| Role | SELECT | INSERT | UPDATE |
|------|--------|--------|--------|
| admin | ✅ All | ✅ | ✅ All |
| recepcao | ✅ Own unit | ✅ Own unit | ✅ Own unit |
| diretoria | ✅ All units | ✅ | ✅ |
| other | ❌ | ❌ | ❌ |

**Key Policy:** Unit isolation enforced - recepcao only sees/edits own unit's calls.

### 3. **controle_terapeutico** (Therapeutic Control)
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| admin | ✅ All | ✅ | ✅ | ✅ |
| terapeutico | ✅ | ✅ | ✅ | ❌ |
| terapeuta | ✅ | ✅ | ✅ | ❌ |
| other | ❌ | ❌ | ❌ | ❌ |

**Key Policy:** Only therapeutic roles can view/insert/edit therapeutic control. Terapeutas cannot delete. Non-therapeutic roles cannot see this data.

### 4. **fila_autorizacoes** (Authorization Queue)
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| admin | ✅ All | ✅ | ✅ | ✅ |
| autorizacao | ✅ | ❌ | ✅ | ❌ |
| diretoria | ✅ | ❌ | ✅ | ❌ |
| recepcao | ✅ | ✅ | ✅ | ❌ |
| other | ❌ | ❌ | ❌ | ❌ |

**Key Policy:** Queue accessible by recepcao for reading/writing, but no deletion allowed.

### 5. **logs** (Activity Logs)
| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| admin | ✅ All | ✅ | ✅ | ✅ |
| other | ❌ | ❌ | ❌ | ❌ |

**Key Policy:** Logs are admin-only. System can insert via service role.

### 6. **sync_controle** (Sync Control)
| Role | All Operations |
|------|--------|
| admin | ✅ |
| other | ❌ |

**Key Policy:** Admin-only access for sync operations.

### 7. **usuarios** (User Management)
| Role | SELECT Others | UPDATE Others | UPDATE Own |
|------|--------|--------|--------|
| admin | ✅ All | ✅ All | ✅ |
| other | ❌ | ❌ | ✅ Own profile only |

**Key Policy:** Users can only view/edit their own profile. Admins have full access.

## Testing Instructions

### Prerequisites
1. Have SSH/database access to staging/production
2. Create test users with different roles:
   ```sql
   -- Execute with service_role privileges
   INSERT INTO public.usuarios (id, email, nome, role, ativo, unidade)
   VALUES
     ('test-admin-uuid'::uuid, 'admin@orbit.test', 'Admin', 'admin', true, 'principal'),
     ('test-terapeuta-uuid'::uuid, 'terapeuta@orbit.test', 'Terapeuta', 'terapeutico', true, 'unidade_a'),
     ('test-recepcao-uuid'::uuid, 'recepcao@orbit.test', 'Recepcao', 'recepcao', true, 'unidade_b');
   ```

### Test Case 1: Admin Full Access
**Objective:** Verify admin can see all records across tables and roles

**Steps:**
1. Connect as admin user (id: test-admin-uuid)
2. Execute: `SELECT COUNT(*) FROM public.autorizacoes;`
3. Execute: `SELECT COUNT(*) FROM public.fila_autorizacoes;`

**Expected Result:**
- ✅ Can see all records in all tables
- ✅ No 403 or RLS errors

---

### Test Case 2: Terapeuta Cannot See Admin Data
**Objective:** Verify therapeutic role cannot access administrative data

**Steps:**
1. Connect as terapeuta user (id: test-terapeuta-uuid)
2. Try to read `logs` table: `SELECT COUNT(*) FROM public.logs;`
3. Try to read `sync_controle`: `SELECT COUNT(*) FROM public.sync_controle;`

**Expected Result:**
- ✅ Returns 0 rows (no error, silent RLS block)
- ✅ No access to admin tables

---

### Test Case 3: Unit Isolation - Recepcao Cannot See Other Units
**Objective:** Verify recepcao is isolated to their unit

**Steps:**
1. Create two test records in `chamada_paciente`:
   - Record A: unidade='unidade_a'
   - Record B: unidade='unidade_b'

2. Connect as recepcao from unidade_a
3. Execute: `SELECT unidade FROM public.chamada_paciente;`

**Expected Result:**
- ✅ Only sees 'unidade_a' record
- ✅ Cannot see 'unidade_b' record
- ✅ Cannot see other units

---

### Test Case 4: Data Insertion Authorization
**Objective:** Verify non-admin users cannot insert data into sensitive tables

**Steps:**
1. Connect as recepcao user
2. Try to insert into `autorizacoes`:
   ```sql
   INSERT INTO public.autorizacoes (paciente_nome, status)
   VALUES ('Test', 'pendente');
   ```

**Expected Result:**
- ❌ INSERT fails with RLS policy violation
- No data inserted

---

### Test Case 5: Role-Based Visibility
**Objective:** Verify different roles see different data sets

**Setup:** Create test records:
- `autorizacoes` record with therapeutic data
- `fila_autorizacoes` record with authorization queue
- `controle_terapeutico` record

**Test Steps:**

| User Role | Table | Expected Visibility |
|-----------|-------|-------------------|
| admin | autorizacoes | ✅ Full |
| terapeutico | autorizacoes | ✅ Role-filtered |
| recepcao | autorizacoes | ✅ Unit-filtered |
| recepcao | fila_autorizacoes | ✅ Read-only |
| terapeuta | logs | ❌ 0 rows |
| recepcao | sync_controle | ❌ 0 rows |

---

### Test Case 6: Own Profile Access
**Objective:** Verify users can only view their own profile

**Steps:**
1. Connect as terapeuta user
2. Execute: `SELECT email, role FROM public.usuarios WHERE id = auth.uid();`
3. Execute: `SELECT email, role FROM public.usuarios WHERE email = 'recepcao@orbit.test';`

**Expected Result:**
- ✅ Test 2: Returns own profile
- ❌ Test 3: Returns 0 rows (cannot see other profiles)

---

### Test Case 7: Verify No USING (true) Policies Remain
**Objective:** Confirm all permissive `USING (true)` policies are removed

**Steps (admin only):**
```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE
  tablename IN (
    'autorizacoes',
    'chamada_paciente',
    'controle_terapeutico',
    'fila_autorizacoes',
    'logs',
    'sync_controle',
    'usuarios'
  )
  AND qual LIKE '%true%'
ORDER BY tablename, policyname;
```

**Expected Result:**
- ✅ 0 rows returned
- All old permissive policies are replaced with role-based policies

---

## Rollback Plan

If issues occur, rollback is available via:

```bash
# Revert to previous RLS state
supabase migration down
```

Then re-apply with fixes.

## Monitoring

After deployment, monitor for:
1. **RLS Violations:** Check `audit_logs` table for `*_RESTRICTED_ACCESS_ATTEMPT` actions
2. **Access Failures:** Monitor application logs for 403 Forbidden errors
3. **Performance:** Check query performance - RLS policies may add overhead

---

## Security Validation Checklist

- [ ] No `USING (true)` policies remain in critical tables
- [ ] Admin can access all data
- [ ] Terapeuta cannot see admin tables (logs, sync_controle)
- [ ] Recepcao cannot see other units' data
- [ ] Non-admin cannot insert/update/delete sensitive data
- [ ] Users can only view their own profile
- [ ] Cross-role access is blocked silently (no data returned)
- [ ] Audit logs capture access attempts

---

## FAQ

**Q: Why does a non-authorized SELECT return 0 rows instead of an error?**
A: This is RLS best practice - no error messages about existence of restricted data. Attackers cannot enumerate data.

**Q: Can an admin see all data?**
A: Yes, admins bypass unit isolation. This is intentional for management/audit purposes.

**Q: How do users change units?**
A: Only admins can update the `unidade` column on usuario records. No self-service unit changes.

**Q: What about API access via service role?**
A: Service role bypasses RLS entirely. Ensure service role is NEVER exposed in frontend code.
