-- Adiciona filtro a.ativo = true na view agenda_tita_autorizacao_v2.
-- Mesma correção aplicada em agenda_tita_autorizacao (20260527110000).
-- Sem esse filtro, registros com ativo=false (grade substituída no TiTa)
-- aparecem no calendário de terapeutas causando duplicatas simultâneas.

create or replace view "public"."agenda_tita_autorizacao_v2" as
SELECT
    a.id,
    a.tita_agendamento_id,
    a.origem,
    a.data_atendimento,
    a.hora_inicial,
    a.hora_final,
    a.paciente_id,
    a.paciente_nome,
    a.cpf,
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
    a.data_nascimento,
    substring(a.numero_carteirinha, 1, 6)                                                                                                                                           AS empresa,
    substring(a.numero_carteirinha, 7, 7)                                                                                                                                           AS matricula,
    right(regexp_replace(a.numero_carteirinha, '\D'::text, ''::text, 'g'::text), 2)                                                                                                 AS dep,
    pmv.crm_formatado                                                                                                                                                               AS crm,
    pmv.crm_numero,
    pmv.crm_uf,
    upper(replace(translate(coalesce(pmv.nome_medico, ''::text), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::text, 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::text), '.'::text, ''::text)) AS nome_medico
FROM public.agenda_tita a
LEFT JOIN public.paciente_medico_vigente pmv ON pmv.paciente_id = (a.paciente_id)::text
WHERE
    a.ativo = true
    AND a.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text]);
