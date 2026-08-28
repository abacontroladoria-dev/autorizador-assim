-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Identico a supabase/migrations/20260820140000_motivo_glosa_do_recibo_auditoria.sql
--
-- Faz o motivo da recusa lido pelo robo no recibo do aceite ("1013-CADASTRO DO
-- BENEFICIARIO COM PROBLEMAS", gravado em fila_autorizacoes.status_assim) chegar
-- a auditoria decomposto em codigo_erro/descricao_erro, e entrar na observacao
-- no lugar de "Erro nao identificado".
--
-- CREATE OR REPLACE: a assinatura nao muda, nenhum grant se perde, e
-- get_auditoria_assim / get_tokens_mensal herdam a mudanca.
--
-- ORDEM: so tem efeito depois de snippets/20260813_glosa_no_aceite.sql (e ele
-- que ensina robo_concluir_tarefa a aceitar 'glosa' e a gravar p_status_assim).
-- Rodar antes disso nao quebra nada, apenas nao tem o que mostrar.
--
-- Depois de rodar, registrar no livro-caixa (bloco final).

-- =============================================================================
-- 20260820140000_motivo_glosa_do_recibo_auditoria.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_auditoria_assim_periodo(p_data_inicio date, p_data_fim date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text, criado_por text, forma_autorizacao text, horario_autorizacao timestamp without time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
        public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
      FROM agenda_tita at
      WHERE at.data_atendimento BETWEEN p_data_inicio AND p_data_fim
        AND at.ativo = true
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
          AND f.data_atendimento = a.data_atendimento
          AND f.horario = a.hora_inicial
          AND (
            -- `status_assim` deixou de ser só rótulo curto: numa linha em
            -- 'glosa' ele guarda o motivo por extenso, e um motivo como
            -- "FALTA DE COBERTURA CONTRATUAL" casaria com este LIKE. A sessão
            -- inteira sumiria da auditoria — sem erro, sem linha, sem aviso —
            -- justamente quando mais precisa ser vista. Linha em glosa não é
            -- falta, então o teste de texto não se aplica a ela.
            (f.status IS DISTINCT FROM 'glosa'
             AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
          )
      )
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
        AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
        AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
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
    SELECT DISTINCT ON (f.paciente_id, f.data_atendimento, f.horario, f.tuss)
      f.empresa, f.matricula, f.dep, f.paciente_id, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      COALESCE(f.updated_at, f.created_at) AS ultimo_updated_at,
      f.criado_por,
      f.forma_autorizacao,
      f.horario_autorizacao,
      f.status,
      f.status_assim,
      f.numero_autorizacao,
      f.error_message,
      -- ── Motivo da recusa lido pelo robô no recibo do aceite ────────────────
      -- Só de linha em 'glosa': `status_assim` também guarda 'Liberado',
      -- 'Liberado *' e os rótulos de falta, e nenhum deles é motivo de recusa.
      --
      -- O robô grava "1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS": código,
      -- hífen, texto. O código só é extraído quando o texto realmente começa
      -- com o padrão numérico — recusa sem código (o fallback do rpa.js) cai
      -- com código nulo e a descrição inteira preservada, em vez de virar um
      -- "código" que é a primeira palavra da frase.
      CASE
        WHEN f.status = 'glosa' AND f.status_assim ~ '^\s*\d{3,5}\s*-'
          THEN btrim(split_part(f.status_assim, '-', 1))
      END AS glosa_codigo,
      CASE
        WHEN f.status = 'glosa'
          THEN nullif(btrim(regexp_replace(f.status_assim, '^\s*\d{3,5}\s*-\s*', '')), '')
      END AS glosa_descricao
    FROM fila_autorizacoes f
    WHERE f.data_atendimento BETWEEN p_data_inicio AND p_data_fim
      AND NOT (
        -- Mesma ressalva de `agenda_sem_falta`: um motivo de recusa que contenha
        -- a palavra FALTA descartaria a própria linha que traz o motivo, e a
        -- sessão voltaria a aparecer como "Não Solicitada".
        (f.status IS DISTINCT FROM 'glosa'
         AND upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%')
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
    ORDER BY f.paciente_id, f.data_atendimento, f.horario, f.tuss,
             COALESCE(f.updated_at, f.created_at) DESC
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
      WHERE date(aa.data_execucao) BETWEEN p_data_inicio AND p_data_fim
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao, a.updated_at,
      a.teve_token, a.token,
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
    COALESCE(mt.guia, fo.numero_autorizacao)               AS guia,
    COALESCE(mt.status, fo.status_assim)                   AS status_assim,
    -- Relatório primeiro, recibo depois: os dois falam o mesmo vocabulário, e o
    -- recibo é o que vale enquanto o relatório não chega.
    COALESCE(mt.codigo_erro, fo.glosa_codigo)              AS codigo_erro,
    COALESCE(mt.descricao_erro, fo.glosa_descricao, fo.error_message) AS descricao_erro,
    -- AT TIME ZONE explicito: a coluna de origem e `timestamp WITHOUT time
    -- zone` com hora de Sao Paulo, e o tipo de saida e `WITH time zone`.
    -- Sem a conversao o Postgres carimba o horario local como UTC (a sessao
    -- do Supabase roda em UTC) e o navegador subtrai 3h na exibicao.
    mt.data_execucao AT TIME ZONE 'America/Sao_Paulo'     AS data_execucao,
    mt.updated_at    AT TIME ZONE 'America/Sao_Paulo'     AS autorizacao_updated_at,
    mt.diferenca_minutos,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
                                                          THEN 'GLOSA'
      WHEN mt.status = 'Liberado *'                      THEN 'CANCELADA'
      WHEN mt.status = 'Liberado'                        THEN 'LIBERADA'
      WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL
                                                          THEN 'LIBERADA'
      WHEN fo.status IN ('erro', 'glosa')                 THEN 'GLOSA'
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
                                                          THEN 'SINCRONIZANDO'
      WHEN fo.paciente_id IS NOT NULL
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
      WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL THEN 6
      WHEN fo.status IN ('erro', 'glosa')                 THEN 2
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes' THEN 4
      WHEN fo.paciente_id IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes') THEN 3
      ELSE 1
    END                                                   AS prioridade,
    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
    ((mt.status = 'Liberado')
      OR (fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL))
                                                          AS possui_autorizacao,
    (fo.paciente_id IS NOT NULL)                          AS possui_solicitacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
        THEN concat('Glosa: ',
               COALESCE(mt.codigo_erro, mt.status, 'Erro não identificado'),
               CASE WHEN mt.descricao_erro IS NOT NULL THEN concat(' - ', mt.descricao_erro) ELSE '' END)
      WHEN mt.status = 'Liberado' AND mt.teve_token = true
        THEN concat('TOKEN - ', mt.token)
      WHEN mt.status = 'Liberado'    THEN 'Autorização confirmada pela ASSIM'
      WHEN mt.status = 'Liberado *'  THEN 'Autorização cancelada'
      WHEN fo.status = 'concluido' AND fo.numero_autorizacao IS NOT NULL
        THEN 'Autorização confirmada pela ASSIM'
      -- Mesma forma do ramo do relatório ("Glosa: 1013 - CADASTRO ..."), para a
      -- legenda do card não mudar de gramática conforme a fonte da recusa.
      -- `error_message` continua como último recurso: em 'erro' ele é o que
      -- existe, e numa glosa sem motivo identificado ele ao menos diz o que o
      -- robô viu.
      WHEN fo.status IN ('erro', 'glosa')
        THEN concat('Glosa: ',
               COALESCE(
                 nullif(concat_ws(' - ', fo.glosa_codigo, fo.glosa_descricao), ''),
                 fo.error_message,
                 'Erro não identificado'))
      WHEN fo.paciente_id IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
        THEN 'Solicitação enviada.'
      WHEN fo.paciente_id IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
        THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'
      ELSE 'Nenhuma solicitação encontrada'
    END                                                   AS observacao,
    agm.motivo_glosa,
    mt.teve_token,
    mt.token,
    fo.criado_por,
    fo.forma_autorizacao,
    fo.horario_autorizacao
  FROM blocos_auditoria b
  LEFT JOIN match_temporal mt        ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  LEFT JOIN auditoria_glosa_motivos agm ON agm.bloco_id = b.bloco_id
  WHERE COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY prioridade, hora_inicial
$function$
;


-- =============================================================================
-- Conferencia 1: linhas de glosa vindas do recibo do aceite (sem relatorio
-- ainda). Esperado: codigo_erro e descricao_erro preenchidos, e a observacao
-- no formato "Glosa: 1013 - CADASTRO DO BENEFICIARIO COM PROBLEMAS".
-- Trocar a data se nao houver linha.
-- =============================================================================
SELECT paciente_nome, hora_inicial, situacao, status_assim,
       codigo_erro, descricao_erro, observacao
  FROM public.get_auditoria_assim(CURRENT_DATE)
 WHERE situacao = 'GLOSA'
 ORDER BY hora_inicial
 LIMIT 20;

-- =============================================================================
-- Conferencia 2: materia-prima. Se isto vier vazio, nao existe glosa lida no
-- recibo no dia — a Conferencia 1 nao tem o que mostrar, e nao e defeito desta
-- funcao (ver ORDEM no cabecalho).
-- =============================================================================
SELECT data_atendimento, horario, status, status_assim, error_message
  FROM public.fila_autorizacoes
 WHERE status = 'glosa'
 ORDER BY COALESCE(updated_at, created_at) DESC
 LIMIT 20;

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260820140000', 'motivo_glosa_do_recibo_auditoria')
ON CONFLICT (version) DO NOTHING;
