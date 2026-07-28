drop policy "controle_terapeutico_therapeutic_select" on "public"."controle_terapeutico";

drop view if exists "public"."agenda_classificada";

drop view if exists "public"."vw_blocos_autorizaveis_assim";

drop view if exists "public"."vw_central_autorizacoes";

-- [ajuste manual] listar_central_pacientes (RETURNS SETOF vw_central_pacientes)
-- depende do tipo da view; precisa ser dropada antes do drop da view (que é recriada
-- mais abaixo, junto de agenda_tita_autorizacao). É recriada no fim desta migration.
drop function if exists "public"."listar_central_pacientes"(date);

drop view if exists "public"."vw_central_pacientes";

drop view if exists "public"."vw_kpis_auditoria_assim";

drop view if exists "public"."vw_match_autorizacoes_assim";

drop view if exists "public"."agenda_tita_autorizacao";


  create table "public"."fila_autorizacoes_backup_titaid" (
    "id" uuid,
    "tita_agendamento_id" bigint
      );


alter table "public"."fila_autorizacoes_backup_titaid" enable row level security;


  create table "public"."fila_bkp_titaid_faltas_jun" (
    "id" uuid,
    "tita_agendamento_id" bigint
      );


alter table "public"."fila_bkp_titaid_faltas_jun" enable row level security;

set check_function_bodies = off;

create or replace view "public"."vw_controle_terapeutico" as  SELECT id,
    tita_agendamento_id,
    data_atendimento,
    hora_inicial,
    hora_final,
    profissional_id,
    profissional_nome,
    terapia_id,
    terapia_nome,
    status,
    profissional_substituto_id,
    profissional_substituto_nome,
        CASE
            WHEN (status = 'substituido'::text) THEN 'faltou_substituido'::text
            WHEN (status = 'indisponivel'::text) THEN 'faltou_sem_substituto'::text
            WHEN (status = 'disponivel'::text) THEN 'compareceu'::text
            ELSE 'indefinido'::text
        END AS situacao,
    (status = ANY (ARRAY['substituido'::text, 'indisponivel'::text])) AS houve_falta,
    (status = 'substituido'::text) AS foi_substituido,
    (status = 'indisponivel'::text) AS falta_descoberta,
    observacao,
    confirmado_por_nome,
    confirmado_em,
    data_atualizacao,
    created_at,
    updated_at
   FROM public.controle_terapeutico;


create or replace view "public"."vw_faltas_pacientes" as  SELECT id,
    paciente_id,
    paciente_nome,
    data_atendimento,
    horario,
    data_horario,
    terapia_falta,
    terapia_nome,
    justificativa_falta,
    tipo_falta,
    nome_medico,
    crm,
    machine_id,
    tita_agendamento_id,
    status_assim,
    assim_updated_at,
    created_at,
    updated_at
   FROM public.fila_autorizacoes
  WHERE ((status = 'falta'::text) AND (tipo_falta = 'paciente'::text));


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
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text, 'Avaliação Neuropsicológica'::text, 'Habilidades Sociais (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Coordenador de Caso'::text) THEN '22070384'::text
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
  WHERE ((a.ativo = true) AND (a.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text])) AND (
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text, 'Avaliação Neuropsicológica'::text, 'Habilidades Sociais (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Coordenador de Caso'::text) THEN '22070384'::text
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


