-- Converte vw_auditoria_autorizacoes_assim em função parametrizada.
--
-- Problema: a view não tem filtro de data no CTE interno. O banco processa
-- 42.564 sessões históricas de agenda_tita para cada consulta, descartando
-- ~17.800 linhas só no CTE scan final. Tempo medido: 8.7 segundos.
--
-- Solução: aceitar p_data como parâmetro e empurrá-lo para dentro de cada
-- CTE. O planner passa a usar agenda_tita_data_idx para ~350 linhas do dia,
-- não para a tabela inteira.

CREATE OR REPLACE FUNCTION public.get_auditoria_assim(p_data date)
RETURNS TABLE(
  bloco_id              text,
  paciente_id           text,
  paciente_nome         text,
  empresa               text,
  matricula             text,
  dep                   text,
  carteirinha           text,
  data_atendimento      date,
  hora_inicial          time without time zone,
  codigo_tuss           text,
  convenio_nome         text,
  terapias              text,
  profissionais         text,
  quantidade_sessoes    bigint,
  guia                  text,
  status_assim          text,
  codigo_erro           text,
  descricao_erro        text,
  data_execucao         timestamp with time zone,
  autorizacao_updated_at timestamp with time zone,
  diferenca_minutos     numeric,
  situacao              text,
  prioridade            integer,
  dias_atraso           integer,
  possui_autorizacao    boolean,
  possui_solicitacao    boolean,
  observacao            text,
  motivo_glosa          text
)
LANGUAGE sql STABLE
AS $$
  WITH blocos_auditoria AS (
    WITH agenda_tita_tuss AS (
      SELECT
        at.paciente_id,
        at.paciente_nome,
        at.data_atendimento,
        at.hora_inicial,
        at.terapia_nome,
        at.terapia_exibicao_nome,
        at.profissional_nome,
        at.convenio_nome,
        at.numero_carteirinha,
        substring(at.numero_carteirinha, 1, 6)                                   AS empresa,
        substring(at.numero_carteirinha, 7, 7)                                   AS matricula,
        right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)           AS dep,
        CASE
          WHEN at.terapia_exibicao_nome = ANY (ARRAY[
               'Psicologia','Psicologia ABA','Arteterapia',
               'Arteterapia (Psicologia ABA)','Avaliação Neuropsicológica',
               'Habilidades Sociais (Psicologia ABA)'])                          THEN '22070384'
          WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'                      THEN '22070397'
          WHEN at.terapia_exibicao_nome = 'Psicomotricidade'                    THEN '22070400'
          WHEN at.terapia_exibicao_nome = 'Fisioterapia'                         THEN '22070419'
          WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional'                  THEN '22070427'
          WHEN at.terapia_exibicao_nome = 'Psicopedagogia'                       THEN '22070435'
          WHEN at.terapia_exibicao_nome = 'Musicoterapia'                        THEN '22070451'
          WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição','Terapia Alimentar']) THEN '22070460'
          WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia','Fisioterapia Aquática']) THEN '22070265'
          WHEN at.terapia_exibicao_nome = 'Equoterapia'                          THEN '22070257'
          ELSE NULL
        END AS codigo_tuss
      FROM agenda_tita at
      WHERE at.data_atendimento = p_data                       -- filtro empurrado para dentro
        AND at.convenio_nome ILIKE '%assim%'
        AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
    ),
    agenda_filtrada AS (
      SELECT a.*
      FROM agenda_tita_tuss a
      WHERE a.codigo_tuss IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM config_regras_terapias r
          WHERE r.categoria = 'BLACKLIST_AUTORIZACAO'
            AND r.ativo = true
            AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
        )
    ),
    agenda_sem_falta AS (
      SELECT a.*
      FROM agenda_filtrada a
      WHERE NOT EXISTS (
        SELECT 1 FROM fila_autorizacoes f
        WHERE f.paciente_id::bigint = a.paciente_id
          AND f.data_atendimento = p_data
          AND f.horario = a.hora_inicial
          AND (
            upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
          )
      )
    )
    SELECT
      concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
      asf.paciente_id::text,
      asf.paciente_nome,
      asf.empresa,
      asf.matricula,
      asf.dep,
      concat_ws('.', asf.empresa, asf.matricula, asf.dep) AS carteirinha,
      asf.data_atendimento,
      asf.hora_inicial,
      asf.codigo_tuss,
      asf.convenio_nome,
      string_agg(DISTINCT asf.terapia_exibicao_nome, ' | ' ORDER BY asf.terapia_exibicao_nome) AS terapias,
      string_agg(DISTINCT asf.profissional_nome,     ' | ' ORDER BY asf.profissional_nome)     AS profissionais,
      count(*) AS quantidade_sessoes
    FROM agenda_sem_falta asf
    GROUP BY asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
             asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
  ),
  fila_operacional AS (
    SELECT
      f.empresa, f.matricula, f.dep, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      max(COALESCE(f.updated_at, f.created_at)) AS ultimo_updated_at
    FROM fila_autorizacoes f
    WHERE f.data_atendimento = p_data                          -- filtro empurrado para dentro
      AND NOT (
        upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
    GROUP BY f.empresa, f.matricula, f.dep, f.data_atendimento, f.horario, f.tuss
  ),
  match_temporal AS (
    WITH sessoes AS (
      SELECT
        b1.bloco_id, b1.paciente_id, b1.paciente_nome, b1.empresa, b1.matricula, b1.dep,
        b1.carteirinha, b1.data_atendimento, b1.hora_inicial, b1.codigo_tuss,
        b1.convenio_nome, b1.terapias, b1.profissionais, b1.quantidade_sessoes,
        row_number() OVER (
          PARTITION BY b1.empresa, b1.matricula, b1.dep, b1.data_atendimento, b1.codigo_tuss
          ORDER BY b1.hora_inicial
        ) AS ordem_sessao
      FROM blocos_auditoria b1
    ),
    autorizacoes AS (
      SELECT
        aa.guia, aa.matricula, aa.paciente_nome, aa.data_execucao, aa.data_autorizacao,
        aa.status, aa.codigo_tuss, aa.codigo_erro, aa.descricao_erro,
        aa.teve_token, aa.updated_at, aa.token, aa.status_tratado, aa.matricula_limpa, aa.paciente_id,
        split_part(aa.matricula, '.', 1)               AS empresa,
        split_part(aa.matricula, '.', 2)               AS matricula_base,
        split_part(aa.matricula, '.', 3)               AS dep,
        row_number() OVER (
          PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                       split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
          ORDER BY aa.data_execucao
        ) AS ordem_autorizacao
      FROM autorizacoes_assim aa
      WHERE date(aa.data_execucao) = p_data             -- filtro empurrado para dentro
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao, a.updated_at,
      EXTRACT(epoch FROM a.data_execucao::time - s.hora_inicial) / 60 AS diferenca_minutos
    FROM sessoes s
    LEFT JOIN autorizacoes a
      ON  a.empresa        = s.empresa
      AND a.matricula_base  = s.matricula
      AND a.dep            = s.dep
      AND date(a.data_execucao) = s.data_atendimento
      AND a.codigo_tuss    = s.codigo_tuss
      AND a.ordem_autorizacao = s.ordem_sessao
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
    mt.status                                             AS status_assim,
    mt.codigo_erro,
    mt.descricao_erro,
    mt.data_execucao,
    mt.updated_at                                         AS autorizacao_updated_at,
    mt.diferenca_minutos,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
                                                          THEN 'GLOSA'
      WHEN mt.status = 'Liberado *'                      THEN 'CANCELADA'
      WHEN mt.status = 'Liberado'                        THEN 'LIBERADA'
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
                                                          THEN 'SINCRONIZANDO'
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
                                                          THEN 'RETORNO_NAO_CONFIRMADO'
      ELSE                                                     'NAO_SOLICITADA'
    END                                                   AS situacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *'])) THEN 2
      WHEN mt.status = 'Liberado *'                      THEN 5
      WHEN mt.status = 'Liberado'                        THEN 6
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes' THEN 4
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes') THEN 3
      ELSE 1
    END                                                   AS prioridade,
    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
    (mt.status = 'Liberado')                              AS possui_autorizacao,
    (fo.matricula IS NOT NULL)                            AS possui_solicitacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
        THEN concat('Glosa: ',
               COALESCE(mt.codigo_erro, mt.status, 'Erro não identificado'),
               CASE WHEN mt.descricao_erro IS NOT NULL THEN concat(' - ', mt.descricao_erro) ELSE '' END)
      WHEN mt.status = 'Liberado'    THEN 'Autorização confirmada pela ASSIM'
      WHEN mt.status = 'Liberado *'  THEN 'Autorização cancelada'
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
        THEN 'Solicitação enviada. Aguardando sincronização com a ASSIM.'
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
        THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'
      ELSE 'Nenhuma solicitação encontrada'
    END                                                   AS observacao,
    agm.motivo_glosa
  FROM blocos_auditoria b
  LEFT JOIN match_temporal mt        ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.empresa          = b.empresa
    AND fo.matricula        = b.matricula
    AND fo.dep              = b.dep
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  LEFT JOIN auditoria_glosa_motivos agm ON agm.bloco_id = b.bloco_id
  WHERE COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
  ORDER BY prioridade, hora_inicial
$$;

GRANT EXECUTE ON FUNCTION public.get_auditoria_assim(date) TO anon, authenticated;
