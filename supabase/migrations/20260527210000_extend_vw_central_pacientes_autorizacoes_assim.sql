-- Estende vw_central_pacientes para exibir registros autorizados diretamente no ASSIM
-- que não passaram pela fila_autorizacoes.
--
-- Problema resolvido: sessões com ativo=false (substituídas na grade) já autorizadas
-- no ASSIM ficavam invisíveis porque agenda_tita_autorizacao filtra ativo=true.
--
-- Solução: a Parte 2 usa agenda_tita (sem filtro ativo) com o código TUSS calculado
-- inline, e usa ROW_NUMBER para parear o N-ésimo guia (por guia ASC) com o N-ésimo
-- slot (por hora_inicial ASC) dentro do mesmo grupo paciente/data/tuss — mesma lógica
-- de vw_match_autorizacoes_assim. Slots e guias já cobertos pela fila são excluídos
-- antes da numeração para garantir o pareamento correto.

drop view if exists "public"."vw_central_pacientes";

create view "public"."vw_central_pacientes" as

-- Parte 1: registros que passaram pela fila (comportamento original)
(
    SELECT DISTINCT ON (fa.id)
        fa.id,
        fa.agenda_id,
        fa.paciente_id,
        fa.paciente_nome,
        fa.data_atendimento,
        fa.horario,
        ((fa.data_atendimento::text || ' '::text) || fa.horario::text)::timestamp without time zone AS data_horario,
        fa.status,
        fa.status_assim,
        fa.tipo_falta,
        fa.completion_type,
        fa.numero_autorizacao,
        fa.machine_id,
        fa.error_message,
        fa.execution_time_ms,
        fa.created_at,
        fa.updated_at,
        fa.assim_updated_at,
        fa.horario_autorizacao,
        fa.terapia_exibicao_id,
        fa.terapia_nome AS classificacao_terapia,
        fa.forma_autorizacao,
        ag.hora_inicial,
        ag.hora_final,
        ag.profissional_nome,
        ag.profissional_id,
        ag.terapia_nome,
        ag.terapia_exibicao_nome,
        ag.sala_nome,
        ag.clinica_nome,
        ag.convenio_nome,
        ag.responsavel_nome,
        ag.responsavel_telefone,
        ag.numero_carteirinha,
        ag.sala_nome AS unidade,
        ag.convenio_nome AS convenio,
        maq.nome AS usuario_nome,
        CASE
            WHEN fa.status = 'erro'::text             THEN 'erro'::text
            WHEN fa.status = 'processando'::text      THEN 'processando'::text
            WHEN fa.tipo_falta = 'terapeuta'::text    THEN 'falta_terapeuta'::text
            WHEN fa.tipo_falta = 'paciente'::text     THEN 'falta_paciente'::text
            WHEN fa.status_assim = 'autorizado'::text THEN 'autorizado'::text
            WHEN fa.status = 'concluido'::text        THEN 'autorizado'::text
            WHEN fa.status = 'pendente'::text         THEN 'pendente'::text
            ELSE COALESCE(fa.status, 'pendente'::text)
        END AS status_operacional
    FROM public.fila_autorizacoes fa
    LEFT JOIN public.maquinas maq ON maq.id = fa.machine_id
    LEFT JOIN public.agenda_tita_autorizacao ag ON (
        fa.paciente_id::bigint = ag.paciente_id
        AND fa.data_atendimento = ag.data_atendimento
        AND fa.horario = ag.hora_inicial
        AND lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))
    )
    WHERE fa.id IS NOT NULL
      AND (fa.status IS NOT NULL OR fa.status_assim IS NOT NULL
           OR fa.numero_autorizacao IS NOT NULL OR fa.tipo_falta IS NOT NULL)
    ORDER BY fa.id, fa.created_at DESC NULLS LAST,
             ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST
)

UNION ALL

