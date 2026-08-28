# Prompt — Supabase Migrations

Você está trabalhando no projeto Pulsar.

Antes de executar qualquer alteração, leia integralmente os documentos:

docs/central-atendimento/04-data-model.md

docs/central-atendimento/15-database-migrations.md

docs/central-atendimento/13-audit-and-compliance.md

Sua missão é implementar todas as migrations da Central de Atendimento.

Objetivos:

- Não alterar a arquitetura definida.
- Não remover campos existentes.
- Não simplificar tabelas.
- Não criar tabelas fora do padrão definido.

Tarefas:

1. Identificar estrutura atual do banco.
2. Verificar tabelas já existentes que possam ser reutilizadas.
3. Gerar migrations incrementais.
4. Criar todos os enums definidos.
5. Criar todas as tabelas definidas.
6. Criar foreign keys.
7. Criar índices.
8. Criar triggers updated_at.
9. Habilitar Realtime nas tabelas necessárias.
10. Validar integridade referencial.

Regras:

- Não executar DROP TABLE.
- Não executar ALTER destrutivo.
- Não quebrar funcionalidades existentes do Pulsar.
- Caso encontre conflito, documente antes de alterar.

Entregáveis:

1. Lista das migrations criadas.
2. SQL completo.
3. Dependências encontradas.
4. Possíveis conflitos.
5. Plano de rollback.

Ao final apresente:

"Ready for review"