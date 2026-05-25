drop view if exists "public"."agenda_classificada";

drop view if exists "public"."vw_central_autorizacoes";

drop view if exists "public"."vw_central_pacientes";

drop view if exists "public"."vw_kpis_auditoria_assim";

drop view if exists "public"."vw_match_autorizacoes_assim";

drop view if exists "public"."vw_auditoria_autorizacoes_assim";

drop view if exists "public"."vw_blocos_autorizaveis_assim";

drop view if exists "public"."agenda_tita_autorizacao";

create or replace view "public"."agenda_classificada" as  SELECT id,
    paciente_id,
    paciente_nome,
    matricula,
    empresa,
    dep,
    data_atendimento,
    horario,
    terapia,
    tuss,
    crm,
    nome_medico,
    created_at,
    updated_at,
    ativo,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.fila_autorizacoes f
              WHERE ((f.matricula = a.matricula) AND (f.data_atendimento = a.data_atendimento) AND (f.tuss = a.tuss)))) THEN 'robo'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.autorizacoes_assim aa
              WHERE ((aa.matricula_limpa = a.matricula) AND ((aa.data_execucao)::date = a.data_atendimento) AND (aa.codigo_tuss = a.tuss) AND (abs((EXTRACT(epoch FROM ((aa.data_execucao)::time without time zone - a.horario)) / (60)::numeric)) <= (20)::numeric)))) THEN 'manual'::text
            ELSE 'pendente'::text
        END AS status
   FROM public.agenda_orbita a;


create or replace view "public"."agenda_tita_autorizacao" as  SELECT a.id,
    a.tita_agendamento_id,
    a.origem,
    a.data_atendimento,
    a.hora_inicial,
    a.hora_final,
    a.paciente_id,
    a.paciente_nome,
    a.cpf,
    a.data_nascimento,
    a.profissional_id,
    a.profissional_nome,
    a.profissional_cpf,
    a.terapia_id,
    a.terapia_nome,
    a.terapia_exibicao_id,
    a.terapia_exibicao_nome,
    a.sala_id,
    a.sala_nome,
    a.sala_observacoes,
    a.clinica_id,
    a.clinica_nome,
    a.convenio_id,
    a.convenio_nome,
    a.numero_carteirinha,
    a.responsavel_nome,
    a.responsavel_telefone,
    a.responsavel_email,
    a.atividade,
    a.ativo,
    a.raw_json,
    a.created_at,
    a.updated_at,
    "substring"(a.numero_carteirinha, 1, 6) AS empresa,
    "substring"(a.numero_carteirinha, 7, 7) AS matricula,
    "right"(regexp_replace(a.numero_carteirinha, '\D'::text, ''::text, 'g'::text), 2) AS dep,
    ao.crm,
    upper(replace(translate(COALESCE(ao.nome_medico, ''::text), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::text, 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::text), '.'::text, ''::text)) AS nome_medico,
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Fonoaudiologia'::text) THEN '22070397'::text
            WHEN (a.terapia_exibicao_nome = 'Psicomotricidade'::text) THEN '22070400'::text
            WHEN (a.terapia_exibicao_nome = 'Fisioterapia'::text) THEN '22070419'::text
            WHEN (a.terapia_exibicao_nome = 'Terapia Ocupacional'::text) THEN '22070427'::text
            WHEN (a.terapia_exibicao_nome = 'Psicopedagogia'::text) THEN '22070435'::text
            WHEN (a.terapia_exibicao_nome = 'Musicoterapia'::text) THEN '22070451'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text, 'Terapia Alimentar'::text])) THEN '22070460'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text, 'Fisioterapia Aquática'::text])) THEN '22070265'::text
            WHEN (a.terapia_exibicao_nome = 'Equoterapia'::text) THEN '22070257'::text
            ELSE NULL::text
        END AS codigo_tuss
   FROM (public.agenda_tita a
     LEFT JOIN LATERAL ( SELECT o.crm,
            o.nome_medico
           FROM public.agenda_orbita o
          WHERE (o.paciente_nome = a.paciente_nome)
         LIMIT 1) ao ON (true))
  WHERE ((a.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text])) AND (
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Fonoaudiologia'::text) THEN '22070397'::text
            WHEN (a.terapia_exibicao_nome = 'Psicomotricidade'::text) THEN '22070400'::text
            WHEN (a.terapia_exibicao_nome = 'Fisioterapia'::text) THEN '22070419'::text
            WHEN (a.terapia_exibicao_nome = 'Terapia Ocupacional'::text) THEN '22070427'::text
            WHEN (a.terapia_exibicao_nome = 'Psicopedagogia'::text) THEN '22070435'::text
            WHEN (a.terapia_exibicao_nome = 'Musicoterapia'::text) THEN '22070451'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text, 'Terapia Alimentar'::text])) THEN '22070460'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text, 'Fisioterapia Aquática'::text])) THEN '22070265'::text
            WHEN (a.terapia_exibicao_nome = 'Equoterapia'::text) THEN '22070257'::text
            ELSE NULL::text
        END IS NOT NULL));


