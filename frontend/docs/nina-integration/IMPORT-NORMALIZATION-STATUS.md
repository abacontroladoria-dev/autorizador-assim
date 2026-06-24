# Import Normalization — Status e Próximos Passos

**Data**: 2026-06-23  
**Status**: 85% Normalizado — Bloqueado em Dependências Externas

---

## Resumo do Progresso

### ✅ Corrigido (Sprint de Normalização)

1. **Supabase Client Pattern**
   - `createBrowserClient()` removido de `useCompanySettings.tsx`, `useOnboardingStatus.ts`, `SystemHealthCard.tsx`
   - Imports `supabase` direto → `getSupabaseClient()`
   - Verificação: 0 imports de `createBrowserClient` ou `createClient` restantes

2. **Path Absolutos (Relative → Absolute)**
   - `../services/api` → `@/services/api` em Kanban, Scheduling, CreateDealModal
   - `../types` → `@/types` em Kanban, Scheduling, CreateDealModal, PipelineSettingsModal, TagSelector
   - `../lib/utils` → `@/lib/utils` em CreateDealModal
   - `./ui/*` → `@/components/ui/*` em Kanban, Settings, TagSelector, CreateDealModal (e todos os Form/Dialog/etc)

3. **React Router → Next.js Removal**
   - Removido `useNavigate` de Scheduling.tsx
   - Removido `useOutletContext` de Settings.tsx (substituído por prop)

