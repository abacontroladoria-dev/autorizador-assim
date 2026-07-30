-- Cria fn_sync_tita_grade() e fn_sync_tita_grade_hoje() para sincronizar
-- grade_profissionais_tita a partir da Edge Function sync_tita_grade.
--
-- Sem esse sync, os blocos "Horário Livre" no calendário de terapeutas
-- ficam presos nos dados do setup inicial e não refletem o TiTa atual.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
  seg  date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex  date := seg + 4;
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data_inicio', seg::text,
      'data_fim',    sex::text
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade_hoje()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
  hoje date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data_inicio', hoje::text,
      'data_fim',    hoje::text
    )
  );
END;
$$;

-- Sync semanal completo (Seg–Sex) toda segunda às 06:35
SELECT cron.schedule(
  'sync-tita-grade-semanal',
  '35 6 * * 1',
  'SELECT fn_sync_tita_grade()'
);

-- Sync diário de hoje: Seg–Sex às 07:05, 09:05, 11:05, 13:05, 15:05 e 17:05
-- (5 minutos após o sync de agenda para evitar concorrência)
SELECT cron.schedule(
  'sync-tita-grade-diario',
  '5 7,9,11,13,15,17 * * 1-5',
  'SELECT fn_sync_tita_grade_hoje()'
);
