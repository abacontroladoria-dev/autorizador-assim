-- Reestrutura crons de sync TiTa para minimizar consumo de API
-- mantendo cobertura de 2 semanas (atual + próxima).
--
-- Remove:
--   sync-tita-diario (redundante com operacional)
--   sync-tita-semana-segunda (redundante com operacional segunda 06:00)
--
-- Adiciona:
--   sync-tita-operacional (06:00 e 12:00): hoje → sex próxima semana (~20 chamadas/dia)
--   sync-tita-reconciliacao (23:00): hoje-10 → hoje (~10 chamadas/dia)
--   sync-tita-planejamento (dia 1 mês 04:00): today → fim mês seguinte (~1.5 chamadas/dia média)
--
-- Total: ~32 chamadas/dia vs ~7 atuais (com cobertura inadequada)

-- fn_sync_tita_operacional(): sincroniza hoje → sexta da próxima semana
-- Captura mudanças feitas na noite anterior (sexta/segunda) e ajustes intraday (12:00)
CREATE OR REPLACE FUNCTION public.fn_sync_tita_operacional()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d     date;
  hoje  date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  -- sexta da PRÓXIMA semana = date_trunc('week', hoje) + 11 dias
  fim   date := (date_trunc('week', hoje) + interval '11 days')::date;
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
BEGIN
  d := hoje;
  WHILE d <= fim LOOP
    -- Pula sábado (6) e domingo (0)
    IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
      PERFORM net.http_post(
        url     := _url,
        headers := jsonb_build_object(
          'Authorization', _auth,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('data', d::text)
      );
    END IF;
    d := d + 1;
  END LOOP;
END;
$$;

-- fn_sync_tita_reconciliacao(): sincroniza hoje-10 → hoje
-- Captura sessões "Realizado" no CSV que o JSON omite (CSV enrichment automático)
-- -10 dias cobre feriados, recessos, e correções retroativas
CREATE OR REPLACE FUNCTION public.fn_sync_tita_reconciliacao()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d     date;
  hoje  date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  ini   date := hoje - 10;
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
BEGIN
  d := ini;
  WHILE d <= hoje LOOP
    -- Pula sábado (6) e domingo (0)
    IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
      PERFORM net.http_post(
        url     := _url,
        headers := jsonb_build_object(
          'Authorization', _auth,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('data', d::text)
      );
    END IF;
    d := d + 1;
  END LOOP;
END;
$$;

-- fn_sync_tita_planejamento(): sincroniza com janela padrão (hoje → fim mês seguinte)
-- Projeção de receita e antecipação de autorizações futuras
-- Body vazio {} → Edge Function decide janela interna (getBusinessDaysUntilEndOfNextMonth)
CREATE OR REPLACE FUNCTION public.fn_sync_tita_planejamento()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Remove os crons antigos (redundantes)
SELECT cron.unschedule('sync-tita-diario');
SELECT cron.unschedule('sync-tita-semana-segunda');

-- Agenda os 3 novos crons
-- Operacional: 06:00 e 12:00 BRT (= 09:00 e 15:00 UTC, São Paulo = UTC-3)
SELECT cron.schedule(
  'sync-tita-operacional',
  '0 9,15 * * 1-5',
  'SELECT fn_sync_tita_operacional()'
);

-- Reconciliação: 23:00 BRT (= 02:00 UTC próximo dia, São Paulo = UTC-3)
SELECT cron.schedule(
  'sync-tita-reconciliacao',
  '0 2 * * 2-6',
  'SELECT fn_sync_tita_reconciliacao()'
);

-- Planejamento: dia 1 de cada mês 04:00 BRT (= 07:00 UTC, São Paulo = UTC-3)
SELECT cron.schedule(
  'sync-tita-planejamento',
  '0 7 1 * *',
  'SELECT fn_sync_tita_planejamento()'
);
