-- Fix: get_kpis_auditoria_assim retornava 0 kpis quando:
--   1. terapias IS NULL na view (string_agg edge case) → NOT ILIKE trata NULL como exclusão em SQL
--      mas PostgREST inclui NULLs no .not(), causando divergência entre tabela e KPIs
--   2. CTE auditoria vazio → SELECT ... FROM auditoria (sem dados) retorna 0 linhas,
--      fazendo .single() falhar com PGRST116 e buscarKpisAuditoriaAssim retornar null
--
-- Correções:
--   1. COALESCE(terapias, '') iguala comportamento com PostgREST para NULLs
--   2. SELECT sem FROM auditoria: subqueries escalares sempre retornam 1 linha
--   3. faltas_dia agora exclui Equo/Fisio Aquática (alinha com listarFaltasAuditoria)

DROP FUNCTION IF EXISTS public.get_kpis_auditoria_assim(date);

CREATE OR REPLACE FUNCTION public.get_kpis_auditoria_assim(p_data date)
RETURNS TABLE(
  total                  bigint,
  liberadas              bigint,
  faltas                 bigint,
  nao_solicitadas        bigint,
  sincronizando          bigint,
  retorno_nao_confirmado bigint,
  canceladas             bigint,
  glosas                 bigint
)
LANGUAGE sql STABLE AS $$
  WITH auditoria AS (
    SELECT situacao
    FROM public.vw_auditoria_autorizacoes_assim
    WHERE data_atendimento = p_data
      AND COALESCE(terapias, '') NOT ILIKE '%Equoterapia%'
      AND COALESCE(terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
  ),
  faltas_dia AS (
    SELECT count(*) AS total_faltas
    FROM public.fila_autorizacoes
    WHERE data_atendimento = p_data
      AND upper(COALESCE(tipo_falta, '')) LIKE '%PACIENTE%'
      AND terapia_nome NOT ILIKE '%Equoterapia%'
      AND terapia_nome NOT ILIKE '%Fisioterapia Aquática%'
  )
  SELECT
    (SELECT count(*)                                                  FROM auditoria) AS total,
    (SELECT count(*) FILTER (WHERE situacao = 'LIBERADA')             FROM auditoria) AS liberadas,
    (SELECT total_faltas                                     FROM faltas_dia)           AS faltas,
    (SELECT count(*) FILTER (WHERE situacao = 'NAO_SOLICITADA')       FROM auditoria) AS nao_solicitadas,
    (SELECT count(*) FILTER (WHERE situacao = 'SINCRONIZANDO')        FROM auditoria) AS sincronizando,
    (SELECT count(*) FILTER (WHERE situacao = 'RETORNO_NAO_CONFIRMADO') FROM auditoria) AS retorno_nao_confirmado,
    (SELECT count(*) FILTER (WHERE situacao = 'CANCELADA')            FROM auditoria) AS canceladas,
    (SELECT count(*) FILTER (WHERE situacao = 'GLOSA')                FROM auditoria) AS glosas;
$$;
