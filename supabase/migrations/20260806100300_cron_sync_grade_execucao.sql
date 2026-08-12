-- Fase 2.4 — Cron da recaptura de execução.
--
-- Espelha fn_sync_grade_csv_em_lotes (20260728120000), com a janela invertida: em
-- vez de hoje → fim do mês seguinte, vai de hoje-45 → hoje, também em fatias de 7
-- dias (cada chamada leva ~31s contra a API da TiTa; o range inteiro numa
-- chamada só estouraria o timeout de 150s da Edge Function).
--
-- Por que 45 dias. Medido em junho/2026, sobre 7.981 evoluções reais, o atraso
-- entre a sessão e o registro da evolução:
--
--     mesmo dia   75,84%        janela de  7 dias → 97,34%  (perde 212/mês)
--     1 dia        9,89%        janela de 10 dias → 98,23%  (perde 141/mês)
--     2–3 dias     4,97%        janela de 15 dias → 99,61%  (perde  31/mês)
--     4–7 dias     6,64%        janela de 45 dias → 100,00% (perde   0)
--     8–41 dias    2,66%
--
-- 45 dias cobre a cauda inteira observada, com folga sobre o máximo de 41.
--
-- Horário: 04:00 BRT, duas horas depois do sync de grade (02:00). A ordem importa
-- pouco — os dois modos escrevem em conjuntos de colunas disjuntos e em janelas
-- de data opostas — mas separar evita disputar a API da TiTa e facilita ler os
-- logs de cada um.
--
-- Custo: 7 fatias × ~31s ≈ 4 min de Edge Function por dia. Escrita é baixa depois
-- do primeiro backfill, porque a Edge Function só envia linha cujo bloco de
-- execução mudou de fato.

CREATE OR REPLACE FUNCTION public.fn_sync_grade_execucao_em_lotes(p_dias_atras integer DEFAULT 45)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio       date := v_hoje - p_dias_atras;
  v_chunk_inicio date;
  v_chunk_fim    date;
  v_token        text;
BEGIN
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
   WHERE name = 'cron_service_role_key';

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_grade_execucao_em_lotes: segredo cron_service_role_key ausente no Vault';
  END IF;

  v_chunk_inicio := v_inicio;

  WHILE v_chunk_inicio <= v_hoje LOOP
    v_chunk_fim := LEAST(v_chunk_inicio + 6, v_hoje);

    PERFORM net.http_post(
      url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'modo',        'execucao',
        'data_inicio', v_chunk_inicio::text,
        'data_fim',    v_chunk_fim::text
      ),
      timeout_milliseconds := 120000
    );

    v_chunk_inicio := v_chunk_fim + 1;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_grade_execucao_em_lotes(integer) IS
  'Dispara sync-grade-csv em modo "execucao" para hoje-N → hoje, em fatias de 7 dias. Só atualiza colunas de execução (status real e evolução) de linhas que já existem; nunca insere nem inativa. N padrão = 45, dimensionado pelo atraso medido entre sessão e evolução.';

SELECT cron.schedule(
  'sync-grade-execucao-daily',
  '0 7 * * *',
  $cron$ SELECT public.fn_sync_grade_execucao_em_lotes(); $cron$
);