CREATE OR REPLACE FUNCTION public.audit_rls_access_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Log whenever a user attempts to access restricted data
  -- This helps detect authorization bypass attempts
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    action,
    table_name,
    record_id,
    status,
    error_message
  ) VALUES (
    auth.uid(),
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'unknown'),
    TG_OP || '_RESTRICTED_ACCESS_ATTEMPT',
    TG_TABLE_NAME,
    NEW.id,
    'blocked',
    'Row-level security policy denied access'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_auto_resolve_occurrences(p_tipo text, p_active_session_keys text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_resolved_count integer := 0;
BEGIN
  UPDATE cco.occurrences
  SET
    resolved_at = now(),
    resolution_note = 'auto: condição não mais detectada',
    updated_at = now()
  WHERE
    tipo = p_tipo
    AND resolved_at IS NULL
    AND resolved_by IS NULL
    AND (p_active_session_keys IS NULL OR session_key != ALL(p_active_session_keys));

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
  RETURN v_resolved_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.audit_logs
  WHERE timestamp < now() - interval '90 days';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.count_cco_records()
 RETURNS TABLE(table_name text, record_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT 'atendimentos'::text, COUNT(*) FROM cco.atendimentos;
  RETURN QUERY SELECT 'session_authorizations'::text, COUNT(*) FROM cco.session_authorizations;
  RETURN QUERY SELECT 'session_substitutions'::text, COUNT(*) FROM cco.session_substitutions;
  RETURN QUERY SELECT 'occurrences'::text, COUNT(*) FROM cco.occurrences;
  RETURN QUERY SELECT 'dashboard_snapshot'::text, COUNT(*) FROM cco.dashboard_snapshot;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.count_test_data()
 RETURNS TABLE(table_name text, test_row_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'sessions'::text, COUNT(*)::bigint FROM cco.atendimentos WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'mutations'::text, COUNT(*)::bigint FROM cco.session_mutations WHERE session_key_old LIKE 'test_%'
  UNION ALL
  SELECT 'authorizations'::text, COUNT(*)::bigint FROM cco.session_authorizations WHERE session_key LIKE 'test_%'
  UNION ALL
  SELECT 'substitutions'::text, COUNT(*)::bigint FROM cco.session_substitutions WHERE session_key LIKE 'test_%';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r1_autorizacao_pendente()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'PENDENTE';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r2_sessao_sem_autorizacao()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_data date;
BEGIN
  FOR v_data IN
    SELECT DISTINCT a.data_sessao
    FROM cco.atendimentos a
    WHERE a.convenio ILIKE '%assim%'
      AND a.data_sessao < CURRENT_DATE
      AND a.orphaned_at IS NULL
    ORDER BY a.data_sessao
  LOOP
    RETURN QUERY
    SELECT a.session_key
    FROM public.get_auditoria_assim(v_data) ga
    JOIN cco.atendimentos a
      ON  a.data_sessao = v_data
      AND a.hora_inicio = ga.hora_inicial
      AND lower(trim(a.paciente_nome)) = lower(trim(ga.paciente_nome))
    WHERE ga.situacao IN ('NAO_SOLICITADA', 'GLOSA', 'RETORNO_NAO_CONFIRMADO')
      AND a.orphaned_at IS NULL;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r3_evolucao_atrasada()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  WHERE a.orphaned_at IS NULL
    AND a.data_sessao < CURRENT_DATE
    AND (a.possui_tratativa = false OR a.possui_tratativa IS NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r4_falta_terapeuta()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.status_ct = 'falta'
    AND ss.profissional_substituto_id IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r5_substituicao()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  -- Fonte 1: controle_terapeutico registrou substituição
  SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.status_ct = 'substituto'

  UNION

  -- Fonte 2: TITA mostra profissional diferente do agendado (case-insensitive)
  SELECT a.session_key
  FROM cco.atendimentos a
  WHERE a.orphaned_at IS NULL
    AND a.possui_tratativa = true
    AND a.profissional_tratativa IS NOT NULL
    AND a.profissional_tratativa <> ''
    AND a.profissional_agendado IS NOT NULL
    AND lower(trim(a.profissional_tratativa)) <> lower(trim(a.profissional_agendado));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r6_falta_paciente()
 RETURNS TABLE(session_key text, justificativa text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT a.session_key, a.justificativa
  FROM cco.atendimentos a
  WHERE a.status_agendamento = 'FALTA_PACIENTE';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_r7_glosa()
 RETURNS TABLE(session_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'GLOSA';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.detect_sessions_without_authorization()
 RETURNS TABLE(session_key text, data_sessao date, status_agendamento text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    a.session_key,
    a.data_sessao,
    a.status_agendamento
  FROM cco.atendimentos a
  WHERE a.status_agendamento NOT ILIKE ANY(ARRAY['%cancelad%','%falta%','%remanejad%','%remarcad%'])
    AND a.data_sessao <= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM cco.session_authorizations sa
      WHERE sa.session_key = a.session_key
        AND sa.authorization_status NOT IN ('SEM_SOLICITACAO')
    )
    AND a.orphaned_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_enrich_tita_csv()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  src RECORD;
BEGIN
  IF NEW.cpf IS NULL OR NEW.numero_carteirinha IS NULL THEN
    SELECT cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
    INTO src
    FROM public.agenda_tita
    WHERE paciente_id = NEW.paciente_id
      AND (cpf IS NOT NULL OR numero_carteirinha IS NOT NULL)
    ORDER BY
      (origem = 'grade') DESC,
      (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL) DESC,
      updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      NEW.cpf                := COALESCE(NEW.cpf,                src.cpf);
      NEW.data_nascimento    := COALESCE(NEW.data_nascimento,    src.data_nascimento);
      NEW.convenio_id        := COALESCE(NEW.convenio_id,        src.convenio_id);
      NEW.convenio_nome      := COALESCE(NEW.convenio_nome,      src.convenio_nome);
      NEW.numero_carteirinha := COALESCE(NEW.numero_carteirinha, src.numero_carteirinha);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_match_tita_agendamento_id(p_paciente_id text, p_data date, p_horario time without time zone, p_terapia_nome text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  select at.tita_agendamento_id
  from public.agenda_tita at
  where at.ativo = true
    and p_paciente_id is not null
    and p_paciente_id ~ '^\d+$'                    -- evita erro de cast em texto não-numérico
    and at.paciente_id = (p_paciente_id)::bigint
    and at.data_atendimento = p_data
    and at.hora_inicial = p_horario
    and lower(trim(coalesce(at.terapia_nome, ''))) = lower(trim(coalesce(p_terapia_nome, '')))
  order by at.updated_at desc nulls last
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.fn_reconcile_tita_csv_after_grade()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.agenda_tita
  SET
    cpf                = COALESCE(cpf,                NEW.cpf),
    data_nascimento    = COALESCE(data_nascimento,    NEW.data_nascimento),
    convenio_id        = COALESCE(convenio_id,        NEW.convenio_id),
    convenio_nome      = COALESCE(convenio_nome,      NEW.convenio_nome),
    numero_carteirinha = COALESCE(numero_carteirinha, NEW.numero_carteirinha),
    updated_at         = NOW()
  WHERE origem = 'tita_csv'
    AND paciente_id = NEW.paciente_id
    AND (cpf IS NULL OR numero_carteirinha IS NULL);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_tita_agendamento_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.tita_agendamento_id is null then
    new.tita_agendamento_id := public.fn_match_tita_agendamento_id(
      new.paciente_id,
      new.data_atendimento,
      new.horario,
      new.terapia_nome
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_operacional()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  d     date;
  hoje  date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  -- sexta da PRÓXIMA semana = date_trunc('week', hoje) + 11 dias
  fim   date := (date_trunc('week', hoje) + interval '11 days')::date;
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  d := hoje;
  WHILE d <= fim LOOP
    -- Pula sábado (6) e domingo (0)
    IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
      PERFORM net.http_post(
        url     := _url,
        headers := jsonb_build_object(
          'Authorization', _auth,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('data', d::text)
      );
    END IF;
    d := d + 1;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_planejamento()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_reconciliacao()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  d     date;
  hoje  date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  ini   date := hoje - 10;
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer SEGREDO_REMOVIDO_2026-07-28_ver_migration_20260728190000_e_memoria_do_projeto';
BEGIN
  d := ini;
  WHILE d <= hoje LOOP
    -- Pula sábado (6) e domingo (0)
    IF EXTRACT(DOW FROM d) NOT IN (0, 6) THEN
      PERFORM net.http_post(
        url     := _url,
        headers := jsonb_build_object(
          'Authorization', _auth,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('data', d::text)
      );
    END IF;
    d := d + 1;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_auditoria_assim(p_data date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text)
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
      WHERE at.data_atendimento = p_data
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
          AND f.data_atendimento = p_data
          AND f.horario = a.hora_inicial
          AND (
            upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
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
    SELECT
      f.empresa, f.matricula, f.dep, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      max(COALESCE(f.updated_at, f.created_at)) AS ultimo_updated_at
    FROM fila_autorizacoes f
    WHERE f.data_atendimento = p_data
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
      WHERE date(aa.data_execucao) = p_data
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
      WHEN mt.status = 'Liberado' AND mt.teve_token = true
        THEN concat('TOKEN - ', mt.token)
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
    agm.motivo_glosa,
    mt.teve_token,
    mt.token
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_cco_stats()
 RETURNS TABLE(atendimentos_total bigint, atendimentos_ativos bigint, session_authorizations bigint, session_mutations bigint, session_substitutions bigint, occurrences_total bigint, occurrences_ativas bigint, dashboard_snapshots bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM cco.atendimentos),
    (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NULL),
    (SELECT COUNT(*) FROM cco.session_authorizations),
    (SELECT COUNT(*) FROM cco.session_mutations),
    (SELECT COUNT(*) FROM cco.session_substitutions),
    (SELECT COUNT(*) FROM cco.occurrences),
    (SELECT COUNT(*) FROM cco.occurrences WHERE resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.dashboard_snapshot);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis()
 RETURNS TABLE(metric_type text, realengo bigint, fazendinha bigint, "padreMiguel" bigint, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  RETURN QUERY
  WITH
  blacklist_names AS (
    SELECT crt.terapia_nome
    FROM config_regras_terapias crt
    WHERE crt.categoria = 'BLACKLIST_AUTORIZACAO' AND crt.ativo = true
  ),
  blacklisted AS (
    SELECT DISTINCT gpt.id
    FROM grade_profissionais_tita gpt
    JOIN blacklist_names bl ON gpt.nome_terapia ILIKE ('%' || bl.terapia_nome || '%')
  ),
  target_date AS (
    SELECT COALESCE(MIN(gpt2.data), CURRENT_DATE) AS dt
    FROM grade_profissionais_tita gpt2
    WHERE gpt2.data >= CURRENT_DATE
  ),
  atend AS (
    SELECT
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Realengo%')     AS realengo,
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(*) FILTER (WHERE gpt.sala ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(*)                                                 AS total
    FROM grade_profissionais_tita gpt
    CROSS JOIN target_date td
    WHERE gpt.data = td.dt
      AND gpt.status_agendamento <> 'Livre'
      AND gpt.id NOT IN (SELECT id FROM blacklisted)
  ),
  faltas AS (
    SELECT
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT fa.paciente_nome) FILTER (WHERE COALESCE(a.sala_nome, '') ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT fa.paciente_nome)                                                                  AS total
    FROM fila_autorizacoes fa
    LEFT JOIN agenda_tita a ON a.tita_agendamento_id = fa.tita_agendamento_id AND a.ativo = true
    WHERE fa.data_atendimento = CURRENT_DATE
      AND fa.tipo_falta = 'paciente'
  ),
  terapeutas AS (
    SELECT
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT gpt.nome_profissional) FILTER (WHERE gpt.sala ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT gpt.nome_profissional)                                                AS total
    FROM grade_profissionais_tita gpt
    CROSS JOIN target_date td
    WHERE gpt.data = td.dt
      AND gpt.status_agendamento = 'Agendado'
  ),
  indisponiveis AS (
    SELECT
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Realengo%')     AS realengo,
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Fazendinha%')   AS fazendinha,
      COUNT(DISTINCT a.profissional_id) FILTER (WHERE a.sala_nome ILIKE '%Padre Miguel%') AS "padreMiguel",
      COUNT(DISTINCT a.profissional_id)                                                    AS total
    FROM controle_terapeutico ct
    JOIN agenda_tita a ON a.tita_agendamento_id = ct.tita_agendamento_id AND a.ativo = true
    WHERE ct.data_atendimento = CURRENT_DATE
      AND ct.status = 'indisponivel'
  )
  SELECT 'kpi_atendimentos'::text, atend.realengo, atend.fazendinha, atend."padreMiguel", atend.total FROM atend
  UNION ALL
  SELECT 'kpi_faltas'::text, faltas.realengo, faltas.fazendinha, faltas."padreMiguel", faltas.total FROM faltas
  UNION ALL
  SELECT 'kpi_terapeutas'::text, terapeutas.realengo, terapeutas.fazendinha, terapeutas."padreMiguel", terapeutas.total FROM terapeutas
  UNION ALL
  SELECT 'kpi_terapeutas_indisponiveis'::text, indisponiveis.realengo, indisponiveis.fazendinha, indisponiveis."padreMiguel", indisponiveis.total FROM indisponiveis;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_faltas_auditoria_assim(p_data date)
 RETURNS TABLE(paciente_id text, paciente_nome text, data_atendimento date, hora_inicial time without time zone, tuss text, terapia_nome text, tipo_falta text, profissional_nome text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    f.paciente_id::text,
    f.paciente_nome,
    f.data_atendimento,
    f.horario AS hora_inicial,
    f.tuss,
    f.terapia_nome,
    f.tipo_falta,
    (SELECT string_agg(DISTINCT at2.profissional_nome, ' | ' ORDER BY at2.profissional_nome)
     FROM public.agenda_tita at2
     WHERE at2.paciente_id = f.paciente_id::bigint
       AND at2.data_atendimento = f.data_atendimento
       AND at2.hora_inicial = f.horario) AS profissional_nome
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento = p_data
    AND (f.tipo_falta ILIKE '%paciente%' OR f.tipo_falta ILIKE '%terapeuta%')
    AND f.terapia_nome NOT ILIKE '%Equoterapia%'
    AND f.terapia_nome NOT ILIKE '%Fisioterapia Aquática%'
    AND NOT EXISTS (
      SELECT 1 FROM public.agenda_tita at
      JOIN public.config_regras_terapias r
        ON at.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
      WHERE r.categoria = 'BLACKLIST_AUTORIZACAO' AND r.ativo = true
        AND at.paciente_id = f.paciente_id::bigint
        AND at.data_atendimento = f.data_atendimento
        AND at.hora_inicial = f.horario
    )
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_unit()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_unit TEXT;
BEGIN
  SELECT unidade INTO user_unit
  FROM public.usuarios
  WHERE id = auth.uid() AND ativo = true;
  RETURN COALESCE(user_unit, 'principal');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
    AND role = 'admin'
    AND ativo = true
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_authorization_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      TG_OP,
      'autorizacoes',
      NEW.id,
      CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
      'success'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_usuario_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.ativo IS DISTINCT FROM NEW.ativo) THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      CASE
        WHEN OLD.role IS DISTINCT FROM NEW.role THEN 'ROLE_CHANGE'
        WHEN OLD.ativo IS DISTINCT FROM NEW.ativo THEN 'USER_STATUS_CHANGE'
      END,
      'usuarios',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'ativo', OLD.ativo),
      jsonb_build_object('role', NEW.role, 'ativo', NEW.ativo),
      'success'
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      old_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'USER_DELETED',
      'usuarios',
      OLD.id,
      jsonb_build_object('email', OLD.email, 'role', OLD.role),
      'success'
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id,
      user_email,
      action,
      table_name,
      record_id,
      new_values,
      status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'USER_CREATED',
      'usuarios',
      NEW.id,
      jsonb_build_object('email', NEW.email, 'role', NEW.role),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sample_cco_data()
 RETURNS TABLE(data_type text, sample jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Sample atendimentos
  RETURN QUERY SELECT
    'atendimentos'::text,
    jsonb_build_object(
      'session_key', session_key,
      'paciente_nome', paciente_nome,
      'data_sessao', data_sessao,
      'possui_tratativa', possui_tratativa,
      'status_agendamento', status_agendamento
    )
  FROM cco.atendimentos
  LIMIT 3;

  -- Sample session_authorizations
  RETURN QUERY SELECT
    'session_authorizations'::text,
    jsonb_build_object(
      'session_key', session_key,
      'source', source,
      'authorization_status', authorization_status
    )
  FROM cco.session_authorizations
  LIMIT 3;

  -- Sample session_substitutions
  RETURN QUERY SELECT
    'session_substitutions'::text,
    jsonb_build_object(
      'session_key', session_key,
      'status_ct', status_ct,
      'profissional_substituto_id', profissional_substituto_id
    )
  FROM cco.session_substitutions
  LIMIT 3;

  -- Count possui_tratativa = false
  RETURN QUERY SELECT
    'atendimentos_sem_tratativa'::text,
    jsonb_build_object(
      'count', (SELECT COUNT(*) FROM cco.atendimentos WHERE possui_tratativa = false)
    );

  -- Count by status_agendamento
  RETURN QUERY SELECT
    'status_breakdown'::text,
    jsonb_build_object(
      'falta_paciente', (SELECT COUNT(*) FROM cco.atendimentos WHERE status_agendamento = 'FALTA_PACIENTE'),
      'outros', (SELECT COUNT(*) FROM cco.atendimentos WHERE status_agendamento != 'FALTA_PACIENTE')
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.test_occurrences_view()
 RETURNS TABLE(view_exists boolean, record_count bigint, columns text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_exists boolean;
  v_count bigint;
  v_columns text;
BEGIN
  -- Check if view exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name = 'occurrences'
  ) INTO v_exists;

  -- Count records if exists
  IF v_exists THEN
    SELECT COUNT(*) INTO v_count FROM public.occurrences;
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'occurrences';
  END IF;

  RETURN QUERY SELECT v_exists, v_count, v_columns;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dashboard_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO cco.dashboard_snapshot (
    data_ref, autorizacoes_pendentes, sessoes_sem_autorizacao,
    evolucoes_atrasadas, faltas_terapeuta, substituicoes,
    faltas_paciente, glosas, receita_em_risco_count, calculated_at
  )
  SELECT
    CURRENT_DATE,
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='AUTORIZACAO_PENDENTE' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='SESSAO_SEM_AUTORIZACAO' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='EVOLUCAO_ATRASADA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='FALTA_TERAPEUTA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='SUBSTITUICAO' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='FALTA_PACIENTE' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='GLOSA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo IN ('AUTORIZACAO_PENDENTE','SESSAO_SEM_AUTORIZACAO','EVOLUCAO_ATRASADA') AND resolved_at IS NULL),
    NOW()
  ON CONFLICT (data_ref) DO UPDATE SET
    autorizacoes_pendentes = EXCLUDED.autorizacoes_pendentes,
    sessoes_sem_autorizacao = EXCLUDED.sessoes_sem_autorizacao,
    evolucoes_atrasadas = EXCLUDED.evolucoes_atrasadas,
    faltas_terapeuta = EXCLUDED.faltas_terapeuta,
    substituicoes = EXCLUDED.substituicoes,
    faltas_paciente = EXCLUDED.faltas_paciente,
    glosas = EXCLUDED.glosas,
    receita_em_risco_count = EXCLUDED.receita_em_risco_count,
    calculated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_atendimentos(p_rows jsonb)
 RETURNS TABLE(upserted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO cco.atendimentos (
      session_key,
      tita_agendamento_id,
      paciente_nome,
      data_sessao,
      hora_inicio,
      hora_fim,
      profissional_agendado,
      terapia,
      convenio,
      unidade,
      status_agendamento,
      justificativa,
      possui_tratativa,
      profissional_tratativa,
      data_tratativa,
      id_profissional_tratativa,
      origem_tratativa,
      sync_hash,
      synced_at,
      created_at,
      updated_at
    ) VALUES (
      v_row->>'session_key',
      (v_row->>'tita_agendamento_id')::bigint,
      v_row->>'paciente_nome',
      (v_row->>'data_sessao')::date,
      (v_row->>'hora_inicio')::time,
      (v_row->>'hora_fim')::time,
      v_row->>'profissional_agendado',
      v_row->>'terapia',
      v_row->>'convenio',
      v_row->>'unidade',
      v_row->>'status_agendamento',
      v_row->>'justificativa',
      (v_row->>'possui_tratativa')::boolean,
      v_row->>'profissional_tratativa',
      (v_row->>'data_tratativa')::date,
      (v_row->>'id_profissional_tratativa')::bigint,
      v_row->>'origem_tratativa',
      v_row->>'sync_hash',
      (v_row->>'synced_at')::timestamptz,
      (v_row->>'created_at')::timestamptz,
      (v_row->>'updated_at')::timestamptz
    )
    ON CONFLICT (session_key) DO UPDATE SET
      tita_agendamento_id = EXCLUDED.tita_agendamento_id,
      paciente_nome = EXCLUDED.paciente_nome,
      data_sessao = EXCLUDED.data_sessao,
      hora_inicio = EXCLUDED.hora_inicio,
      hora_fim = EXCLUDED.hora_fim,
      profissional_agendado = EXCLUDED.profissional_agendado,
      terapia = EXCLUDED.terapia,
      convenio = EXCLUDED.convenio,
      unidade = EXCLUDED.unidade,
      status_agendamento = EXCLUDED.status_agendamento,
      justificativa = EXCLUDED.justificativa,
      possui_tratativa = EXCLUDED.possui_tratativa,
      profissional_tratativa = EXCLUDED.profissional_tratativa,
      data_tratativa = EXCLUDED.data_tratativa,
      id_profissional_tratativa = EXCLUDED.id_profissional_tratativa,
      origem_tratativa = EXCLUDED.origem_tratativa,
      sync_hash = EXCLUDED.sync_hash,
      synced_at = EXCLUDED.synced_at,
      updated_at = EXCLUDED.updated_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_occurrences(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO cco.occurrences (
    session_key, tipo, severity, titulo, descricao,
    fingerprint, created_at, updated_at
  )
  SELECT
    row->>'session_key',
    (row->>'tipo')::occurrence_type_enum,
    (row->>'severity')::severity_enum,
    row->>'titulo',
    row->>'descricao',
    row->>'fingerprint',
    (row->>'created_at')::timestamp with time zone,
    (row->>'updated_at')::timestamp with time zone
  FROM jsonb_array_elements(p_rows) AS row
  ON CONFLICT (fingerprint) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

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


create or replace view "public"."vw_central_pacientes" as ( SELECT DISTINCT ON (fa.id) fa.id,
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
        END AS status_operacional,
    ctrl.profissional_substituto_nome,
    COALESCE(ctrl.profissional_substituto_nome, ag.profissional_nome) AS profissional_realizou_nome,
    (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
    ctrl.status AS controle_status,
    ctrl.confirmado_em,
    fa.criado_por
   FROM (((public.fila_autorizacoes fa
     LEFT JOIN public.maquinas maq ON ((maq.id = fa.machine_id)))
     LEFT JOIN public.agenda_tita_autorizacao ag ON ((((fa.paciente_id)::bigint = ag.paciente_id) AND (fa.data_atendimento = ag.data_atendimento) AND (fa.horario = ag.hora_inicial) AND (lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))))))
     LEFT JOIN LATERAL ( SELECT ct.status,
            ct.profissional_substituto_id,
            ct.profissional_substituto_nome,
            ct.confirmado_em
           FROM public.controle_terapeutico ct
          WHERE (ct.tita_agendamento_id = ag.tita_agendamento_id)
          ORDER BY ct.updated_at DESC NULLS LAST
         LIMIT 1) ctrl ON (true))
  WHERE ((fa.id IS NOT NULL) AND ((fa.status IS NOT NULL) OR (fa.status_assim IS NOT NULL) OR (fa.numero_autorizacao IS NOT NULL) OR (fa.tipo_falta IS NOT NULL)))
  ORDER BY fa.id, fa.created_at DESC NULLS LAST, ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST)
UNION ALL
 SELECT p2.id,
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
    p2.status_operacional,
    p2.profissional_substituto_nome,
    p2.profissional_realizou_nome,
    p2.is_substituicao,
    p2.controle_status,
    p2.confirmado_em,
    p2.criado_por
   FROM ( WITH agenda_com_tuss AS (
                 SELECT at.id,
                    at.tita_agendamento_id,
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
                            WHEN (at.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text, 'Avaliação Neuropsicológica'::text, 'Habilidades Sociais (Psicologia ABA)'::text])) THEN '22070384'::text
                            WHEN (at.terapia_exibicao_nome = 'Fonoaudiologia'::text) THEN '22070397'::text
                            WHEN (at.terapia_exibicao_nome = 'Psicomotricidade'::text) THEN '22070400'::text
                            WHEN (at.terapia_exibicao_nome = 'Fisioterapia'::text) THEN '22070419'::text
                            WHEN (at.terapia_exibicao_nome = 'Terapia Ocupacional'::text) THEN '22070427'::text
                            WHEN (at.terapia_exibicao_nome = 'Psicopedagogia'::text) THEN '22070435'::text
                            WHEN (at.terapia_exibicao_nome = 'Musicoterapia'::text) THEN '22070451'::text
                            WHEN (at.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text, 'Terapia Alimentar'::text])) THEN '22070460'::text
                            WHEN (at.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text, 'Fisioterapia Aquática'::text])) THEN '22070265'::text
                            WHEN (at.terapia_exibicao_nome = 'Equoterapia'::text) THEN '22070257'::text
                            ELSE NULL::text
                        END AS codigo_tuss
                   FROM public.agenda_tita at
                  WHERE (at.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text]))
                ), slots_sem_fila AS (
                 SELECT agenda_com_tuss.id,
                    agenda_com_tuss.tita_agendamento_id,
                    agenda_com_tuss.paciente_id,
                    agenda_com_tuss.paciente_nome,
                    agenda_com_tuss.data_atendimento,
                    agenda_com_tuss.hora_inicial,
                    agenda_com_tuss.hora_final,
                    agenda_com_tuss.profissional_id,
                    agenda_com_tuss.profissional_nome,
                    agenda_com_tuss.terapia_nome,
                    agenda_com_tuss.terapia_exibicao_id,
                    agenda_com_tuss.terapia_exibicao_nome,
                    agenda_com_tuss.sala_nome,
                    agenda_com_tuss.clinica_nome,
                    agenda_com_tuss.convenio_nome,
                    agenda_com_tuss.responsavel_nome,
                    agenda_com_tuss.responsavel_telefone,
                    agenda_com_tuss.numero_carteirinha,
                    agenda_com_tuss.codigo_tuss,
                    row_number() OVER (PARTITION BY agenda_com_tuss.paciente_id, agenda_com_tuss.data_atendimento, agenda_com_tuss.codigo_tuss ORDER BY agenda_com_tuss.hora_inicial) AS ordem
                   FROM agenda_com_tuss
                  WHERE ((agenda_com_tuss.codigo_tuss IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM public.fila_autorizacoes fa
                          WHERE (((fa.paciente_id)::bigint = agenda_com_tuss.paciente_id) AND (fa.data_atendimento = agenda_com_tuss.data_atendimento) AND (fa.horario = agenda_com_tuss.hora_inicial))))))
                ), guias_sem_fila AS (
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
                    row_number() OVER (PARTITION BY aa.paciente_id, ((aa.data_execucao)::date), aa.codigo_tuss ORDER BY aa.guia) AS ordem
                   FROM public.autorizacoes_assim aa
                  WHERE ((aa.codigo_tuss IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM public.fila_autorizacoes fa
                          WHERE (fa.numero_autorizacao = aa.guia)))))
                )
         SELECT (((((((((substr(md5((((((s.paciente_id)::text || '|'::text) || (s.data_atendimento)::text) || '|'::text) || (s.hora_inicial)::text)), 1, 8) || '-'::text) || substr(md5((((((s.paciente_id)::text || '|'::text) || (s.data_atendimento)::text) || '|'::text) || (s.hora_inicial)::text)), 9, 4)) || '-'::text) || substr(md5((((((s.paciente_id)::text || '|'::text) || (s.data_atendimento)::text) || '|'::text) || (s.hora_inicial)::text)), 13, 4)) || '-'::text) || substr(md5((((((s.paciente_id)::text || '|'::text) || (s.data_atendimento)::text) || '|'::text) || (s.hora_inicial)::text)), 17, 4)) || '-'::text) || substr(md5((((((s.paciente_id)::text || '|'::text) || (s.data_atendimento)::text) || '|'::text) || (s.hora_inicial)::text)), 21, 12)))::uuid AS id,
            NULL::uuid AS agenda_id,
            (s.paciente_id)::text AS paciente_id,
            s.paciente_nome,
            s.data_atendimento,
            s.hora_inicial AS horario,
            ((((s.data_atendimento)::text || ' '::text) || (s.hora_inicial)::text))::timestamp without time zone AS data_horario,
            'concluido'::text AS status,
            'autorizado'::text AS status_assim,
            NULL::text AS tipo_falta,
            'automated'::text AS completion_type,
            g.guia AS numero_autorizacao,
            NULL::text AS machine_id,
            NULL::text AS error_message,
            NULL::integer AS execution_time_ms,
            g.data_autorizacao AS created_at,
            g.updated_at,
            g.updated_at AS assim_updated_at,
            g.data_autorizacao AS horario_autorizacao,
            s.terapia_exibicao_id,
            s.terapia_nome AS classificacao_terapia,
            'automatico'::text AS forma_autorizacao,
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
            s.sala_nome AS unidade,
            s.convenio_nome AS convenio,
            NULL::text AS usuario_nome,
            'autorizado'::text AS status_operacional,
            ctrl.profissional_substituto_nome,
            COALESCE(ctrl.profissional_substituto_nome, s.profissional_nome) AS profissional_realizou_nome,
            (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
            ctrl.status AS controle_status,
            ctrl.confirmado_em,
            NULL::text AS criado_por
           FROM ((slots_sem_fila s
             JOIN guias_sem_fila g ON (((g.paciente_id = s.paciente_id) AND ((g.data_execucao)::date = s.data_atendimento) AND (g.codigo_tuss = s.codigo_tuss) AND (g.ordem = s.ordem))))
             LEFT JOIN LATERAL ( SELECT ct.status,
                    ct.profissional_substituto_id,
                    ct.profissional_substituto_nome,
                    ct.confirmado_em
                   FROM public.controle_terapeutico ct
                  WHERE (ct.tita_agendamento_id = s.tita_agendamento_id)
                  ORDER BY ct.updated_at DESC NULLS LAST
                 LIMIT 1) ctrl ON (true))) p2;


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
        ), faltas_dia AS (
         SELECT count(*) AS total_faltas
           FROM (public.fila_autorizacoes f
             JOIN public.agenda_tita_autorizacao a ON (((a.paciente_id = (f.paciente_id)::bigint) AND (a.data_atendimento = f.data_atendimento) AND (a.hora_inicial = f.horario))))
          WHERE ((a.convenio_nome ~~* '%assim%'::text) AND (f.data_atendimento = CURRENT_DATE) AND ((upper(COALESCE(f.status_assim, ''::text)) ~~ '%FALTA%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%PACIENTE%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%TERAPEUTA%'::text)))
        )
 SELECT ( SELECT count(*) AS count
           FROM auditoria auditoria_1) AS total,
    ( SELECT liberadas_assim.total_liberadas
           FROM liberadas_assim) AS liberadas,
    ( SELECT faltas_dia.total_faltas
           FROM faltas_dia) AS faltas,
    count(*) FILTER (WHERE (situacao = 'NAO_SOLICITADA'::text)) AS nao_solicitadas,
    count(*) FILTER (WHERE (situacao = 'AGUARDANDO_RETORNO'::text)) AS aguardando_retorno,
    count(*) FILTER (WHERE (situacao = 'CANCELADA'::text)) AS canceladas,
    count(*) FILTER (WHERE (situacao = 'GLOSA'::text)) AS glosas
   FROM auditoria;


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


create or replace view "public"."vw_central_autorizacoes" as  WITH fallback_pat AS (
         SELECT DISTINCT ON (agenda_tita.paciente_id) agenda_tita.paciente_id,
            agenda_tita.cpf,
            agenda_tita.data_nascimento,
            agenda_tita.convenio_id,
            agenda_tita.convenio_nome,
            agenda_tita.numero_carteirinha,
            "substring"(agenda_tita.numero_carteirinha, 1, 6) AS empresa,
            "substring"(agenda_tita.numero_carteirinha, 7, 7) AS matricula,
            "right"(regexp_replace(agenda_tita.numero_carteirinha, '\D'::text, ''::text, 'g'::text), 2) AS dep
           FROM public.agenda_tita
          WHERE ((agenda_tita.cpf IS NOT NULL) OR (agenda_tita.numero_carteirinha IS NOT NULL))
          ORDER BY agenda_tita.paciente_id, (agenda_tita.origem = 'grade'::text) DESC, ((agenda_tita.cpf IS NOT NULL) AND (agenda_tita.numero_carteirinha IS NOT NULL)) DESC, agenda_tita.updated_at DESC
        ), base AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            COALESCE(ag.cpf, fp.cpf) AS cpf,
            COALESCE(ag.data_nascimento, fp.data_nascimento) AS data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial AS horario,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            array_agg(DISTINCT ag.sala_nome) AS sala_nome,
            array_agg(DISTINCT ag.profissional_nome) AS profissionais,
            array_agg(DISTINCT ag.codigo_tuss) AS codigos_tuss,
            array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
            COALESCE(ag.convenio_nome, fp.convenio_nome) AS convenio_nome,
            COALESCE(ag.convenio_id, fp.convenio_id) AS convenio_id,
            COALESCE(ag.empresa, fp.empresa) AS empresa,
            COALESCE(ag.matricula, fp.matricula) AS matricula,
            COALESCE(ag.dep, fp.dep) AS dep,
            ag.crm,
            ag.nome_medico
           FROM (public.agenda_tita_autorizacao ag
             LEFT JOIN fallback_pat fp ON ((fp.paciente_id = ag.paciente_id)))
          WHERE ((lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, COALESCE(ag.cpf, fp.cpf), COALESCE(ag.data_nascimento, fp.data_nascimento), ag.data_atendimento, ag.hora_inicial, COALESCE(ag.convenio_nome, fp.convenio_nome), COALESCE(ag.convenio_id, fp.convenio_id), COALESCE(ag.empresa, fp.empresa), COALESCE(ag.matricula, fp.matricula), COALESCE(ag.dep, fp.dep), ag.crm, ag.nome_medico
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
            fila_autorizacoes.cancelado_por_nome,
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
            WHEN (uf.status = 'concluido_sem_guia'::text) THEN 'concluido_sem_guia'::text
            WHEN (uf.status = 'falta'::text) THEN 'falta'::text
            WHEN (uf.status = 'processando'::text) THEN 'processando'::text
            WHEN (uf.status = 'pendente'::text) THEN 'pendente'::text
            WHEN (uf.status = 'cancelado'::text) THEN 'cancelado'::text
            WHEN (uf.status = 'erro'::text) THEN 'erro'::text
            ELSE 'sem_acao'::text
        END AS status_final,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN false
            WHEN (uf.status = ANY (ARRAY['concluido'::text, 'falta'::text, 'concluido_sem_guia'::text])) THEN false
            ELSE true
        END AS mostrar_na_tela,
        CASE
            WHEN (lower(COALESCE(b.convenio_nome, ''::text)) ~~ '%assim%'::text) THEN 'autorizacao'::text
            ELSE 'presenca'::text
        END AS tipo_fluxo,
    uf.cancelado_por_nome
   FROM ((base b
     LEFT JOIN match_assim ma ON (((ma.paciente_id = b.paciente_id) AND (ma.data_atendimento = b.data_atendimento) AND (ma.horario = b.horario))))
     LEFT JOIN ultima_fila uf ON ((((uf.paciente_id)::bigint = b.paciente_id) AND (uf.data_atendimento = b.data_atendimento) AND (uf.horario = b.horario))));


grant delete on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant insert on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant references on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant select on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant trigger on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant truncate on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant update on table "public"."fila_autorizacoes_backup_titaid" to "anon";

grant delete on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant insert on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant references on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant select on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant trigger on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant truncate on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant update on table "public"."fila_autorizacoes_backup_titaid" to "authenticated";

grant delete on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant insert on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant references on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant select on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant trigger on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant truncate on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant update on table "public"."fila_autorizacoes_backup_titaid" to "service_role";

grant delete on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant insert on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant references on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant select on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant trigger on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant truncate on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant update on table "public"."fila_bkp_titaid_faltas_jun" to "anon";

grant delete on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant insert on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant references on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant select on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant trigger on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant truncate on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant update on table "public"."fila_bkp_titaid_faltas_jun" to "authenticated";

grant delete on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant insert on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant references on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant select on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant trigger on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant truncate on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";

grant update on table "public"."fila_bkp_titaid_faltas_jun" to "service_role";


  create policy "csv_reposicao_faltas_select_all"
  on "public"."csv_reposicao_faltas"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "controle_terapeutico_therapeutic_select"
  on "public"."controle_terapeutico"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.usuarios u
  WHERE ((u.id = auth.uid()) AND (u.role = ANY (ARRAY['terapeutico'::text, 'terapeuta'::text, 'admin'::text, 'diretoria'::text])) AND (u.ativo = true)))));


