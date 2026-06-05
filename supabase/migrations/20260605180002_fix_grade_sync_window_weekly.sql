-- Expande a janela do sync diário de grade de "hoje→sex" para "seg→sex".
--
-- Antes, fn_sync_tita_grade_hoje() sincronizava apenas de CURRENT_DATE até sexta.
-- Isso deixava datas passadas da semana sem re-sincronização: se um profissional
-- fosse removido do TITA depois do último sync de uma data passada, seus registros
-- em grade_profissionais_tita para aquela data permaneciam indefinidamente,
-- fazendo-o aparecer como "livre" no modal de substituição para datas passadas.
--
-- Com a mudança para seg→sex (máx. 5 dias = mesmo range do sync semanal que já
-- funciona), cada ciclo diário re-sincroniza a semana inteira, garantindo que
-- grades orfãs de profissionais removidos sejam limpas.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade_hoje()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
  seg   date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex   date := seg + 4;
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
