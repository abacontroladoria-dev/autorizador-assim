-- Corrige o agendamento do sync de reposição de faltas (csv_reposicao_faltas).
--
-- Contexto do bug (idêntico ao da grade):
--   O cron 'sync-reposicao-faltas' (job 25, '43 5 * * 1-5' = 02:43 BRT, seg-sex)
--   chamava a Edge Function via net.http_post com URL E token PLACEHOLDER:
--     url := 'https://SEU-PROJETO.supabase.co/functions/v1/sync-reposicao-faltas'
--     Authorization := 'Bearer SEU_SERVICE_ROLE_KEY'
--   -> falha de DNS / 401, nunca gravou nada. O cron aparecia "succeeded" porque
--      net.http_post é assíncrono (só enfileira). A tabela só era populada por
--      rodadas manuais (última: 30/jun 11:58 BRT).
--   A Edge Function sync-reposicao-faltas ESTÁ deployada (confirmado: responde 200
--   a POST com service-role; range próprio hoje -> +2 dias úteis).
--
-- Correção: reprograma o job com a URL real e o service-role no Authorization.
-- Mantém o horário original (02:43 BRT, seg-sex).

SELECT cron.schedule(
  'sync-reposicao-faltas',
  '43 5 * * 1-5',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-reposicao-faltas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
