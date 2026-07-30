-- Job de fechamento: no dia 5 de cada mês, roda mais uma vez o snapshot pro
-- mês ANTERIOR (competência = mês passado), marcando o resumo como 'fechado'.
-- Dá 5 dias de folga pra faltas registradas com atraso (comum na recepção)
-- entrarem na dedução antes do número virar "final" no Histórico de Receitas.
-- As execuções diárias normais (sync-grade-csv-daily/snapshot-previsao-receitas-daily)
-- continuam batendo só no mês CORRENTE — este job é o único que revisita um
-- mês que já passou.

SELECT cron.schedule(
  'snapshot-previsao-receitas-fechamento',
  '20 5 5 * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/snapshot-previsao-receitas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'competencia', to_char(date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '1 month', 'YYYY-MM'),
      'fechamento', true
    ),
    timeout_milliseconds := 120000
  );
  $cron$
);
