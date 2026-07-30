-- Estende fn_sync_tita_grade() para cobrir 3 semanas (corrente + próxima + 2 semanas à frente).
--
-- Histórico do problema:
--   20260529000010 → sincronizava apenas a semana corrente (Seg–Sex)
--   20260530000000 → tentou range amplo sem datas; API truncou resposta para 2 dias
--   20260601000001 → corrigiu para 2 semanas, mas arquivo nunca foi aplicado ao banco
--
-- Esta migration sobrescreve fn_sync_tita_grade() independentemente de qual versão
-- está ativa, e executa um backfill imediato das 3 janelas.
-- Os crons existentes (20260529000010) continuam válidos — chamam a mesma função.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
  seg0  date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- Semana corrente (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', seg0::text, 'data_fim', (seg0 + 4)::text)
  );
  -- Próxima semana (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', (seg0 + 7)::text, 'data_fim', (seg0 + 11)::text)
  );
  -- Semana 2 à frente (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', (seg0 + 14)::text, 'data_fim', (seg0 + 18)::text)
  );
END;
$$;

-- Backfill imediato: popula as 3 semanas agora
SELECT fn_sync_tita_grade();
