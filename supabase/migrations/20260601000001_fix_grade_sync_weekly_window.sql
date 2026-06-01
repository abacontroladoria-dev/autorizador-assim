-- Corrige fn_sync_tita_grade() e fn_sync_tita_grade_hoje() para trabalhar
-- com janelas curtas (semana a semana), compatível com o limite de resposta
-- da API do TiTa que trunca ranges grandes.
--
-- Diagnóstico: chamar com range amplo (jun→jul) retornou apenas 2 dias porque
-- o endpoint /integracao/grade_profissionais limita registros por resposta.
-- O sync original de mai/25–29 funcionou porque usava exatamente 5 dias (Mon–Fri).
--
-- Nova estratégia:
--   fn_sync_tita_grade()       → seg-sex da semana corrente + seg-sex da próxima
--   fn_sync_tita_grade_hoje()  → hoje até sexta da semana corrente
--                                (captura dados que o TiTa gera incrementalmente)

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
  seg_atual  date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex_atual  date := seg_atual + 4;
  seg_prox   date := seg_atual + 7;
  sex_prox   date := seg_atual + 11;
BEGIN
  -- Semana corrente (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', seg_atual::text, 'data_fim', sex_atual::text)
  );
  -- Próxima semana (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', seg_prox::text, 'data_fim', sex_prox::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade_hoje()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
  hoje date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex  date := (date_trunc('week', hoje AT TIME ZONE 'America/Sao_Paulo') + interval '4 days')::date;
BEGIN
  -- hoje → sexta da semana corrente (captura dados novos que o TiTa gera por dia)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', hoje::text, 'data_fim', sex::text)
  );
END;
$$;

-- Backfill imediato: semana corrente + próxima
SELECT fn_sync_tita_grade();
