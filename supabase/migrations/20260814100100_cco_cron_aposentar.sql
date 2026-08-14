-- Aposenta os 5 jobs cco-* que falham a cada execução desde que o GUC sumiu.
--
-- POR QUE
-- Os 5 montam a chamada com current_setting('app.supabase_url') e
-- current_setting('app.service_role_key') — sem o segundo argumento, que é o
-- que permitiria valor ausente. Nenhum dos dois GUCs existe em produção:
-- as migrations 20260608000002 e 20260608000003 assumem que alguém os
-- definiu, mas nunca os definem. Provavelmente vieram de um
-- `ALTER DATABASE ... SET` perdido num restore/upgrade do projeto.
--
-- Resultado medido em cron.job_run_details (2026-08-14): todas as execuções
-- em `failed`, com
--   ERROR: unrecognized configuration parameter "app.supabase_url"
-- Ou seja, a exceção estoura no PRIMEIRO current_setting — os jobs nunca
-- chegam a montar o header, nem a fazer requisição nenhuma. Não é um CCO
-- degradado, é um CCO que não executa.
--
-- O custo é só ruído: os horários (*/5, 2,12,22..., 3,8,13..., 4,9,14... e
-- 5,20,35,50) somam 46 execuções falhas por hora, ~1.100 por dia, 24/7 — cada
-- uma gravando uma linha em cron.job_run_details. Isso cobra o mesmo orçamento
-- de disco do aviso de 2026-07-08.
--
-- ISTO NÃO MUDA COMPORTAMENTO. Os jobs já não fazem nada; o que para é a
-- gravação do erro. E é reversível: as definições continuam em
-- 20260608000002_cco_cron_jobs.sql e 20260608000003_cco_phase3.sql. Reviver o
-- CCO é uma decisão separada, e exigiria definir os GUCs ou (melhor) reescrever
-- os 5 para o Vault, como 20260814100000 fez com os demais.
--
-- Ficam de fora cco-cleanup-orphans e cco-retention-90d: são DELETE em SQL
-- puro, rodam 1x/dia, funcionam, e não dependem de GUC nenhum.
--
-- Estes 5 não têm a service_role key em lugar nenhum — não são afetados pela
-- rotação. Esta migration é higiene, não segurança.

DO $do$
DECLARE
  j     text;
  v_qtd int := 0;
BEGIN
  -- Trava de segurança: se o GUC reaparecer, os jobs podem ter voltado a
  -- funcionar e aposentá-los às cegas seria destrutivo. Melhor abortar e
  -- obrigar uma revisão do que apagar um job que agora serve para algo.
  IF current_setting('app.supabase_url', true) IS NOT NULL THEN
    RAISE EXCEPTION
      'app.supabase_url existe agora: os jobs cco-* podem estar funcionando. Revise antes de aposentar.';
  END IF;

  FOREACH j IN ARRAY ARRAY[
    'cco-conciliation-engine',
    'cco-sync-assim-authorizations',
    'cco-sync-authorization-queue',
    'cco-sync-therapist-control',
    'cco-sync-tita-sessions'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      v_qtd := v_qtd + 1;
      RAISE NOTICE 'job % aposentado', j;
    ELSE
      -- Deixa a migration aplicável duas vezes: cron.unschedule estoura
      -- quando o job não existe.
      RAISE NOTICE 'job % ja nao existe', j;
    END IF;
  END LOOP;

  RAISE NOTICE '% job(s) aposentado(s)', v_qtd;
END
$do$;
