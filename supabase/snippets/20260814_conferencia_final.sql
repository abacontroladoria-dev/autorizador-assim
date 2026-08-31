-- =============================================================================
-- CONFERÊNCIA FINAL — rode INTEIRO no SQL Editor, é tudo read-only
-- =============================================================================
-- Uma linha por verificação. Leia só a coluna `veredito`: qualquer "FALHOU"
-- ou "ATENCAO" diz exatamente o que ficou para trás.
--
-- O que esta consulta NÃO consegue ver (confira à mão):
--   Fase 4 — deploy da Edge Function automation-release-stuck
--   Fase 5 — push do frontend e redeploy manual no Coolify
-- =============================================================================

WITH checagens AS (

  -- FASE 2 ────────────────────────────────────────────────────────────────────
  SELECT 1 AS ord, 'Fase 2' AS fase,
         'robo_concluir_tarefa aceita glosa (8 args, sem duplicata)' AS item,
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'robo_concluir_tarefa')::text AS medido,
         '1' AS esperado
  UNION ALL
  SELECT 2, 'Fase 2',
         'robo_concluir_tarefa tem p_status_assim',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'robo_concluir_tarefa'
              AND pg_get_function_identity_arguments(p.oid) LIKE '%p_status_assim%'
         ) THEN 'sim' ELSE 'nao' END, 'sim'
  UNION ALL
  SELECT 3, 'Fase 2',
         'sync_assim_results com a guarda de 30 min',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'sync_assim_results'
              AND p.prosrc LIKE '%30 minutes%'
         ) THEN 'sim' ELSE 'nao' END, 'sim'
  UNION ALL
  SELECT 4, 'Fase 2',
         'listar_central_autorizacoes devolve criado_por',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'listar_central_autorizacoes'
              AND pg_get_function_result(p.oid) LIKE '%criado_por text)'
         ) THEN 'sim' ELSE 'nao' END, 'sim'
  UNION ALL
  SELECT 5, 'Fase 2',
         'livro-caixa com as 5 migrations',
         (SELECT count(*)::text FROM supabase_migrations.schema_migrations
           WHERE version IN ('20260813130000','20260813130100','20260813130200',
                             '20260814120000','20260814130000')), '5'

  -- FASE 1 + 3 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 6, 'Fase 3',
         'fila envenenada (pendente/processando COM guia)',
         (SELECT count(*)::text FROM public.fila_autorizacoes
           WHERE status IN ('pendente','processando') AND numero_autorizacao IS NOT NULL), '0'
  UNION ALL
  SELECT 7, 'Fase 1',
         'sobrou linha reaberta de DIA PASSADO na fila',
         (SELECT count(*)::text FROM public.fila_autorizacoes
           WHERE status = 'pendente' AND started_at IS NOT NULL
             AND data_atendimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date), '0'

  -- FASE 6 ────────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 8, 'Fase 6',
         'pacote 1.1.6 publicado para a frota',
         COALESCE((SELECT CASE WHEN publicado THEN 'sim' ELSE 'gerado, NAO publicado' END
                     FROM public.robo_pacotes WHERE versao = '1.1.6'), 'nao existe'), 'sim'

  -- FASE 7 ────────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 9, 'Fase 7',
         'maquinas religadas',
         (SELECT count(*) FILTER (WHERE ativa)::text || ' de ' || count(*)::text
            FROM public.maquinas),
         (SELECT count(*)::text || ' de ' || count(*)::text FROM public.maquinas)
)
SELECT
  fase, item, esperado, medido,
  CASE WHEN medido = esperado THEN 'ok' ELSE '*** FALHOU ***' END AS veredito
FROM checagens
ORDER BY ord;


-- ── Detalhe: o que a frota está rodando de fato ──────────────────────────────
-- app_version só vira 1.1.6 depois que cada máquina bater o heartbeat e aplicar
-- o auto-update. `silencio` acima de 90s com o robô ligado é o sintoma que a
-- 1.1.6 conserta — se persistir DEPOIS da atualização, me avise.
SELECT
  id, nome, ativa, app_version,
  now() - last_seen AS silencio,
  CASE
    WHEN NOT ativa                                   THEN 'pausada'
    WHEN last_seen IS NULL                           THEN 'nunca falou'
    WHEN now() - last_seen > INTERVAL '90 seconds'   THEN 'SILENCIOSA'
    ELSE 'batendo'
  END AS estado
FROM public.maquinas
ORDER BY id;


-- ── Detalhe: como está a fila de hoje ────────────────────────────────────────
SELECT
  status,
  count(*)                                                   AS linhas,
  count(*) FILTER (WHERE numero_autorizacao IS NOT NULL)     AS com_guia,
  count(*) FILTER (WHERE started_at IS NOT NULL)             AS ja_passaram_pelo_robo
FROM public.fila_autorizacoes
WHERE data_atendimento = (now() AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY status
ORDER BY status;


-- ── Detalhe: o "solicitado por" chega na tela? ───────────────────────────────
-- Tem de vir nome preenchido em criado_por para as linhas de hoje.
--
-- Se este bloco der `ERROR: column "criado_por" does not exist`, o diagnóstico é
-- direto: a migration 20260814130000 não foi aplicada. É o mesmo que a linha
-- "listar_central_autorizacoes devolve criado_por" do quadro lá em cima diz.
-- Rode só este bloco por último, para o erro não esconder o resto.
SELECT paciente_nome, horario, status_final, criado_por
FROM public.listar_central_autorizacoes((now() AT TIME ZONE 'America/Sao_Paulo')::date)
WHERE status_final IN ('pendente','processando')
ORDER BY horario
LIMIT 20;