-- Parte 2: autorizados diretamente no ASSIM sem registro em fila_autorizacoes.
-- Usa ROW_NUMBER para parear N-ésimo guia ↔ N-ésimo slot (mesma lógica de vw_match_autorizacoes_assim).
-- Inclui sessões ativo=false (agenda_tita sem filtro) para cobrir slots substituídos na grade.
(
    SELECT
        p2.id,
        p2.agenda_id,
        p2.paciente_id,
        p2.paciente_nome,
        p2.data_atendimento,
        p2.horario,
        p2.data_horario,
        p2.status,
        p2.status_assim,
        p2.tipo_falta,
        p2.completion_type,
        p2.numero_autorizacao,
        p2.machine_id,
        p2.error_message,
        p2.execution_time_ms,
        p2.created_at,
        p2.updated_at,
        p2.assim_updated_at,
        p2.horario_autorizacao,
        p2.terapia_exibicao_id,
        p2.classificacao_terapia,
        p2.forma_autorizacao,
        p2.hora_inicial,
        p2.hora_final,
        p2.profissional_nome,
        p2.profissional_id,
        p2.terapia_nome,
        p2.terapia_exibicao_nome,
        p2.sala_nome,
        p2.clinica_nome,
        p2.convenio_nome,
        p2.responsavel_nome,
        p2.responsavel_telefone,
        p2.numero_carteirinha,
        p2.unidade,
        p2.convenio,
        p2.usuario_nome,
        p2.status_operacional
    FROM (
        WITH
        -- Todos os slots da agenda (ativo=true E ativo=false) com TUSS calculado inline
        agenda_com_tuss AS (
            SELECT
                at.id,
                at.paciente_id,
                at.paciente_nome,
                at.data_atendimento,
                at.hora_inicial,
                at.hora_final,
                at.profissional_id,
                at.profissional_nome,
                at.terapia_nome,
                at.terapia_exibicao_id,
                at.terapia_exibicao_nome,
                at.sala_nome,
                at.clinica_nome,
                at.convenio_nome,
                at.responsavel_nome,
                at.responsavel_telefone,
                at.numero_carteirinha,
                CASE
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text,'Psicologia ABA'::text,'Arteterapia'::text,'Arteterapia (Psicologia ABA)'::text,'Avaliação Neuropsicológica'::text,'Habilidades Sociais (Psicologia ABA)'::text]) THEN '22070384'::text
                    WHEN at.terapia_exibicao_nome = 'Fonoaudiologia'::text           THEN '22070397'::text
                    WHEN at.terapia_exibicao_nome = 'Psicomotricidade'::text         THEN '22070400'::text
                    WHEN at.terapia_exibicao_nome = 'Fisioterapia'::text             THEN '22070419'::text
                    WHEN at.terapia_exibicao_nome = 'Terapia Ocupacional'::text      THEN '22070427'::text
                    WHEN at.terapia_exibicao_nome = 'Psicopedagogia'::text           THEN '22070435'::text
                    WHEN at.terapia_exibicao_nome = 'Musicoterapia'::text            THEN '22070451'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text,'Terapia Alimentar'::text]) THEN '22070460'::text
                    WHEN at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text,'Fisioterapia Aquática'::text]) THEN '22070265'::text
                    WHEN at.terapia_exibicao_nome = 'Equoterapia'::text              THEN '22070257'::text
                    ELSE NULL::text
                END AS codigo_tuss
            FROM public.agenda_tita at
            WHERE at.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text,'Notificação Prévia'::text])
        ),
        -- Slots sem fila, numerados por hora_inicial ASC dentro do grupo paciente/data/tuss
        slots_sem_fila AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY paciente_id, data_atendimento, codigo_tuss
                    ORDER BY hora_inicial ASC
                ) AS ordem
            FROM agenda_com_tuss
            WHERE codigo_tuss IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.paciente_id::bigint = agenda_com_tuss.paciente_id
                    AND fa.data_atendimento = agenda_com_tuss.data_atendimento
                    AND fa.horario = agenda_com_tuss.hora_inicial
              )
        ),
        -- Guias sem fila (exclui guias já usados como numero_autorizacao na fila),
        -- numerados por guia ASC dentro do grupo paciente/data/tuss
        guias_sem_fila AS (
            SELECT
                aa.*,
                ROW_NUMBER() OVER (
                    PARTITION BY aa.paciente_id, aa.data_execucao::date, aa.codigo_tuss
                    ORDER BY aa.guia ASC
                ) AS ordem
            FROM public.autorizacoes_assim aa
            WHERE aa.codigo_tuss IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.numero_autorizacao = aa.guia
              )
        )
        SELECT
            (substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),1,8) ||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),9,4) ||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),13,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),17,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),21,12))::uuid AS id,
            NULL::uuid                AS agenda_id,
            s.paciente_id::text       AS paciente_id,
            s.paciente_nome,
            s.data_atendimento,
            s.hora_inicial            AS horario,
            (s.data_atendimento::text||' '::text||s.hora_inicial::text)::timestamp without time zone AS data_horario,
            'concluido'::text         AS status,
            'autorizado'::text        AS status_assim,
            NULL::text                AS tipo_falta,
            'automated'::text         AS completion_type,
            g.guia                    AS numero_autorizacao,
            NULL::text                AS machine_id,
            NULL::text                AS error_message,
            NULL::integer             AS execution_time_ms,
            g.data_autorizacao        AS created_at,
            g.updated_at,
            g.updated_at              AS assim_updated_at,
            g.data_autorizacao        AS horario_autorizacao,
            s.terapia_exibicao_id,
            s.terapia_nome            AS classificacao_terapia,
            'automatico'::text        AS forma_autorizacao,
            s.hora_inicial,
            s.hora_final,
            s.profissional_nome,
            s.profissional_id,
            s.terapia_nome,
            s.terapia_exibicao_nome,
            s.sala_nome,
            s.clinica_nome,
            s.convenio_nome,
            s.responsavel_nome,
            s.responsavel_telefone,
            s.numero_carteirinha,
            s.sala_nome               AS unidade,
            s.convenio_nome           AS convenio,
            NULL::text                AS usuario_nome,
            'autorizado'::text        AS status_operacional
        FROM slots_sem_fila s
        INNER JOIN guias_sem_fila g ON (
            g.paciente_id = s.paciente_id
            AND g.data_execucao::date = s.data_atendimento
            AND g.codigo_tuss = s.codigo_tuss
            AND g.ordem = s.ordem
        )
    ) p2
);