-- [ajuste manual] Recria listar_central_pacientes após a view vw_central_pacientes
-- (dropada no topo por depender do tipo da view). Definição idêntica à vigente.
CREATE OR REPLACE FUNCTION public.listar_central_pacientes(p_data date)
RETURNS SETOF public.vw_central_pacientes
LANGUAGE sql STABLE SECURITY INVOKER
AS $$

-- Parte 1: registros que passaram pela fila
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
            WHEN fa.status      = 'erro'        THEN 'erro'
            WHEN fa.status      = 'processando' THEN 'processando'
            WHEN fa.tipo_falta  = 'terapeuta'   THEN 'falta_terapeuta'
            WHEN fa.tipo_falta  = 'paciente'    THEN 'falta_paciente'
            WHEN fa.status_assim = 'autorizado' THEN 'autorizado'
            WHEN fa.status      = 'concluido'   THEN 'autorizado'
            WHEN fa.status      = 'pendente'    THEN 'pendente'
            ELSE COALESCE(fa.status, 'pendente')
        END AS status_operacional,
        ctrl.profissional_substituto_nome,
        COALESCE(ctrl.profissional_substituto_nome, ag.profissional_nome) AS profissional_realizou_nome,
        (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
        ctrl.status AS controle_status,
        ctrl.confirmado_em,
        fa.criado_por
    FROM public.fila_autorizacoes fa
    LEFT JOIN public.maquinas maq
        ON maq.id = fa.machine_id
    LEFT JOIN public.agenda_tita_autorizacao ag
        ON  fa.paciente_id::bigint = ag.paciente_id
        AND fa.data_atendimento    = ag.data_atendimento
        AND fa.horario             = ag.hora_inicial
        AND lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) =
            lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))
    LEFT JOIN LATERAL (
        SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em
        FROM public.controle_terapeutico ct
        WHERE ct.tita_agendamento_id = ag.tita_agendamento_id
        ORDER BY ct.updated_at DESC NULLS LAST
        LIMIT 1
    ) ctrl ON true
    WHERE fa.id IS NOT NULL
      AND fa.data_atendimento = p_data
      AND (fa.status IS NOT NULL OR fa.status_assim IS NOT NULL
           OR fa.numero_autorizacao IS NOT NULL OR fa.tipo_falta IS NOT NULL)
    ORDER BY fa.id,
             fa.created_at  DESC NULLS LAST,
             ag.updated_at  DESC NULLS LAST,
             ag.created_at  DESC NULLS LAST
)

