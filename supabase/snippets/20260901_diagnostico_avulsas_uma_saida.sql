-- =============================================================================
-- Diagnóstico das avulsas — UMA consulta só, uma saída só
-- =============================================================================
-- O SQL Editor mostra apenas o resultado do ÚLTIMO comando quando se roda vários
-- de uma vez — foi por isso que o diagnóstico anterior (8 comandos) voltou só o
-- bloco 7. Aqui tudo é um único SELECT com UNION ALL: uma linha por verificação,
-- na coluna `resultado`.
--
-- SÓ LÊ. Nada escreve. Rodar inteiro e mandar a saída completa.
--
-- COMO LER: a coluna `veredito` já traduz. Interessa acima de tudo:
--   3.RPC listar_pacientes_assim / listar_terapias_tuss  -> alimentam a tela
--   6.GRANT vw_central_pacientes                         -> se FALTA, /central-pacientes está 403 AGORA

SELECT * FROM (

  -- 1. colunas do bloco 1 -----------------------------------------------------
  SELECT '1.coluna avulsa' AS verificacao,
         count(*)::text    AS resultado,
         CASE WHEN count(*) = 2 THEN 'OK (avulsa + motivo_avulsa)'
              ELSE 'FALTA — esperado 2' END AS veredito,
         1 AS ord
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'fila_autorizacoes'
    AND column_name IN ('avulsa', 'motivo_avulsa')

  UNION ALL
  -- 2. índice parcial ---------------------------------------------------------
  SELECT '2.indice idx_fila_avulsa', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'OK' ELSE 'FALTA' END, 2
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'fila_autorizacoes'
    AND indexname = 'idx_fila_avulsa'

  UNION ALL
  -- 3. AS DUAS RPCs DA TELA (decisivo) ----------------------------------------
  SELECT '3.RPC ' || p.proname, 'existe',
         CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
              THEN 'OK — authenticated pode executar'
              ELSE 'SEM GRANT — a tela toma 42501' END, 3
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('listar_pacientes_assim', 'listar_terapias_tuss')

  UNION ALL
  -- 3b. flagra a RPC AUSENTE (o UNION acima não produz linha para o que não existe)
  SELECT '3b.RPCs da tela encontradas', count(*)::text,
         CASE WHEN count(*) = 2 THEN 'OK — as duas existem'
              ELSE 'FALTA(M) — esperado 2; comboboxes ficam vazios' END, 4
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('listar_pacientes_assim', 'listar_terapias_tuss')

  UNION ALL
  -- 4. catálogo de permissão --------------------------------------------------
  SELECT '4.permissoes autorizacoes_avulsas', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'OK'
              ELSE 'FALTA — /admin/permissoes não lista a tela' END, 5
  FROM public.permissoes
  WHERE codigo = 'autorizacoes_avulsas'

  UNION ALL
  -- 5. a view conhece a avulsa? ----------------------------------------------
  SELECT '5.view filtra avulsa',
         (position('avulsa' in pg_get_viewdef('public.vw_central_pacientes'::regclass)) > 0)::text,
         CASE WHEN position('avulsa' in pg_get_viewdef('public.vw_central_pacientes'::regclass)) > 0
              THEN 'OK — bloco 4 aplicado'
              ELSE 'NAO — bloco 4 nao entrou' END, 6

  UNION ALL
  SELECT '5b.view mantem origem da guia',
         (position('numero_autorizacao_origem' in pg_get_viewdef('public.vw_central_pacientes'::regclass)) > 0)::text,
         CASE WHEN position('numero_autorizacao_origem' in pg_get_viewdef('public.vw_central_pacientes'::regclass)) > 0
              THEN 'OK — dependencia 20260825010000 viva'
              ELSE 'PERDIDA — Ficha Operacional sem origem' END, 7

  UNION ALL
  -- 6. GRANTS DA VIEW (o mais perigoso) --------------------------------------
  SELECT '6.GRANT vw_central_pacientes', count(*)::text,
         CASE WHEN count(*) >= 2 THEN 'OK — ' || string_agg(grantee, ', ')
              ELSE 'VAZIO/PARCIAL — /central-pacientes responde 403' END, 8
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'vw_central_pacientes'
    AND privilege_type = 'SELECT'

  UNION ALL
  -- 7. livro-caixa ------------------------------------------------------------
  SELECT '7.livro-caixa 20260825130000', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'REGISTRADA' ELSE 'AUSENTE' END, 9
  FROM supabase_migrations.schema_migrations WHERE version = '20260825130000'

  UNION ALL
  SELECT '7b.livro-caixa 20260825140000', count(*)::text,
         CASE WHEN count(*) = 1 THEN 'REGISTRADA' ELSE 'AUSENTE' END, 10
  FROM supabase_migrations.schema_migrations WHERE version = '20260825140000'

) t ORDER BY ord, verificacao;
