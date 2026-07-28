-- Corrige o job 'sync-grade-csv-daily': a versão implantada da Edge Function
-- sync-grade-csv estava (há semanas, sem registro em nenhuma migration) com
-- um range hardcoded de 1 semana só, provavelmente porque alguém encontrou o
-- mesmo problema que corrigimos aqui e deu um jeito rápido direto no painel
-- do Supabase, sem nunca subir isso pro código/git: pedir hoje→fim do mês
-- seguinte (~2 meses) numa chamada só estoura o timeout de 150s da Edge
-- Function (confirmado em produção nesta sessão — a chamada travou em
-- IDLE_TIMEOUT depois de ~150s, tendo processado só até parte de agosto).
--
-- Correção: em vez de 1 chamada com o range inteiro, este job agora dispara
-- 1 chamada por SEMANA (7 dias) cobrindo hoje→fim do mês seguinte, cada uma
-- com seu próprio DELETE+INSERT isolado (mesma lógica da Edge Function, sem
-- precisar mudar o código dela — ela já aceita data_inicio/data_fim
-- explícitos no body). Se uma chamada travar/falhar, só aquela semana fica
-- incompleta — as demais (antes e depois) já foram gravadas independentemente,
-- ao contrário do range único de antes, onde o DELETE do período inteiro
-- acontece de uma vez antes do INSERT em lotes (se travasse no meio do
-- INSERT, datas já deletadas ficavam sem reinserção até a próxima execução).

CREATE OR REPLACE FUNCTION public.fn_sync_grade_csv_em_lotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje          date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Mesma fórmula de getDefaultRange() em supabase/functions/sync-grade-csv/index.ts:
  -- fim do mês seguinte ao atual (ex.: hoje=28/07 -> v_fim=31/08).
  v_fim           date := (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) + interval '2 months' - interval '1 day')::date;
  v_chunk_inicio  date := v_hoje;
  v_chunk_fim     date;
  v_token         text;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';

  WHILE v_chunk_inicio <= v_fim LOOP
    v_chunk_fim := LEAST(v_chunk_inicio + 6, v_fim);

    PERFORM net.http_post(
      url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('data_inicio', v_chunk_inicio::text, 'data_fim', v_chunk_fim::text),
      timeout_milliseconds := 120000
    );

    v_chunk_inicio := v_chunk_fim + 1;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'sync-grade-csv-daily',
  '0 5 * * *',
  $cron$ SELECT public.fn_sync_grade_csv_em_lotes(); $cron$
);
