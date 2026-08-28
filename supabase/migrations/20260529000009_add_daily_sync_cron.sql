-- Cria fn_sync_tita_hoje() que chama sync_tita_agenda para a data corrente.
-- Complementa fn_sync_tita_semana (segunda-feira): garante que agendamentos
-- criados ou alterados no TiTa de Ter–Sex também apareçam no sistema.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_hoje()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data', (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date::text
    )
  );
END;
$$;

-- Roda Seg–Sex às 07:00, 09:00, 11:00, 13:00, 15:00 e 17:00 (horário SP).
-- O cron 'sync-tita-semana-segunda' continua rodando às 09:50 toda segunda
-- para sincronizar a semana inteira; este job complementa com atualizações
-- intradiárias de hoje.
SELECT cron.schedule(
  'sync-tita-diario',
  '0 7,9,11,13,15,17 * * 1-5',
  'SELECT fn_sync_tita_hoje()'
);