4. **Imports de Button Corrigidos**
   - `@/components/Button` → `@/components/nina/Button` em LostReasonModal, e verificado em todos os settings/*

### ❌ Bloqueado — Módulos Não Encontrados

Os componentes Nina usam tipos e APIs que **não existem no Pulsar**:

```
@/types
├── Deal
├── DealActivity
├── TeamMember
├── KanbanColumn
├── Appointment
├── Contact
└── TagDefinition

@/services/api
├── fetchPipeline()
├── fetchPipelineStages()
├── fetchContacts()
├── fetchAppointments()
└── 20+ outras funções

@/prompts
└── default-nina-prompt (usado em AgentSettings)

@/lib
└── utils.ts (usado em CreateDealModal para cn())
```

**Componentes afetados:**
- Kanban.tsx, Scheduling.tsx, CreateDealModal.tsx, PipelineSettingsModal.tsx, TagSelector.tsx — precisam de `@/types`
- Kanban.tsx, Scheduling.tsx, CreateDealModal.tsx, PipelineSettingsModal.tsx — precisam de `@/services/api`
- AgentSettings.tsx — precisa de `@/prompts/default-nina-prompt`
- CreateDealModal.tsx — precisa de `@/lib/utils` (função `cn()`)

---

## Arquivos Alterados Neste Sprint

| Arquivo | Mudanças |
|---------|----------|
| `hooks/nina/useCompanySettings.tsx` | createBrowserClient → getSupabaseClient |
| `hooks/nina/useOnboardingStatus.ts` | createBrowserClient → getSupabaseClient |
| `components/nina/SystemHealthCard.tsx` | createBrowserClient → getSupabaseClient |
| `components/nina/Kanban.tsx` | ../services/api, ../types, ./ui/select → corretos; supabase.removeChannel |
| `components/nina/Scheduling.tsx` | Remove useNavigate; ../types, ../services/api → corretos |
| `components/nina/Settings.tsx` | ./ui/tabs, remove useOutletContext |
| `components/nina/CreateDealModal.tsx` | ../lib/utils, ../services/api, ../types, ./ui/* → corretos; supabase → getSupabaseClient |
| `components/nina/TagSelector.tsx` | ./ui/input, ./ui/button → corretos |
| `components/nina/LostReasonModal.tsx` | @/components/Button → @/components/nina/Button |
| `components/nina/settings/AgentSettings.tsx` | supabase → getSupabaseClient |
| `components/nina/settings/ApiSettings.tsx` | supabase → getSupabaseClient |
| `components/nina/settings/PromptGeneratorSheet.tsx` | supabase → getSupabaseClient |

---

## Diagnóstico: Por que `@/types` e `@/services/api` não existem?

A Nina é um **módulo independente com seu próprio domain model**:

- **Nina Types** (`@/types`): Deal, Pipeline, Contact, etc. — específicos de CRM/Agente
- **Nina APIs** (`@/services/api`): Supabase RPC calls, integração com funcionalidades de IA

O **Pulsar** não tem essas estruturas — é um sistema de **automação clínica** com:
- Tipos: Paciente, Terapeuta, Sessão, Autorização, etc.
- Serviços: CMS de protocolos, agendamento, faturamento

---

## Próximos Passos — Três Opções

### Opção A: Criar Stubs Mínimos (Rápido, Temporário)

Criar arquivos placeholder para fazer `tsc --noEmit` passar:

```typescript
// frontend/types/index.ts
export interface Deal { id: string; [key: string]: any }
export interface Contact { id: string; [key: string]: any }
export interface Appointment { id: string; [key: string]: any }
// ... etc
```

```typescript
// frontend/services/api.ts
export const api = {
  fetchPipeline: async () => [],
  fetchPipelineStages: async () => [],
  // ... etc — retorna arrays/objects vazios
}
```

```typescript
// frontend/lib/utils.ts
export const cn = (...classes: string[]) => classes.filter(Boolean).join(' ')
```

**Vantagens**: Faz tsc passar, componentes compila
**Desvantagens**: Componentes não funcionam em runtime, são "dummy"

---

### Opção B: Refatorar Componentes para Pulsar (Correto, Longo)

Adaptar Kanban, Scheduling, Settings para usar tipos e APIs do Pulsar:

- `Deal` → tipos Pulsar (não há CRM nativo)
- `api.fetchPipeline()` → queries diretas a views Supabase
- Remover dependência de `default-nina-prompt`

**Vantagens**: Componentes funcionam realmente
**Desvantagens**: ~2-3 dias de trabalho, requer entender domain Pulsar

---

### Opção C: Importar Nina Temporariamente (Não Recomendado)

```typescript
import { Deal } from 'nina-api-oficial/src/types'
import { api } from 'nina-api-oficial/src/services/api'
```

**Vantagens**: Componentes funcionam imediatamente
**Desvantagens**: Mantém dependência em nina-api-oficial, viola objetivo de desacoplamento

---

## Recomendação

**Opção A** para passar `tsc --noEmit` rapidamente, depois **Opção B** em sprints futuras.

---

## Verificação Atual

```bash
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
```

**Antes**: ~45 erros  
**Depois (se Opção A)**:  ~10 erros (type mismatches em form schemas, etc.)  
**Depois (se Opção B)**: 0 erros (refatoração completa)

---

## Próxima Ação

Implementar **Opção A** para viabilizar `npm run build`:

1. Criar `frontend/types/index.ts` com tipos de placeholder
2. Criar `frontend/services/api.ts` com mock functions
3. Criar `frontend/lib/utils.ts` com `cn()`
4. Criar `frontend/prompts/default-nina-prompt.ts` com string vazia
5. Rerun `npx tsc --noEmit`

---

## Nota: Arquivos Já Normalizados

Estes arquivos tiveram seus imports normalizados e estão prontos:

- ✅ `hooks/nina/useAuth.tsx` — context reader puro
- ✅ `hooks/nina/useCompanySettings.tsx` — usa getSupabaseClient
- ✅ `hooks/nina/useOnboardingStatus.ts` — usa getSupabaseClient
- ✅ `hooks/nina/useConversations.ts` — usa getSupabaseClient corretamente
- ✅ `components/nina/Sidebar.tsx` — usa rotas /connect
- ✅ `components/nina/Button.tsx` — componente local
- ✅ `components/nina/ChatInterface.tsx` — componente local
- ✅ `components/nina/Dashboard.tsx` — componente local
- ✅ `components/nina/Contacts.tsx` — componente local