create or replace view "public"."vw_blocos_autorizaveis_assim" as  WITH agenda_filtrada AS (
         SELECT a.id,
            a.tita_agendamento_id,
            a.origem,
            a.data_atendimento,
            a.hora_inicial,
            a.hora_final,
            a.paciente_id,
            a.paciente_nome,
            a.cpf,
            a.data_nascimento,
            a.profissional_id,
            a.profissional_nome,
            a.profissional_cpf,
            a.terapia_id,
            a.terapia_nome,
            a.terapia_exibicao_id,
            a.terapia_exibicao_nome,
            a.sala_id,
            a.sala_nome,
            a.sala_observacoes,
            a.clinica_id,
            a.clinica_nome,
            a.convenio_id,
            a.convenio_nome,
            a.numero_carteirinha,
            a.responsavel_nome,
            a.responsavel_telefone,
            a.responsavel_email,
            a.atividade,
            a.ativo,
            a.raw_json,
            a.created_at,
            a.updated_at,
            a.empresa,
            a.matricula,
            a.dep,
            a.crm,
            a.nome_medico,
            a.codigo_tuss
           FROM public.agenda_tita_autorizacao a
          WHERE ((a.convenio_nome ~~* '%assim%'::text) AND (NOT (EXISTS ( SELECT 1
                   FROM public.config_regras_terapias r
                  WHERE ((r.categoria = 'BLACKLIST_AUTORIZACAO'::text) AND (r.ativo = true) AND (a.terapia_nome ~~* (('%'::text || r.terapia_nome) || '%'::text)))))))
        ), agenda_sem_falta AS (
         SELECT a.id,
            a.tita_agendamento_id,
            a.origem,
            a.data_atendimento,
            a.hora_inicial,
            a.hora_final,
            a.paciente_id,
            a.paciente_nome,
            a.cpf,
            a.data_nascimento,
            a.profissional_id,
            a.profissional_nome,
            a.profissional_cpf,
            a.terapia_id,
            a.terapia_nome,
            a.terapia_exibicao_id,
            a.terapia_exibicao_nome,
            a.sala_id,
            a.sala_nome,
            a.sala_observacoes,
            a.clinica_id,
            a.clinica_nome,
            a.convenio_id,
            a.convenio_nome,
            a.numero_carteirinha,
            a.responsavel_nome,
            a.responsavel_telefone,
            a.responsavel_email,
            a.atividade,
            a.ativo,
            a.raw_json,
            a.created_at,
            a.updated_at,
            a.empresa,
            a.matricula,
            a.dep,
            a.crm,
            a.nome_medico,
            a.codigo_tuss
           FROM agenda_filtrada a
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.fila_autorizacoes f
                  WHERE (((f.paciente_id)::bigint = a.paciente_id) AND (f.data_atendimento = a.data_atendimento) AND (f.horario = a.hora_inicial) AND ((upper(COALESCE(f.status_assim, ''::text)) ~~ '%FALTA%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%PACIENTE%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%TERAPEUTA%'::text))))))
        )
 SELECT concat_ws('_'::text, paciente_id, data_atendimento, codigo_tuss, hora_inicial) AS bloco_id,
    paciente_id,
    paciente_nome,
    empresa,
    matricula,
    dep,
    concat_ws('.'::text, empresa, matricula, dep) AS carteirinha,
    data_atendimento,
    hora_inicial,
    codigo_tuss,
    convenio_nome,
    string_agg(DISTINCT terapia_exibicao_nome, ' | '::text ORDER BY terapia_exibicao_nome) AS terapias,
    string_agg(DISTINCT profissional_nome, ' | '::text ORDER BY profissional_nome) AS profissionais,
    count(*) AS quantidade_sessoes
   FROM agenda_sem_falta
  GROUP BY paciente_id, paciente_nome, empresa, matricula, dep, data_atendimento, hora_inicial, codigo_tuss, convenio_nome;


