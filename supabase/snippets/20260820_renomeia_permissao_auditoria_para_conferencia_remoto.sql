-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Idêntico a supabase/migrations/20260820120000_renomeia_permissao_auditoria_para_conferencia.sql
--
-- Só troca o RÓTULO exibido em /admin/permissoes. `codigo` e `rota` seguem
-- iguais — mexer neles quebraria a permissão de quem já tem acesso.
--
-- Depois de rodar, registrar no livro-caixa (bloco final deste arquivo).

-- =============================================================================
-- 20260820120000_renomeia_permissao_auditoria_para_conferencia.sql
-- =============================================================================

UPDATE public.permissoes
   SET nome      = 'Conferência ASSIM',
       descricao = 'Conferência de guias ASSIM'
 WHERE codigo = 'auditoria_assim';

-- Conferência: deve devolver 1 linha, com o nome novo e a rota intacta.
SELECT codigo, nome, descricao, rota, grupo
  FROM public.permissoes
 WHERE codigo = 'auditoria_assim';

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260820120000', 'renomeia_permissao_auditoria_para_conferencia')
ON CONFLICT (version) DO NOTHING;
