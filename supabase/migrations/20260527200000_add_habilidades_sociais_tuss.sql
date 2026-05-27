-- Adiciona 'Habilidades Sociais (Psicologia ABA)' ao mapeamento TUSS da view agenda_tita_autorizacao.
-- Essa terapia (terapia_exibicao_id=2654) caía no ELSE NULL do CASE, excluindo os registros
-- do WHERE e impedindo que pacientes com esse tipo de terapia aparecessem na página /solicitar.
-- Mapeamento: mesmo código TUSS dos outros subtipos de Psicologia ABA (22070384).

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
        WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text, 'Avaliação Neuropsicológica'::text, 'Habilidades Sociais (Psicologia ABA)'::text])) THEN '22070384'::text
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
WHERE (
    a.ativo = true
    AND (a.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text]))
    AND (
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text, 'Avaliação Neuropsicológica'::text, 'Habilidades Sociais (Psicologia ABA)'::text])) THEN '22070384'::text
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
        END IS NOT NULL
    )
);