UNION ALL

-- Parte 2: autorizados diretamente no ASSIM sem registro em fila_autorizacoes
(
    SELECT
        p2.id, p2.agenda_id, p2.paciente_id, p2.paciente_nome,
        p2.data_atendimento, p2.horario, p2.data_horario,
        p2.status, p2.status_assim, p2.tipo_falta, p2.completion_type,
        p2.numero_autorizacao, p2.machine_id, p2.error_message, p2.execution_time_ms,
        p2.created_at, p2.updated_at, p2.assim_updated_at, p2.horario_autorizacao,
        p2.terapia_exibicao_id, p2.classificacao_terapia, p2.forma_autorizacao,
        p2.hora_inicial, p2.hora_final, p2.profissional_nome, p2.profissional_id,
        p2.terapia_nome, p2.terapia_exibicao_nome, p2.sala_nome, p2.clinica_nome,
        p2.convenio_nome, p2.responsavel_nome, p2.responsavel_telefone, p2.numero_carteirinha,
        p2.unidade, p2.convenio, p2.usuario_nome, p2.status_operacional,
        p2.profissional_substituto_nome, p2.profissional_realizou_nome,
        p2.is_substituicao, p2.controle_status, p2.confirmado_em,
        p2.criado_por
    FROM (
        WITH
        agenda_com_tuss AS (
            SELECT
                at.id,
                at.tita_agendamento_id,
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
            WHERE at.data_atendimento = p_data
              AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text,'Notificação Prévia'::text])
        ),
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
                    AND fa.data_atendimento    = agenda_com_tuss.data_atendimento
                    AND fa.horario             = agenda_com_tuss.hora_inicial
              )
        ),
        guias_sem_fila AS (
            SELECT
                aa.*,
                ROW_NUMBER() OVER (
                    PARTITION BY aa.paciente_id, aa.data_execucao::date, aa.codigo_tuss
                    ORDER BY aa.guia ASC
                ) AS ordem
            FROM public.autorizacoes_assim aa
            WHERE aa.codigo_tuss IS NOT NULL
              AND aa.data_execucao::date = p_data
              AND NOT EXISTS (
                  SELECT 1 FROM public.fila_autorizacoes fa
                  WHERE fa.numero_autorizacao = aa.guia
              )
        )
        SELECT
            (substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),1,8)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),9,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),13,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),17,4)||'-'||
             substr(md5(s.paciente_id::text||'|'||s.data_atendimento::text||'|'||s.hora_inicial::text),21,12))::uuid  AS id,
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
            'autorizado'::text        AS status_operacional,
            ctrl.profissional_substituto_nome,
            COALESCE(ctrl.profissional_substituto_nome, s.profissional_nome) AS profissional_realizou_nome,
            (ctrl.profissional_substituto_id IS NOT NULL) AS is_substituicao,
            ctrl.status               AS controle_status,
            ctrl.confirmado_em,
            NULL::text                AS criado_por
        FROM slots_sem_fila s
        INNER JOIN guias_sem_fila g
            ON  g.paciente_id       = s.paciente_id
            AND g.data_execucao::date = s.data_atendimento
            AND g.codigo_tuss       = s.codigo_tuss
            AND g.ordem             = s.ordem
        LEFT JOIN LATERAL (
            SELECT ct.status, ct.profissional_substituto_id, ct.profissional_substituto_nome, ct.confirmado_em
            FROM public.controle_terapeutico ct
            WHERE ct.tita_agendamento_id = s.tita_agendamento_id
            ORDER BY ct.updated_at DESC NULLS LAST
            LIMIT 1
        ) ctrl ON true
    ) p2
)

$$;

GRANT EXECUTE ON FUNCTION public.listar_central_pacientes(date) TO anon, authenticated, service_role;



