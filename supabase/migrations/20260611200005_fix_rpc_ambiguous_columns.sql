DROP FUNCTION IF EXISTS public.get_dashboard_kpis();

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
RETURNS TABLE(
  metric_type  text,
  realengo     bigint,
  fazendinha   bigint,
  "padreMiguel" bigint,
  total        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
BEGIN
  RETURN QUERY
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
  )
  SELECT 'kpi_atendimentos'::text, atend.realengo, atend.fazendinha, atend."padreMiguel", atend.total FROM atend
  UNION ALL
  SELECT 'kpi_faltas'::text, faltas.realengo, faltas.fazendinha, faltas."padreMiguel", faltas.total FROM faltas
  UNION ALL
  SELECT 'kpi_terapeutas'::text, terapeutas.realengo, terapeutas.fazendinha, terapeutas."padreMiguel", terapeutas.total FROM terapeutas
  UNION ALL
  SELECT 'kpi_terapeutas_indisponiveis'::text, indisponiveis.realengo, indisponiveis.fazendinha, indisponiveis."padreMiguel", indisponiveis.total FROM indisponiveis;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis() TO anon, authenticated;