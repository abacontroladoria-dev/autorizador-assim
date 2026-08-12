-- Etapa 4 da evolução da Previsão de Receitas: agenda o snapshot diário.
-- Roda 10 minutos depois do último lote de sync-grade-csv-daily (05h + até ~5
-- lotes semanais, cada um levando até ~1-2min — 05h10 dá folga confortável
-- pra grade do mês corrente já estar sincronizada antes do retrato).
-- Mesmo padrão de Vault dos demais crons (nunca hardcode o token).

SELECT cron.schedule(
  'snapshot-previsao-receitas-daily',
  '10 5 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/snapshot-previsao-receitas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
