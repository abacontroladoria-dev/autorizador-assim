# Mudanças — Substituição de Terapeutas + Correção de Auth

## 1. Mostrar todos os profissionais com a mesma terapia (livres e agendados)

**`frontend-autorizador/services/controle-terapeutico.service.ts`**
- Removido filtro `.eq('status_agendamento', 'Livre')` da função `listarProfissionaisDisponiveis`
- Agora retorna todos os profissionais com a mesma `terapia_exibicao` do dia, independente de status

**`frontend-autorizador/components/central-terapeutas/ControleTerapeutaMobileCard.tsx`**
- Removido filtro de horário na chamada de `listarProfissionaisDisponiveis` (passado `undefined` para horaInicial/horaFinal)
- Agora mostra todos os profissionais do dia, não só os que cobrem o mesmo horário
- Adicionado campo `status_agendamento` ao tipo `ProfissionalDisponivel`
- Adicionado campos `paciente_nome` e `nome_paciente` ao tipo `ProfissionalDisponivel`
- Modal de substituição exibe: nome do terapeuta + badge (Livre/Agendado), nome do paciente (se ocupado), sala
- Mensagem de lista vazia atualizada para "Nenhum profissional com essa terapia encontrado"

---

## 2. Correção de autenticação (token 401)

**Causa raiz:** `output: export` desabilita middleware/proxy no Next.js, impedindo renovação de tokens. O `createBrowserClient` (SSR/cookies) depende do servidor para renovar sessões — incompatível com static export.

**`frontend-autorizador/lib/supabase/client.ts`**
- Trocado `createBrowserClient` (de `@supabase/ssr`) por `createClient` (de `@supabase/supabase-js`)
- O `createClient` padrão usa localStorage com auto-refresh de token em background — funciona em sites estáticos

**`frontend-autorizador/next.config.ts`**
- Mantido `output: 'export'` (static export)
- Removido temporariamente e restaurado durante o diagnóstico

**`frontend-autorizador/middleware.ts` → `frontend-autorizador/_middleware.ts`**
- Renomeado com underscore para desativar (Next.js ignora arquivos com `_`)
- Com `output: export`, middleware não funciona de qualquer forma

**`frontend-autorizador/proxy.ts`** (removido)
- Arquivo criado durante diagnóstico e depois removido — desnecessário em static export

**`frontend-autorizador/lib/supabase/functions.ts`**
- Adicionado fallback `refreshSession()` caso `getSession()` retorne null
- Removido fallback de API route `/api/auth/token` (não funciona em static export)

---

## 3. Arquivos criados (não usados em produção static)

Os arquivos abaixo foram criados durante o diagnóstico e podem ser ignorados ou removidos:

- `frontend-autorizador/app/api/auth/token/route.ts`
- `frontend-autorizador/app/api/controle-terapeutico/upsert/route.ts`

> API routes do Next.js não são incluídas no `output: export`. Esses arquivos não afetam o build.

---

## Deploy

```bash
cd frontend-autorizador
npm run build   # gera a pasta /out
```

Copiar o conteúdo de `/out` para o servidor estático (Apache/Nginx).
