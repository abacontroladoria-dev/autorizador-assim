-- Cacheia get_dashboard_kpis() para eliminar a queima de Disk IO.
--
-- Contexto: get_dashboard_kpis() era chamada a cada load do dashboard (page.tsx),
-- e cada chamada varria a grade_profissionais_tita (~125MB) VÁRIAS vezes —
-- inclusive com joins ILIKE '%...%' (curinga à esquerda, sem uso de índice) e
-- filtros sala ILIKE '%Realengo%'. Custo medido: média 8,4s, pico 29,7s por chamada,
-- ~7% de TODO o tempo de banco. Com múltiplos usuários abrindo o dashboard ao mesmo
-- tempo, viravam varreduras concorrentes que saturavam o IO budget (efeito stampede).
--
-- Solução: desacoplar o cálculo pesado do caminho do usuário.
--   * refresh_dashboard_kpis()  -> roda a lógica pesada 1x a cada 3 min (cron) e grava numa cache.
--   * get_dashboard_kpis()      -> vira um SELECT trivial na cache (mesma assinatura; front intocado).
-- Resultado: cada cliente lê instantâneo; o cálculo caro roda de forma serializada e
-- previsível (nunca em stampede), com frescor <= 3 min — mais que suficiente para KPIs do dia.

-- ============================================================================
-- 1. Tabela-cache (4 linhas fixas). RLS ligada SEM policy: apenas as funções
--    SECURITY DEFINER (owner = postgres) leem/escrevem, bypassando RLS.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dashboard_kpis_cache (
  metric_type   text PRIMARY KEY,
  realengo      bigint      NOT NULL DEFAULT 0,
  fazendinha    bigint      NOT NULL DEFAULT 0,
  padre_miguel  bigint      NOT NULL DEFAULT 0,
  total         bigint      NOT NULL DEFAULT 0,
  refreshed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_kpis_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. refresh_dashboard_kpis(): a lógica pesada original, agora fazendo UPSERT
--    na cache em vez de RETURN QUERY. Lógica idêntica a 20260611200004 para
--    preservar exatamente os mesmos números.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_dashboard_kpis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  WITH
  blacklist_names AS (
    SELECT crt.terapia_nome
    FROM config_regras_terapias crt
    WHERE crt.categoria = 'BLACKLIST_AUTORIZACAO' AND crt.ativo = true
  ),
  blacklisted AS (
    SELECT DISTINCT gpt.id
    FROM grade_profissionais_tita gpt
    JOIN blacklist_names bl ON gpt.nome_terapia ILIKE ('%' || bl.terapia_nome || '%')
  ),
  target_date AS (
    SELECT COALESCE(MIN(gpt2.data), CURRENT_DATE) AS dt
    FROM grade_profissionais_tita gpt2
    WHERE gpt2.data >= CURRENT_DATE
  ),
  atend AS (
    SELECT
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Realengo%')     AS realengo,
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(*)                                                 AS total
    FROM grade_profissionais_tita gpt
    CROSS JOIN target_date td
    WHERE gpt.data = td.dt
      AND gpt.status_agendamento <> 'Livre'
      AND gpt.id NOT IN (SELECT id FROM blacklisted)
  ),
  faltas AS (
    SELECT
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT fa.paciente_nome)                                                                  AS total
    FROM fila_autorizacoes fa
    LEFT JOIN agenda_tita a ON a.tita_agendamento_id = fa.tita_agendamento_id AND a.ativo = true
    WHERE fa.data_atendimento = CURRENT_DATE
      AND fa.tipo_falta = 'paciente'
  ),
  terapeutas AS (
    SELECT
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT gpt.nome_profissional)                                                AS total
    FROM grade_profissionais_tita gpt
    CROSS JOIN target_date td
    WHERE gpt.data = td.dt
      AND gpt.status_agendamento = 'Agendado'
  ),
  indisponiveis AS (
    SELECT
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT a.profissional_id)                                                    AS total
    FROM controle_terapeutico ct
    JOIN agenda_tita a ON a.tita_agendamento_id = ct.tita_agendamento_id AND a.ativo = true
    WHERE ct.data_atendimento = CURRENT_DATE
      AND ct.status = 'indisponivel'
  ),
  computed AS (
    SELECT 'kpi_atendimentos'::text AS metric_type, atend.realengo, atend.fazendinha, atend."padreMiguel", atend.total FROM atend
    UNION ALL
    SELECT 'kpi_faltas'::text, faltas.realengo, faltas.fazendinha, faltas."padreMiguel", faltas.total FROM faltas
    UNION ALL
    SELECT 'kpi_terapeutas'::text, terapeutas.realengo, terapeutas.fazendinha, terapeutas."padreMiguel", terapeutas.total FROM terapeutas
    UNION ALL
    SELECT 'kpi_terapeutas_indisponiveis'::text, indisponiveis.realengo, indisponiveis.fazendinha, indisponiveis."padreMiguel", indisponiveis.total FROM indisponiveis
  )
  INSERT INTO public.dashboard_kpis_cache (metric_type, realengo, fazendinha, padre_miguel, total, refreshed_at)
  SELECT metric_type, realengo, fazendinha, "padreMiguel", total, now()
  FROM computed
  ON CONFLICT (metric_type) DO UPDATE
    SET realengo     = EXCLUDED.realengo,
        fazendinha   = EXCLUDED.fazendinha,
        padre_miguel = EXCLUDED.padre_miguel,
        total        = EXCLUDED.total,
        refreshed_at = EXCLUDED.refreshed_at;
END;
$$;

-- ============================================================================
-- 3. get_dashboard_kpis(): agora só lê a cache. Mesma assinatura de retorno
--    (inclusive "padreMiguel" quoted) => o front NÃO muda.
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_dashboard_kpis();

CREATE FUNCTION public.get_dashboard_kpis()
RETURNS TABLE(
  metric_type   text,
  realengo      bigint,
  fazendinha    bigint,
  "padreMiguel" bigint,
  total         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.metric_type,
    c.realengo,
    c.fazendinha,
    c.padre_miguel AS "padreMiguel",
    c.total
  FROM public.dashboard_kpis_cache c
  ORDER BY CASE c.metric_type
    WHEN 'kpi_atendimentos'             THEN 1
    WHEN 'kpi_faltas'                   THEN 2
    WHEN 'kpi_terapeutas'               THEN 3
    WHEN 'kpi_terapeutas_indisponiveis' THEN 4
    ELSE 5
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_kpis() TO service_role;

-- ============================================================================
-- 4. Semeia a cache imediatamente (para não servir vazio até o 1º cron) e
--    agenda o refresh a cada 30 min em horário comercial (09:00-23:59 UTC =
--    06:00-20:59 BRT). Frescor <= 30 min — suficiente p/ tela de visualização.
-- ============================================================================
SELECT public.refresh_dashboard_kpis();

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-dashboard-kpis');
  EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'refresh-dashboard-kpis',
  '*/30 9-23 * * *',
  'SELECT public.refresh_dashboard_kpis()'
);
