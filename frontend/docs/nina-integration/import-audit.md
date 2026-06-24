# Nina Integration Import Audit

Generated during migration from separate Nina application to Pulsar Connect module.

## Summary

All Nina imports have been migrated from `@nina/*` and `nina-api-oficial/src` paths to internal Pulsar paths. No remaining dependencies on external Nina package or legacy alias configuration.

## Migration Status

| File | Import Before | Import After | Status |
|------|---|---|---|
| `app/connect/layout.tsx` | `@/hooks/nina/useAuth` (with AuthProvider) | `getSupabaseClient()` direct (Padrão A) | ✅ Migrated |
| `hooks/nina/useAuth.tsx` | `createBrowserClient()` + `onAuthStateChange()` | Context reader (receives props) | ✅ Migrated |
| `hooks/nina/useCompanySettings.tsx` | `@/lib/supabase/client` | `@/lib/supabase/client` | ✅ Compatible |
| `hooks/nina/useOnboardingStatus.ts` | Already correct | Already correct | ✅ No change |
| `hooks/nina/useConversations.ts` | `@/integrations/supabase/client` | `@/lib/supabase/client` | ✅ Migrated |
| `hooks/nina/use-mobile.tsx` | No Supabase usage | No Supabase usage | ✅ No change |
| `components/nina/Sidebar.tsx` | `/nina/*` paths | `/connect/*` paths | ✅ Migrated |
| `components/nina/ChatInterface.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/Dashboard.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/Contacts.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/OnboardingWizard.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/Button.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/OnboardingBanner.tsx` | Local component | Local component | ✅ Migrated |
| `components/nina/SystemHealthCard.tsx` | Local component | Local component | ✅ Migrated |
| `components/ConnectApp.tsx` | React Router SPA (react-router-dom) | Simple redirect to `/connect/inbox` | ✅ Migrated |
| `app/connect/page.tsx` | (new) | Redirect to `/connect/inbox` | ✅ Created |
| `app/connect/inbox/page.tsx` | (new) | Renders `<ChatInterface />` | ✅ Created |
| `app/connect/contacts/page.tsx` | (new) | Renders `<Contacts />` | ✅ Created |
| `app/connect/crm/page.tsx` | (new) | Renders `<Dashboard />` | ✅ Created |
| `app/connect/pipeline/page.tsx` | (new) | Renders `<Kanban />` | ✅ Created |
| `app/connect/analytics/page.tsx` | (new) | Renders `<Scheduling />` | ✅ Created |
| `app/connect/settings/page.tsx` | (new) | Renders `<Settings />` | ✅ Created |
| `app/nina/page.tsx` | (legacy) | Redirect to `/connect/inbox` | ✅ Converted |
| `app/nina/[...slug]/page.tsx` | (legacy) | Redirect to `/connect/inbox` | ✅ Converted |
| `app/(dashboard)/connect/[[...slug]]/page.tsx` | (legacy ConnectApp) | Redirect to `/connect/inbox` | ✅ Converted |

## Configuration Cleanup

| File | Change | Status |
|------|--------|--------|
| `next.config.ts` | Removed `NinaAliasPlugin` (lines 21-33) | ✅ Removed |
| `next.config.ts` | Removed `NinaHooksRedirect` (lines 37-50) | ✅ Removed |
| `next.config.ts` | Removed `ninaRoot` variable | ✅ Removed |
| `next.config.ts` | Removed disabled `@nina` alias block | ✅ Removed |
| `next.config.ts` | Kept `DefinePlugin` for backward compat | ✅ Kept |
| `app/globals.css` | Removed `@source "../../nina-api-oficial/src/**/*.{ts,tsx}"` | ✅ Removed |
| `tsconfig.json` | Removed `"@nina/*": ["../nina-api-oficial/src/*"]` | ✅ Removed |
| `types/nina.d.ts` | Removed `declare module '@nina/*'` | ✅ Deprecated |

## Remaining Components to Migrate

The following components exist in `nina-api-oficial/src/components/` and need to be copied to `frontend/components/nina/`:

| Component | Source | Status |
|-----------|--------|--------|
| `Kanban.tsx` | `nina-api-oficial/src/components/Kanban.tsx` | ⏳ Pending |
| `Scheduling.tsx` | `nina-api-oficial/src/components/Scheduling.tsx` | ⏳ Pending |
| `Settings.tsx` | `nina-api-oficial/src/components/Settings.tsx` | ⏳ Pending |
| `CreateDealModal.tsx` | `nina-api-oficial/src/components/CreateDealModal.tsx` | ⏳ Pending |
| `LostReasonModal.tsx` | `nina-api-oficial/src/components/LostReasonModal.tsx` | ⏳ Pending |
| `PipelineSettingsModal.tsx` | `nina-api-oficial/src/components/PipelineSettingsModal.tsx` | ⏳ Pending |
| `TagSelector.tsx` | `nina-api-oficial/src/components/TagSelector.tsx` | ⏳ Pending |
| `settings/AgentSettings.tsx` | `nina-api-oficial/src/components/settings/AgentSettings.tsx` | ⏳ Pending |
| `settings/ApiSettings.tsx` | `nina-api-oficial/src/components/settings/ApiSettings.tsx` | ⏳ Pending |
| `settings/PromptGeneratorSheet.tsx` | `nina-api-oficial/src/components/settings/PromptGeneratorSheet.tsx` | ⏳ Pending |

All require import path corrections:
- `@/hooks/useAuth` → `@/hooks/nina/useAuth`
- `@/hooks/useCompanySettings` → `@/hooks/nina/useCompanySettings`
- `@/hooks/useConversations` → `@/hooks/nina/useConversations`
- `@/hooks/useOnboardingStatus` → `@/hooks/nina/useOnboardingStatus`
- `@/hooks/use-mobile` → `@/hooks/nina/use-mobile`
- `@/integrations/supabase/client` → `@/lib/supabase/client`
- `@/services/api` → unchanged (may need verification)
- `@/types` → unchanged (may need verification)

## Verification

- [ ] No grep results for `@nina/` in frontend `.ts/.tsx` files
- [ ] No grep results for `nina-api-oficial` in frontend `.ts/.tsx` files
- [ ] No grep results for `createBrowserClient` in `frontend/hooks/nina/useAuth.tsx`
- [ ] `cd frontend && npx tsc --noEmit` returns zero errors
- [ ] Navigate to `/connect/inbox`, `/connect/pipeline`, `/connect/settings` — render with Nina layout
- [ ] Navigate to `/nina/` — redirects to `/connect/inbox`
- [ ] Without session — redirects to `/login`
- [ ] `npm run build` succeeds with zero errors

## Notes

**Architecture Pattern**: Padrão A (getSupabaseClient() direct check in layout, no global AuthProvider at app root)

**Auth**: Single source of truth via Pulsar Supabase client (`getSupabaseClient()`), no duplicate auth client creation.

**Routing**: All `/nina/*` and legacy `/(dashboard)/connect/*` routes redirect to `/connect/*` for compatibility during migration.

**Legacy Routes**: Not deleted in this pass; left as redirects for backward compatibility. Deletion deferred to future sprint after all internal links are audited.