create or replace view "public"."vw_central_pacientes" as  SELECT DISTINCT ON (fa.id) fa.id,
    fa.agenda_id,
    fa.paciente_id,
    fa.paciente_nome,
    fa.data_atendimento,
    fa.horario,
    ((((fa.data_atendimento)::text || ' '::text) || (fa.horario)::text))::timestamp without time zone AS data_horario,
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
            WHEN (fa.status = 'erro'::text) THEN 'erro'::text
            WHEN (fa.status = 'processando'::text) THEN 'processando'::text
            WHEN (fa.tipo_falta = 'terapeuta'::text) THEN 'falta_terapeuta'::text
            WHEN (fa.tipo_falta = 'paciente'::text) THEN 'falta_paciente'::text
            WHEN (fa.status_assim = 'autorizado'::text) THEN 'autorizado'::text
            WHEN (fa.status = 'concluido'::text) THEN 'autorizado'::text
            WHEN (fa.status = 'pendente'::text) THEN 'pendente'::text
            ELSE COALESCE(fa.status, 'pendente'::text)
        END AS status_operacional
   FROM ((public.fila_autorizacoes fa
     LEFT JOIN public.maquinas maq ON ((maq.id = fa.machine_id)))
     LEFT JOIN public.agenda_tita_autorizacao ag ON ((((fa.paciente_id)::bigint = ag.paciente_id) AND (fa.data_atendimento = ag.data_atendimento) AND (fa.horario = ag.hora_inicial) AND (lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))))))
  WHERE ((fa.id IS NOT NULL) AND ((fa.status IS NOT NULL) OR (fa.status_assim IS NOT NULL) OR (fa.numero_autorizacao IS NOT NULL) OR (fa.tipo_falta IS NOT NULL)))
  ORDER BY fa.id, fa.created_at DESC NULLS LAST, ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST;


