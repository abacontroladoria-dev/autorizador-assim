-- Fix: registros recém-inseridos em fila_autorizacoes têm updated_at = NULL
-- porque o trigger trigger_updated_at só dispara em UPDATE, não em INSERT.
-- Com updated_at NULL, a view classificava como RETORNO_NAO_CONFIRMADO imediatamente.
-- Solução: usar created_at como fallback via COALESCE.

CREATE OR REPLACE VIEW "public"."vw_auditoria_autorizacoes_assim" AS
WITH fila_operacional AS (
  SELECT
    f.empresa,
    f.matricula,
    f.dep,
    f.data_atendimento,
    f.horario,
    f.tuss AS codigo_tuss,
    MAX(COALESCE(f.updated_at, f.created_at)) AS ultimo_updated_at
  FROM public.fila_autorizacoes f
  WHERE NOT (
    upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
    OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
    OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
  )
  GROUP BY f.empresa, f.matricula, f.dep, f.data_atendimento, f.horario, f.tuss
),
match_temporal AS (
  WITH sessoes AS (
    SELECT
      b_1.bloco_id,
      b_1.paciente_id,
      b_1.paciente_nome,
      b_1.empresa,
      b_1.matricula,
      b_1.dep,
      b_1.carteirinha,
      b_1.data_atendimento,
      b_1.hora_inicial,
      b_1.codigo_tuss,
      b_1.convenio_nome,
      b_1.terapias,
      b_1.profissionais,
      b_1.quantidade_sessoes,
      row_number() OVER (
        PARTITION BY b_1.empresa, b_1.matricula, b_1.dep, b_1.data_atendimento, b_1.codigo_tuss
        ORDER BY b_1.hora_inicial
      ) AS ordem_sessao
    FROM public.vw_blocos_autorizaveis_assim b_1
  ),
  autorizacoes AS (
    SELECT
      aa.guia,
      aa.matricula,
      aa.paciente_nome,
      aa.data_execucao,
      aa.data_autorizacao,
      aa.status,
      aa.codigo_tuss,
      aa.codigo_erro,
      aa.descricao_erro,
      aa.teve_token,
      aa.updated_at,
      aa.token,
      aa.status_tratado,
      aa.matricula_limpa,
      aa.paciente_id,
      split_part(aa.matricula, '.', 1) AS empresa,
      split_part(aa.matricula, '.', 2) AS matricula_base,
      split_part(aa.matricula, '.', 3) AS dep,
      row_number() OVER (
        PARTITION BY
          split_part(aa.matricula, '.', 1),
          split_part(aa.matricula, '.', 2),
          split_part(aa.matricula, '.', 3),
          date(aa.data_execucao),
          aa.codigo_tuss
        ORDER BY aa.data_execucao
      ) AS ordem_autorizacao
    FROM public.autorizacoes_assim aa
  )
  SELECT DISTINCT ON (s.bloco_id)
    s.bloco_id,
    a.guia,
    a.status,
    a.codigo_erro,
    a.descricao_erro,
    a.data_execucao,
    a.updated_at,
    (EXTRACT(epoch FROM ((a.data_execucao)::time WITHOUT TIME ZONE - s.hora_inicial)) / 60) AS diferenca_minutos
  FROM sessoes s
  LEFT JOIN autorizacoes a ON (
    a.empresa            = s.empresa
    AND a.matricula_base = s.matricula
    AND a.dep            = s.dep
    AND date(a.data_execucao) = s.data_atendimento
    AND a.codigo_tuss    = s.codigo_tuss
    AND a.ordem_autorizacao = s.ordem_sessao
  )
  ORDER BY s.bloco_id, a.updated_at DESC
)
SELECT
  b.bloco_id,
  b.paciente_id,
  b.paciente_nome,
  b.empresa,
  b.matricula,
  b.dep,
  b.carteirinha,
  b.data_atendimento,
  b.hora_inicial,
  b.codigo_tuss,
  b.convenio_nome,
  b.terapias,
  b.profissionais,
  b.quantidade_sessoes,
  mt.guia,
  mt.status          AS status_assim,
  mt.codigo_erro,
  mt.descricao_erro,
  mt.data_execucao,
  mt.updated_at      AS autorizacao_updated_at,
  mt.diferenca_minutos,

  CASE
    WHEN (mt.codigo_erro IS NOT NULL OR (mt.status IS NOT NULL AND mt.status <> ALL(ARRAY['Liberado'::text, 'Liberado *'::text])))
      THEN 'GLOSA'::text
    WHEN mt.status = 'Liberado *'::text
      THEN 'CANCELADA'::text
    WHEN mt.status = 'Liberado'::text
      THEN 'LIBERADA'::text
    WHEN fo.matricula IS NOT NULL
      AND fo.ultimo_updated_at IS NOT NULL
      AND (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
      THEN 'SINCRONIZANDO'::text
    WHEN fo.matricula IS NOT NULL
      AND (fo.ultimo_updated_at IS NULL OR (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
      THEN 'RETORNO_NAO_CONFIRMADO'::text
    ELSE 'NAO_SOLICITADA'::text
  END AS situacao,

  CASE
    WHEN (mt.codigo_erro IS NOT NULL OR (mt.status IS NOT NULL AND mt.status <> ALL(ARRAY['Liberado'::text, 'Liberado *'::text])))
      THEN 2
    WHEN mt.status = 'Liberado *'::text THEN 5
    WHEN mt.status = 'Liberado'::text   THEN 6
    WHEN fo.matricula IS NOT NULL
      AND fo.ultimo_updated_at IS NOT NULL
      AND (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
      THEN 4
    WHEN fo.matricula IS NOT NULL
      AND (fo.ultimo_updated_at IS NULL OR (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
      THEN 3
    ELSE 1
  END AS prioridade,

  (CURRENT_DATE - b.data_atendimento) AS dias_atraso,

  CASE WHEN mt.status = 'Liberado'::text THEN true ELSE false END AS possui_autorizacao,
  CASE WHEN fo.matricula IS NOT NULL     THEN true ELSE false END AS possui_solicitacao,

  CASE
    WHEN (mt.codigo_erro IS NOT NULL OR (mt.status IS NOT NULL AND mt.status <> ALL(ARRAY['Liberado'::text, 'Liberado *'::text])))
      THEN concat(
        'Glosa: ',
        COALESCE(mt.codigo_erro, mt.status, 'Erro não identificado'::text),
        CASE WHEN mt.descricao_erro IS NOT NULL THEN concat(' - ', mt.descricao_erro) ELSE ''::text END
      )
    WHEN mt.status = 'Liberado'::text
      THEN 'Autorização confirmada pela ASSIM'::text
    WHEN mt.status = 'Liberado *'::text
      THEN 'Autorização cancelada'::text
    WHEN fo.matricula IS NOT NULL
      AND fo.ultimo_updated_at IS NOT NULL
      AND (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
      THEN 'Solicitação enviada. Aguardando sincronização com a ASSIM.'::text
    WHEN fo.matricula IS NOT NULL
      AND (fo.ultimo_updated_at IS NULL OR (NOW() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
      THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'::text
    ELSE 'Nenhuma solicitação encontrada'::text
  END AS observacao

FROM (
  public.vw_blocos_autorizaveis_assim b
  LEFT JOIN match_temporal mt ON (mt.bloco_id = b.bloco_id)
  LEFT JOIN fila_operacional fo ON (
    fo.empresa              = b.empresa
    AND fo.matricula        = b.matricula
    AND fo.dep              = b.dep
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  )
);
