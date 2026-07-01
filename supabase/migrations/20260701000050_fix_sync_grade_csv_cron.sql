-- Corrige o agendamento do sync da grade (csv_grades_profissionais).
--
-- Contexto do bug:
--   Existiam DOIS cron jobs diários (05:00 UTC = 02:00 BRT) que deveriam popular
--   csv_grades_profissionais chamando a Edge Function sync-grade-csv, mas AMBOS
--   estavam quebrados e nunca gravaram nada:
--     - 'sync-grade-csv-daily' (job 23): net.http_post para a URL placeholder
--       'https://SEU-PROJETO.supabase.co/...' -> falha de DNS.
--     - 'sync_csv_grades_profissionais_daily' (job 24): função que chamava a
--       function via http_post SEM header Authorization -> 401 (verify_jwt=true).
--   Os dois apareciam como "succeeded" no cron porque o net.http_post é assíncrono
--   (só enfileira); o erro real (DNS/401) ocorre depois e é descartado.
--   Resultado: a grade só era populada por rodadas manuais.
--
-- Correção: remove os dois jobs quebrados (e a função órfã) e cria UM job correto
-- que chama a Edge Function com a URL real e o service-role no Authorization.

-- 1) Remove os jobs quebrados (ignora se não existirem)
DO $$ BEGIN PERFORM cron.unschedule('sync-grade-csv-daily');                EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync_csv_grades_profissionais_daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2) Remove a função órfã usada pelo job 24
DROP FUNCTION IF EXISTS public.sync_csv_grades_profissionais();

-- 3) Cria o job correto: 05:00 UTC = 02:00 BRT, diário.
--    Diário (e não mensal) para se auto-corrigir: se a TITA ainda não publicou a
--    primeira semana do mês seguinte no dia 1º, os dias seguintes pegam.
SELECT cron.schedule(
  'sync-grade-csv-daily',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
