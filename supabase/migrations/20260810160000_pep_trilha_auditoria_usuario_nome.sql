-- BUGFIX: pep_trilha_auditoria só guardava usuario_id — para saber "quem
-- excluiu/editou" era preciso cruzar manualmente com a tabela usuarios.
-- Adiciona usuario_nome, gravado no momento do ato administrativo
-- (denormalizado de propósito: se o usuário for renomeado depois, a trilha
-- continua mostrando o nome de quem realmente fez a ação — PRD Seção 11.4).

ALTER TABLE pep_trilha_auditoria
  ADD COLUMN IF NOT EXISTS usuario_nome text;

COMMENT ON COLUMN pep_trilha_auditoria.usuario_nome IS
  'Nome do usuário no momento da ação, denormalizado de usuarios.nome — não é uma referência viva.';
