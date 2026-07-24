-- Fecha o achado de 2026-07-24: 2 jobs do pg_cron (sync-reposicao-faltas,
-- sync-grade-csv-daily) tinham a chave service_role em texto puro dentro de
-- cron.job.command (herdado das migrations 20260701000050/20260701000051).
-- O segredo já foi armazenado no Supabase Vault nesta sessão (fora desta
-- migration, via `vault.create_secret`, pra nunca passar em texto puro por
-- um arquivo versionado) com o nome 'cron_service_role_key'.
--
-- Esta migration só reagenda os 2 jobs (cron.schedule com mesmo nome
-- substitui o job existente) pra buscar o segredo do Vault em tempo de
-- execução, em vez de embutir o valor. Mesma URL, mesmo horário — só muda
-- de onde vem o header Authorization.
--
-- NOTA: isso fecha a exposição de ARMAZENAMENTO (git history + cron.job
-- table), mas o VALOR da chave continua sendo o mesmo JWT que já estava
-- exposto antes. Rotação de fato da chave é uma ação separada (dashboard
-- Supabase + atualizar consumidores), fora do escopo desta migration.

SELECT cron.schedule(
  'sync-reposicao-faltas',
  '43 5 * * 1-5',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-reposicao-faltas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'sync-grade-csv-daily',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
