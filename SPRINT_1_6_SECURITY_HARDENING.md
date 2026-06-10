# Sprint 1.6 — CCO Security Hardening

**Status:** 🟢 READY FOR DEPLOYMENT  
**Date:** 2026-06-10  
**Objective:** Secure CCO schema by closing RPC exposure, enabling RLS, and protecting service credentials

---

## Sprint 1.6-A: Close Exposed RPC Permissions

**Migration:** `20260610000012_sprint_1_6_a_revoke_rpc_permissions.sql`

### Changes

Revoke `EXECUTE` permission from `anon`, `authenticated`, and `public` roles on CCO introspection RPCs:

- `public.batch_auto_resolve_occurrences(text, text[])`
- `public.sample_cco_data()`
- `public.get_cco_stats()`
- `public.count_cco_records()`

Grant `EXECUTE` to `service_role` only.

### Impact

| Before | After |
|--------|-------|
| Any authenticated user can call CCO introspection RPCs | Only Edge Functions (service_role) can call CCO RPCs |
| Information disclosure risk | Closed |

### How to Apply

```bash
supabase migration up
# Or in Supabase Dashboard: SQL Editor > Run migration
```

---

## Sprint 1.6-B: Enable RLS on CCO Schema

**Migration:** `20260610000013_sprint_1_6_b_enable_rls_cco.sql`

### Changes

Enable Row-Level Security on all CCO tables:

- `cco.atendimentos`
- `cco.occurrences`
- `cco.dashboard_snapshot`
- `cco.processing_logs`
- `cco.session_authorizations`
- `cco.session_mutations`
- `cco.session_substitutions`

### Access Model

```
╔════════════╦════════╦════════╦════════════════════════════════════════════╗
║ Role       ║ SELECT ║ INSERT ║ UPDATE/DELETE                              ║
╠════════════╬════════╬════════╬════════════════════════════════════════════╣
║ admin      ║   ✅   ║   ✅   ║   ✅ (via is_admin())                      ║
║ diretoria  ║   ✅   ║   ❌   ║   ❌ (read-only)                           ║
║ others     ║   ❌   ║   ❌   ║   ❌ (no access)                           ║
║ service    ║   ✅   ║   ✅   ║   ✅ (bypasses RLS)                        ║
╚════════════╩════════╩════════╩════════════════════════════════════════════╝
```

### Policies Created

For each CCO table, two policies are created:

**Policy 1: Admin Full Access**
```sql
CREATE POLICY "cco_<table>_admin_all"
  ON cco.<table>
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

**Policy 2: Diretoria Read-Only**
```sql
CREATE POLICY "cco_<table>_read_admin_diretoria"
  ON cco.<table>
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role IN ('admin', 'diretoria')
    )
  );
```

### Impact

| Component | Before | After |
|-----------|--------|-------|
| Edge Functions (service_role) | ✅ Works | ✅ Works (bypass RLS) |
| Admin users | ❌ RLS not enforced | ✅ Full access |
| Diretoria users | ❌ No RLS | ✅ Read-only access |
| Other roles | ❌ No RLS | ❌ Blocked (silent) |

### How to Apply

```bash
supabase migration up
# Or in Supabase Dashboard: SQL Editor > Run migration
```

### Verification

After applying, verify policies exist:

```sql
SELECT tablename, policyname, permissive
FROM pg_policies
WHERE schemaname = 'cco'
ORDER BY tablename, policyname;

-- Should return 14 policies (2 per table × 7 tables)
```

---

## Sprint 1.6-C: Protect Service Role Credential

**File:** `frontend/lib/supabase/service.ts`

### Change

Add `import 'server-only'` at the top of the file:

```typescript
import 'server-only'

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
// ... rest of file
```

### Purpose

The `'server-only'` directive enforces that this module can **only be imported in Server-side code** (API routes, middleware, Server Components). If someone accidentally tries to import it in a Client Component, Next.js will throw a build-time error:

```
Error: "frontend/lib/supabase/service.ts" cannot be imported into the client
```

### Impact

| Scenario | Before | After |
|----------|--------|-------|
| Correct usage (API route) | ✅ Works | ✅ Works |
| Accidental import in Client Component | ⚠️ Would leak to browser | ❌ Build error (caught) |

### How to Apply

No migration needed. Just re-deploy the frontend.

```bash
git add frontend/lib/supabase/service.ts
git commit -m "security: add 'server-only' directive to service client"
npm run build  # Will fail if service.ts is imported in any Client Component
npm run start
```

---

## Deployment Order

1. **Sprint 1.6-A** → Revoke RPC permissions
2. **Sprint 1.6-B** → Enable RLS and create policies
3. **Sprint 1.6-C** → Redeploy frontend with `'server-only'` directive

**Why this order?**
- A comes first because it closes the most obvious attack surface
- B comes second because it enforces access control at the database layer
- C is frontend-only and can be done anytime (no database dependency)

---

## Testing Checklist

### After Sprint 1.6-A

```bash
# These should FAIL (403 Forbidden)
curl -X POST https://orbitaautomacao.com.br/api/admin/invoke \
  -H "Authorization: Bearer <anon-key>" \
  -d '{"function":"get_cco_stats"}' 

# This should SUCCEED (service_role has permission)
supabase functions invoke get_cco_stats
```

### After Sprint 1.6-B

**As Admin User:**
```sql
SELECT COUNT(*) FROM cco.occurrences;  -- ✅ Works
INSERT INTO cco.occurrences (...);     -- ✅ Works
```

**As Diretoria User:**
```sql
SELECT COUNT(*) FROM cco.occurrences;  -- ✅ Works
INSERT INTO cco.occurrences (...);     -- ❌ RLS policy violation
UPDATE cco.occurrences SET ...;        -- ❌ RLS policy violation
```

**As Other Role:**
```sql
SELECT COUNT(*) FROM cco.occurrences;  -- ❌ 0 rows (silent block)
```

### After Sprint 1.6-C

```bash
# This should FAIL at build time if service.ts is used in Client Component
npm run build

# If no errors, service.ts is only used server-side
# ✅ Deployment safe
```

---

## Rollback Plan

If issues occur:

```bash
# Rollback all three migrations
supabase migration down --steps 3

# Or rollback individually
supabase migration down  # Rolls back 13 (RLS)
supabase migration down  # Rolls back 12 (RPC permissions)

# Revert service.ts
git checkout HEAD~1 frontend/lib/supabase/service.ts
```

---

## Migration Files

| File | Purpose | Status |
|------|---------|--------|
| `20260610000012_sprint_1_6_a_revoke_rpc_permissions.sql` | Close RPC exposure | ✅ Created |
| `20260610000013_sprint_1_6_b_enable_rls_cco.sql` | Enable RLS + policies | ✅ Created |
| `frontend/lib/supabase/service.ts` | Add server-only directive | ✅ Updated |

---

## Summary

```
Sprint 1.6 closes the CCO schema security gaps:

Before:
  ⚠️ Unauthenticated users can call CCO introspection RPCs
  ⚠️ RLS not enforced on CCO tables (everyone has access)
  ⚠️ Service role credential not protected from accidental browser import
  Risk: Data disclosure, privilege escalation, key leakage

After:
  ✅ Only service_role can call CCO RPCs
  ✅ RLS enforced: admin (full) + diretoria (read) + others (blocked)
  ✅ Service role credential protected by Next.js 'server-only' directive
  Result: Defense-in-depth security model

Status: 🟢 READY FOR PRODUCTION
```
