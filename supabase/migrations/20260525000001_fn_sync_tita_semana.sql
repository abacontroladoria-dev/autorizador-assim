-- Cria fn_sync_tita_semana() que chama a Edge Function sync_tita_agenda
-- para cada dia útil (Seg–Sex) da semana corrente, passando a data específica
-- no body. Isso garante que todo início de semana a agenda da semana inteira
-- seja sincronizada, em vez de apenas o dia atual.
--
-- Dependência: a Edge Function sync_tita_agenda deve ler o campo `data`
-- do body da requisição (ver supabase/functions/sync_tita_agenda/index.ts).

CREATE OR REPLACE FUNCTION public.fn_sync_tita_semana()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  dia  date;
  seg  date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex  date := seg + 4;
  _url text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  dia := seg;
  WHILE dia <= sex LOOP
    PERFORM net.http_post(
      url     := _url,
      headers := jsonb_build_object(
        'Authorization', _auth,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('data', dia::text)
    );
    dia := dia + 1;
  END LOOP;
END;
$$;

-- Job que roda toda segunda-feira às 09:50 (antes do primeiro sync diário às 10:00)
-- e sincroniza Seg–Sex da semana inteira de uma vez.
SELECT cron.schedule(
  'sync-tita-semana-segunda',
  '50 9 * * 1',
  'SELECT fn_sync_tita_semana()'
);
