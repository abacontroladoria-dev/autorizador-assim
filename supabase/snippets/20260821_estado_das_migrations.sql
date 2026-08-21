-- ===========================================================================
-- O que das migrations 060000 / 070000 / 080000 já está no banco
-- ===========================================================================
--
-- POR QUE ISTO EXISTE. As três nasceram no mesmo dia e duas delas recriam a
-- MESMA função (`sync_assim_results`): a 070000 põe a guarda de guia duplicada,
-- e a 080000 parte dessa versão e acrescenta a cópia do `biofacial`. Aplicar
-- fora de ordem não dá erro — dá silêncio:
--
--   * 080000 sem 070000  → `sync_assim_results` chama
--     `guia_ja_usada_por_outra_linha`, que não existe. O corpo plpgsql só é
--     resolvido em tempo de execução, então a função é CRIADA sem reclamar e
--     falha depois, a cada rodada do cron. O sync para de reconciliar, calado.
--
--   * 070000 DEPOIS de 080000 → o CREATE OR REPLACE da 070000 substitui a
--     função e REMOVE a cópia do biofacial. Sem erro nenhum; a coluna
--     simplesmente para de ser preenchida.
--
-- Rode isto antes de aplicar qualquer coisa. Somente leitura.

WITH def AS (
  SELECT
    (SELECT pg_get_functiondef(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'listar_central_autorizacoes'
      LIMIT 1)                                              AS listar,
    (SELECT pg_get_functiondef(p.oid)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sync_assim_results'
      LIMIT 1)                                              AS sync
)
SELECT * FROM (
  VALUES
    ('060000 · ultima_autorizacao_anterior olha o dia inteiro',
     (SELECT listar LIKE '%<> b.horario%' FROM def)),

    ('070000 · funcao guia_ja_usada_por_outra_linha existe',
     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'guia_ja_usada_por_outra_linha')),

    ('070000 · view vw_guias_duplicadas existe',
     EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'vw_guias_duplicadas')),

    ('070000 · view vw_conflitos_guia existe',
     EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'vw_conflitos_guia')),

    ('080000 · colunas biofacial_assim / forma_autorizacao_origem existem',
     (SELECT count(*) = 2 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'fila_autorizacoes'
         AND column_name IN ('biofacial_assim', 'forma_autorizacao_origem'))),

    ('080000 · funcao forma_validacao_do_biofacial existe',
     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'forma_validacao_do_biofacial')),

    ('080000 · view vw_forma_validacao_divergencias existe',
     EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'vw_forma_validacao_divergencias')),

    -- AS DUAS LINHAS QUE DECIDEM A ORDEM. Ambas têm de ficar TRUE no fim.
    ('sync ATIVO chama a guarda de guia duplicada (070000 viva)',
     (SELECT sync LIKE '%guia_ja_usada_por_outra_linha%' FROM def)),

    ('sync ATIVO copia o biofacial (080000 viva)',
     (SELECT sync LIKE '%biofacial_assim%' FROM def))
) AS t(item, aplicado)
ORDER BY item;