create or replace view "public"."vw_match_autorizacoes_assim" as  WITH blocos_operacionais AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            ag.cpf,
            ag.data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial,
            ag.codigo_tuss,
            ag.matricula,
            ag.dep,
            min(ag.tita_agendamento_id) AS tita_agendamento_id,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            row_number() OVER (PARTITION BY ag.matricula, ag.dep, ag.data_atendimento, ag.codigo_tuss ORDER BY ag.hora_inicial) AS ordem_consumo
           FROM public.agenda_tita_autorizacao ag
          WHERE ((ag.data_atendimento = (timezone('America/Sao_Paulo'::text, now()))::date) AND (lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, ag.cpf, ag.data_nascimento, ag.data_atendimento, ag.hora_inicial, ag.codigo_tuss, ag.matricula, ag.dep
        ), consumos_falta AS (
         SELECT DISTINCT bo.matricula,
            bo.dep,
            bo.data_atendimento,
            bo.codigo_tuss,
            bo.ordem_consumo
           FROM (blocos_operacionais bo
             JOIN public.fila_autorizacoes fa ON (((fa.matricula = bo.matricula) AND (COALESCE(fa.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (fa.data_atendimento = bo.data_atendimento) AND (fa.horario = bo.hora_inicial) AND (fa.status = 'falta'::text))))
        ), autorizacoes_numeradas AS (
         SELECT aa.guia,
            aa.paciente_id,
            aa.paciente_nome,
            aa.matricula_limpa AS matricula,
            "right"(aa.matricula, 2) AS dep,
            aa.codigo_tuss,
            aa.status AS status_assim,
            aa.data_execucao,
            date(aa.data_execucao) AS data_atendimento,
            row_number() OVER (PARTITION BY aa.matricula_limpa, ("right"(aa.matricula, 2)), (date(aa.data_execucao)), aa.codigo_tuss ORDER BY aa.data_execucao) AS ordem_autorizacao
           FROM public.autorizacoes_assim aa
          WHERE (date(aa.data_execucao) = (timezone('America/Sao_Paulo'::text, now()))::date)
        ), matches_externos AS (
         SELECT bo.tita_agendamento_id,
            bo.paciente_id,
            bo.paciente_nome,
            bo.cpf,
            bo.data_nascimento,
            bo.data_atendimento,
            bo.hora_inicial,
            bo.codigo_tuss,
            an.guia,
            an.data_execucao,
            an.status_assim,
            true AS consome_autorizacao,
            bo.ordem_consumo,
            an.ordem_autorizacao
           FROM (blocos_operacionais bo
             JOIN autorizacoes_numeradas an ON (((an.matricula = bo.matricula) AND (COALESCE(an.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (an.data_atendimento = bo.data_atendimento) AND (an.codigo_tuss = bo.codigo_tuss) AND (an.ordem_autorizacao = bo.ordem_consumo))))
        ), matches_falta AS (
         SELECT bo.tita_agendamento_id,
            bo.paciente_id,
            bo.paciente_nome,
            bo.cpf,
            bo.data_nascimento,
            bo.data_atendimento,
            bo.hora_inicial,
            bo.codigo_tuss,
            NULL::text AS guia,
            NULL::timestamp without time zone AS data_execucao,
            'falta'::text AS status_assim,
            true AS consome_autorizacao,
            bo.ordem_consumo,
            NULL::bigint AS ordem_autorizacao
           FROM (blocos_operacionais bo
             JOIN consumos_falta cf ON (((cf.matricula = bo.matricula) AND (COALESCE(cf.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (cf.data_atendimento = bo.data_atendimento) AND (cf.codigo_tuss = bo.codigo_tuss) AND (cf.ordem_consumo = bo.ordem_consumo))))
        )
 SELECT matches_externos.tita_agendamento_id,
    matches_externos.paciente_id,
    matches_externos.paciente_nome,
    matches_externos.cpf,
    matches_externos.data_nascimento,
    matches_externos.data_atendimento,
    matches_externos.hora_inicial,
    matches_externos.codigo_tuss,
    matches_externos.guia,
    matches_externos.data_execucao,
    matches_externos.status_assim,
    matches_externos.consome_autorizacao,
    matches_externos.ordem_consumo,
    matches_externos.ordem_autorizacao
   FROM matches_externos
UNION ALL
 SELECT matches_falta.tita_agendamento_id,
    matches_falta.paciente_id,
    matches_falta.paciente_nome,
    matches_falta.cpf,
    matches_falta.data_nascimento,
    matches_falta.data_atendimento,
    matches_falta.hora_inicial,
    matches_falta.codigo_tuss,
    matches_falta.guia,
    matches_falta.data_execucao,
    matches_falta.status_assim,
    matches_falta.consome_autorizacao,
    matches_falta.ordem_consumo,
    matches_falta.ordem_autorizacao
   FROM matches_falta;


create or replace view "public"."vw_auditoria_autorizacoes_assim" as  WITH fila_operacional AS (
         SELECT DISTINCT f.empresa,
            f.matricula,
            f.dep,
            f.data_atendimento,
            f.horario,
            f.tuss AS codigo_tuss
           FROM public.fila_autorizacoes f
          WHERE (NOT ((upper(COALESCE(f.status_assim, ''::text)) ~~ '%FALTA%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%PACIENTE%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%TERAPEUTA%'::text)))
        ), match_temporal AS (
         WITH sessoes AS (
                 SELECT b_1.bloco_id,
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
                    row_number() OVER (PARTITION BY b_1.empresa, b_1.matricula, b_1.dep, b_1.data_atendimento, b_1.codigo_tuss ORDER BY b_1.hora_inicial) AS ordem_sessao
                   FROM public.vw_blocos_autorizaveis_assim b_1
                ), autorizacoes AS (
                 SELECT aa.guia,
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
                    split_part(aa.matricula, '.'::text, 1) AS empresa,
                    split_part(aa.matricula, '.'::text, 2) AS matricula_base,
                    split_part(aa.matricula, '.'::text, 3) AS dep,
                    row_number() OVER (PARTITION BY (split_part(aa.matricula, '.'::text, 1)), (split_part(aa.matricula, '.'::text, 2)), (split_part(aa.matricula, '.'::text, 3)), (date(aa.data_execucao)), aa.codigo_tuss ORDER BY aa.data_execucao) AS ordem_autorizacao
                   FROM public.autorizacoes_assim aa
                )
         SELECT DISTINCT ON (s.bloco_id) s.bloco_id,
            a.guia,
            a.status,
            a.codigo_erro,
            a.descricao_erro,
            a.data_execucao,
            a.updated_at,
            (EXTRACT(epoch FROM ((a.data_execucao)::time without time zone - s.hora_inicial)) / (60)::numeric) AS diferenca_minutos
           FROM (sessoes s
             LEFT JOIN autorizacoes a ON (((a.empresa = s.empresa) AND (a.matricula_base = s.matricula) AND (a.dep = s.dep) AND (date(a.data_execucao) = s.data_atendimento) AND (a.codigo_tuss = s.codigo_tuss) AND (a.ordem_autorizacao = s.ordem_sessao))))
          ORDER BY s.bloco_id, a.updated_at DESC
        )
 SELECT b.bloco_id,
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
    mt.status AS status_assim,
    mt.codigo_erro,
    mt.descricao_erro,
    mt.data_execucao,
    mt.updated_at AS autorizacao_updated_at,
    mt.diferenca_minutos,
        CASE
            WHEN ((mt.codigo_erro IS NOT NULL) OR ((mt.status IS NOT NULL) AND (mt.status <> ALL (ARRAY['Liberado'::text, 'Liberado *'::text])))) THEN 'GLOSA'::text
            WHEN (mt.status = 'Liberado *'::text) THEN 'CANCELADA'::text
            WHEN (mt.status = 'Liberado'::text) THEN 'LIBERADA'::text
            WHEN (fo.matricula IS NOT NULL) THEN 'AGUARDANDO_RETORNO'::text
            ELSE 'NAO_SOLICITADA'::text
        END AS situacao,
        CASE
            WHEN ((mt.codigo_erro IS NOT NULL) OR ((mt.status IS NOT NULL) AND (mt.status <> ALL (ARRAY['Liberado'::text, 'Liberado *'::text])))) THEN 2
            WHEN (mt.status = 'Liberado *'::text) THEN 4
            WHEN (mt.status = 'Liberado'::text) THEN 5
            WHEN (fo.matricula IS NOT NULL) THEN 3
            ELSE 1
        END AS prioridade,
    (CURRENT_DATE - b.data_atendimento) AS dias_atraso,
        CASE
            WHEN (mt.status = 'Liberado'::text) THEN true
            ELSE false
        END AS possui_autorizacao,
        CASE
            WHEN (fo.matricula IS NOT NULL) THEN true
            ELSE false
        END AS possui_solicitacao,
        CASE
            WHEN ((mt.codigo_erro IS NOT NULL) OR ((mt.status IS NOT NULL) AND (mt.status <> ALL (ARRAY['Liberado'::text, 'Liberado *'::text])))) THEN concat('Glosa: ', COALESCE(mt.codigo_erro, mt.status, 'Erro não identificado'::text),
            CASE
                WHEN (mt.descricao_erro IS NOT NULL) THEN concat(' - ', mt.descricao_erro)
                ELSE ''::text
            END)
            WHEN (mt.status = 'Liberado'::text) THEN 'Autorização confirmada pela ASSIM'::text
            WHEN (mt.status = 'Liberado *'::text) THEN 'Autorização cancelada'::text
            WHEN (fo.matricula IS NOT NULL) THEN 'Solicitação enviada aguardando retorno da ASSIM'::text
            ELSE 'Nenhuma solicitação encontrada'::text
        END AS observacao
   FROM ((public.vw_blocos_autorizaveis_assim b
     LEFT JOIN match_temporal mt ON ((mt.bloco_id = b.bloco_id)))
     LEFT JOIN fila_operacional fo ON (((fo.empresa = b.empresa) AND (fo.matricula = b.matricula) AND (fo.dep = b.dep) AND (fo.data_atendimento = b.data_atendimento) AND (fo.codigo_tuss = b.codigo_tuss) AND (fo.horario = b.hora_inicial))));


create or replace view "public"."vw_central_autorizacoes" as  WITH base AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            ag.cpf,
            ag.data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial AS horario,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            array_agg(DISTINCT ag.sala_nome) AS sala_nome,
            array_agg(DISTINCT ag.profissional_nome) AS profissionais,
            array_agg(DISTINCT ag.codigo_tuss) AS codigos_tuss,
            array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
            ag.convenio_nome,
            ag.convenio_id,
            ag.empresa,
            ag.matricula,
            ag.dep,
            ag.crm,
            ag.nome_medico
           FROM public.agenda_tita_autorizacao ag
          WHERE ((lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, ag.cpf, ag.data_nascimento, ag.data_atendimento, ag.hora_inicial, ag.convenio_nome, ag.convenio_id, ag.empresa, ag.matricula, ag.dep, ag.crm, ag.nome_medico
        ), match_assim AS (
         SELECT DISTINCT vw_match_autorizacoes_assim.paciente_id,
            vw_match_autorizacoes_assim.data_atendimento,
            vw_match_autorizacoes_assim.hora_inicial AS horario,
            vw_match_autorizacoes_assim.status_assim,
            vw_match_autorizacoes_assim.data_execucao
           FROM public.vw_match_autorizacoes_assim
        ), ultima_fila AS (
         SELECT DISTINCT ON (fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario) fila_autorizacoes.paciente_id,
            fila_autorizacoes.data_atendimento,
            fila_autorizacoes.horario,
            fila_autorizacoes.status,
            fila_autorizacoes.horario_autorizacao,
            fila_autorizacoes.created_at
           FROM public.fila_autorizacoes
          ORDER BY fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario, fila_autorizacoes.created_at DESC
        )
 SELECT b.paciente_id,
    b.paciente_nome,
    b.cpf,
    b.data_nascimento,
    b.data_atendimento,
    b.horario,
    b.terapias,
    b.sala_nome,
    b.profissionais,
    b.codigos_tuss,
    b.agendamentos,
    b.convenio_nome,
    b.convenio_id,
    b.empresa,
    b.matricula,
    b.dep,
    b.crm,
    b.nome_medico,
    uf.horario_autorizacao,
    ( SELECT max(ma2.data_execucao) AS max
           FROM match_assim ma2
          WHERE ((ma2.paciente_id = b.paciente_id) AND (ma2.data_atendimento = b.data_atendimento) AND (ma2.horario < b.horario))) AS ultima_autorizacao_anterior,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN 'autorizado_externo'::text
            WHEN (uf.status = 'concluido'::text) THEN 'concluido'::text
            WHEN (uf.status = 'falta'::text) THEN 'falta'::text
            WHEN (uf.status = 'processando'::text) THEN 'processando'::text
            WHEN (uf.status = 'pendente'::text) THEN 'pendente'::text
            WHEN (uf.status = 'erro'::text) THEN 'erro'::text
            ELSE 'sem_acao'::text
        END AS status_final,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN false
            WHEN (uf.status = ANY (ARRAY['concluido'::text, 'falta'::text])) THEN false
            ELSE true
        END AS mostrar_na_tela,
        CASE
            WHEN (lower(COALESCE(b.convenio_nome, ''::text)) ~~ '%assim%'::text) THEN 'autorizacao'::text
            ELSE 'presenca'::text
        END AS tipo_fluxo
   FROM ((base b
     LEFT JOIN match_assim ma ON (((ma.paciente_id = b.paciente_id) AND (ma.data_atendimento = b.data_atendimento) AND (ma.horario = b.horario))))
     LEFT JOIN ultima_fila uf ON ((((uf.paciente_id)::bigint = b.paciente_id) AND (uf.data_atendimento = b.data_atendimento) AND (uf.horario = b.horario))));


create or replace view "public"."vw_kpis_auditoria_assim" as  WITH auditoria AS (
         SELECT vw_auditoria_autorizacoes_assim.bloco_id,
            vw_auditoria_autorizacoes_assim.paciente_id,
            vw_auditoria_autorizacoes_assim.paciente_nome,
            vw_auditoria_autorizacoes_assim.empresa,
            vw_auditoria_autorizacoes_assim.matricula,
            vw_auditoria_autorizacoes_assim.dep,
            vw_auditoria_autorizacoes_assim.carteirinha,
            vw_auditoria_autorizacoes_assim.data_atendimento,
            vw_auditoria_autorizacoes_assim.hora_inicial,
            vw_auditoria_autorizacoes_assim.codigo_tuss,
            vw_auditoria_autorizacoes_assim.convenio_nome,
            vw_auditoria_autorizacoes_assim.terapias,
            vw_auditoria_autorizacoes_assim.profissionais,
            vw_auditoria_autorizacoes_assim.quantidade_sessoes,
            vw_auditoria_autorizacoes_assim.guia,
            vw_auditoria_autorizacoes_assim.status_assim,
            vw_auditoria_autorizacoes_assim.codigo_erro,
            vw_auditoria_autorizacoes_assim.descricao_erro,
            vw_auditoria_autorizacoes_assim.data_execucao,
            vw_auditoria_autorizacoes_assim.autorizacao_updated_at,
            vw_auditoria_autorizacoes_assim.diferenca_minutos,
            vw_auditoria_autorizacoes_assim.situacao,
            vw_auditoria_autorizacoes_assim.prioridade,
            vw_auditoria_autorizacoes_assim.dias_atraso,
            vw_auditoria_autorizacoes_assim.possui_autorizacao,
            vw_auditoria_autorizacoes_assim.possui_solicitacao,
            vw_auditoria_autorizacoes_assim.observacao
           FROM public.vw_auditoria_autorizacoes_assim
          WHERE (vw_auditoria_autorizacoes_assim.data_atendimento = CURRENT_DATE)
        ), liberadas_assim AS (
         SELECT count(*) AS total_liberadas
           FROM public.autorizacoes_assim
          WHERE ((date(autorizacoes_assim.data_execucao) = CURRENT_DATE) AND (autorizacoes_assim.status = 'Liberado'::text))
        )
 SELECT ( SELECT count(*) AS count
           FROM auditoria auditoria_1) AS total,
    ( SELECT liberadas_assim.total_liberadas
           FROM liberadas_assim) AS liberadas,
    count(*) FILTER (WHERE (situacao = 'NAO_SOLICITADA'::text)) AS nao_solicitadas,
    count(*) FILTER (WHERE (situacao = 'AGUARDANDO_RETORNO'::text)) AS aguardando_retorno,
    count(*) FILTER (WHERE (situacao = 'CANCELADA'::text)) AS canceladas,
    count(*) FILTER (WHERE (situacao = 'GLOSA'::text)) AS glosas
   FROM auditoria;



