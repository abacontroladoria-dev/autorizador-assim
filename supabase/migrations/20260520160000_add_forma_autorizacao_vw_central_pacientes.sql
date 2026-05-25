drop view if exists "public"."vw_central_pacientes";

create view "public"."vw_central_pacientes" as
  SELECT DISTINCT ON (fa.id) fa.id,
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
     LEFT JOIN public.agenda_tita_autorizacao ag ON ((((fa.paciente_id)::bigint = ag.paciente_id)
       AND (fa.data_atendimento = ag.data_atendimento)
       AND (fa.horario = ag.hora_inicial)
       AND (lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))))))
  WHERE ((fa.id IS NOT NULL) AND ((fa.status IS NOT NULL) OR (fa.status_assim IS NOT NULL) OR (fa.numero_autorizacao IS NOT NULL) OR (fa.tipo_falta IS NOT NULL)))
  ORDER BY fa.id, fa.created_at DESC NULLS LAST, ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST;
