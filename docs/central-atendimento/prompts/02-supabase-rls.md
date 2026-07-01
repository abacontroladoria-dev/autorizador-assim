# Prompt — Supabase RLS

Leia:

docs/central-atendimento/16-supabase-rls.md

docs/central-atendimento/03-user-roles-and-permissions.md

Sua missão é implementar todas as políticas RLS.

Objetivos:

- Garantir isolamento por organization_id.
- Garantir isolamento por inbox.
- Garantir isolamento por role.
- Garantir compatibilidade com Realtime.

Tarefas:

1. Verificar JWT atual.
2. Identificar como organization_id é obtido.
3. Criar helper functions.
4. Criar policies.
5. Validar queries existentes.
6. Validar realtime subscriptions.

Executar testes:

- Admin
- Diretor
- Supervisor
- Operador
- Multiempresa

Não modificar regras de negócio.

Entregáveis:

- SQL das policies.
- Testes executados.
- Possíveis impactos.

Ao final apresente:

"Ready for review"