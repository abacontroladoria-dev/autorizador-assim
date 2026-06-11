DROP VIEW IF EXISTS public.vw_dashboard_kpis;

CREATE OR REPLACE VIEW public.vw_dashboard_kpis AS
WITH
blacklist AS (
  SELECT terapia_nome
  FROM config_regras_terapias
  WHERE categoria = 'BLACKLIST_AUTORIZACAO' AND ativo = true
),
atend AS (
  SELECT
    COUNT(*) FILTER (WHERE sala ILIKE '%Realengo%')     AS realengo,
    COUNT(*) FILTER (WHERE sala ILIKE '%Fazendinha%')   AS fazendinha,
    COUNT(*) FILTER (WHERE sala ILIKE '%Padre Miguel%') AS "padreMiguel",
    COUNT(*)                                            AS total
  FROM grade_profissionais_tita
  WHERE data = (
    SELECT COALESCE(MIN(data), CURRENT_DATE)
    FROM grade_profissionais_tita
    WHERE data >= CURRENT_DATE
  )
    AND status_agendamento <> 'Livre'
    AND NOT EXISTS (
      SELECT 1 FROM blacklist bl
      WHERE nome_terapia ILIKE ('%' || bl.terapia_nome || '%')
    )
),
faltas AS (
  SELECT
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Realengo%')     AS realengo,
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Fazendinha%')   AS fazendinha,
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Padre Miguel%') AS "padreMiguel",
    COUNT(*)                                                    AS total
  FROM fila_autorizacoes fa
  JOIN agenda_tita a ON a.tita_agendamento_id = fa.tita_agendamento_id
  WHERE fa.data_atendimento = CURRENT_DATE
    AND fa.status = 'falta'
),
terapeutas AS (
  SELECT
    COUNT(*) FILTER (WHERE sala ILIKE '%Realengo%')     AS realengo,
    COUNT(*) FILTER (WHERE sala ILIKE '%Fazendinha%')   AS fazendinha,
    COUNT(*) FILTER (WHERE sala ILIKE '%Padre Miguel%') AS "padreMiguel",
    COUNT(*)                                            AS total
  FROM grade_profissionais_tita
  WHERE data = (
    SELECT COALESCE(MIN(data), CURRENT_DATE)
    FROM grade_profissionais_tita
    WHERE data >= CURRENT_DATE
  )
    AND status_agendamento NOT IN ('Cancelado', 'Livre')
),
indisponiveis AS (
  SELECT
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Realengo%')     AS realengo,
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Fazendinha%')   AS fazendinha,
    COUNT(*) FILTER (WHERE a.sala_nome ILIKE '%Padre Miguel%') AS "padreMiguel",
    COUNT(*)                                                    AS total
  FROM controle_terapeutico ct
  JOIN agenda_tita a ON a.tita_agendamento_id = ct.tita_agendamento_id
  WHERE ct.data_atendimento = CURRENT_DATE
    AND ct.status = 'indisponivel'
)
SELECT 'kpi_atendimentos'            AS metric_type, realengo, fazendinha, "padreMiguel", total FROM atend
UNION ALL
SELECT 'kpi_faltas',                                 realengo, fazendinha, "padreMiguel", total FROM faltas
UNION ALL
SELECT 'kpi_terapeutas',                             realengo, fazendinha, "padreMiguel", total FROM terapeutas
UNION ALL
SELECT 'kpi_terapeutas_indisponiveis',               realengo, fazendinha, "padreMiguel", total FROM indisponiveis;

GRANT SELECT ON public.vw_dashboard_kpis TO anon, authenticated;
