-- Corrige a causa raiz do erro "Este horário ainda não está disponível para
-- implantação" em Ocupação de Paciente para sugestões a mais de ~3 semanas de
-- distância (achado nesta sessão, reproduzido com o paciente-teste "Notificação
-- Prévia" + profissional "Ingrid Cristina Mello da Costa Dutra", Quinta 13:40,
-- em datas de setembro/2026 — horário livre confirmado no banco, mas a
-- implantação falhava sempre).
--
-- Causa raiz: dois sincronismos com horizontes MUITO diferentes alimentam o
-- mesmo fluxo de implantação.
--   - sync-grade-csv-daily (fn_sync_grade_csv_em_lotes, migration
--     20260728120000): popula csv_grades_profissionais de HOJE até o fim do
--     MÊS SEGUINTE (~2 meses) — é daí que buildSugestoes() em OcupPacMode.tsx
--     tira as sugestões de horário livre.
--   - sync-tita-grade-semanal (fn_sync_tita_grade, migration
--     20260601000002/20260605180002): populava grade_profissionais_tita
--     (usada por resolverGradeTerapeuta em services/tita/mappings.ts para
--     resolver id_grade_terapeuta ao implantar) cobrindo só 3 semanas
--     (semana corrente + próxima + +2 semanas).
--
-- Resultado: qualquer sugestão aceita para uma data além dessas 3 semanas
-- nunca tinha correspondência em grade_profissionais_tita —
-- resolverGradeTerapeuta retornava null, prepararAgendamento cancelava com
-- "id_grade_terapeuta_nao_encontrado", e a UI mostrava a mensagem genérica de
-- "horário ainda não está disponível" mesmo com o horário genuinamente livre.
--
-- Confirmado consultando produção nesta sessão: grade_profissionais_tita não
-- tinha NENHUMA linha para profissional_id=8658 (Ingrid Cristina) em
-- 2026-09-10/17/24, embora csv_grades_profissionais tivesse os 3 slots livres.
--
-- Correção: fn_sync_tita_grade() passa a cobrir o MESMO horizonte de
-- sync-grade-csv-daily (hoje → fim do mês seguinte), em lotes de 7 dias (mesma
-- técnica de 20260728120000 — a Edge Function sync_tita_grade processa o
-- período inteiro numa única chamada e o range completo de ~2 meses estourava
-- o timeout, exatamente como aconteceu com sync-grade-csv). Também migra o
-- Authorization para o Vault (cron_service_role_key), em vez do JWT em texto
-- puro herdado das migrations anteriores (mesmo padrão já aplicado em
-- 20260724180000 para sync-reposicao-faltas e sync-grade-csv-daily).
--
-- fn_sync_tita_grade_hoje() (refresh de hoje, 6x/dia em dias úteis) não muda —
-- continua cobrindo só a semana corrente para reatividade de curto prazo.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Mesma fórmula de getRangeUntilEndOfNextMonth() em
  -- supabase/functions/sync_tita_grade/index.ts e de fn_sync_grade_csv_em_lotes:
  -- fim do mês seguinte ao atual (ex.: hoje=05/08 -> v_fim=30/09).
  v_fim          date := (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) + interval '2 months' - interval '1 day')::date;
  v_chunk_inicio date := v_hoje;
  v_chunk_fim    date;
  v_token        text;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';

  WHILE v_chunk_inicio <= v_fim LOOP
    v_chunk_fim := LEAST(v_chunk_inicio + 6, v_fim);

    PERFORM net.http_post(
      url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade',
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
-- Backfill imediato: cobre já agora o horizonte completo (hoje -> fim do mês
-- seguinte), sem esperar a próxima segunda 06:35.
SELECT public.fn_sync_tita_grade();
