


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "cco";


ALTER SCHEMA "cco" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "cco"."authorization_source_enum" AS ENUM (
    'assim',
    'fila'
);


ALTER TYPE "cco"."authorization_source_enum" OWNER TO "postgres";


CREATE TYPE "cco"."authorization_status_enum" AS ENUM (
    'LIBERADA',
    'PENDENTE',
    'GLOSA',
    'CANCELADA',
    'SEM_SOLICITACAO'
);


ALTER TYPE "cco"."authorization_status_enum" OWNER TO "postgres";


CREATE TYPE "cco"."occurrence_type_enum" AS ENUM (
    'AUTORIZACAO_PENDENTE',
    'SESSAO_SEM_AUTORIZACAO',
    'EVOLUCAO_ATRASADA',
    'FALTA_TERAPEUTA',
    'SUBSTITUICAO',
    'FALTA_PACIENTE',
    'GLOSA'
);


ALTER TYPE "cco"."occurrence_type_enum" OWNER TO "postgres";


CREATE TYPE "cco"."severity_enum" AS ENUM (
    'CRITICAL',
    'WARNING',
    'INFO'
);


ALTER TYPE "cco"."severity_enum" OWNER TO "postgres";


CREATE TYPE "public"."status_terapeutico" AS ENUM (
    'pendente',
    'presente',
    'falta',
    'atraso',
    'cobertura_planejada',
    'cobertura_confirmada',
    'cancelado'
);


ALTER TYPE "public"."status_terapeutico" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajustar_crm_fila"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.crm IS NOT NULL THEN
    NEW.crm := REGEXP_REPLACE(NEW.crm, '[^0-9]', '', 'g');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ajustar_crm_fila"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajustar_matricula_fila"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.matricula IS NOT NULL THEN
    NEW.matricula := LEFT(NEW.matricula, 7);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ajustar_matricula_fila"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."atualizar_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


ALTER FUNCTION "public"."atualizar_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) IS 'Batch update: mark occurrences as resolved if session_key is NOT in active set. Replaces row-by-row UPDATE loop.';



CREATE OR REPLACE FUNCTION "public"."count_cco_records"() RETURNS TABLE("table_name" "text", "record_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT 'atendimentos'::text, COUNT(*) FROM cco.atendimentos;
  RETURN QUERY SELECT 'session_authorizations'::text, COUNT(*) FROM cco.session_authorizations;
  RETURN QUERY SELECT 'session_substitutions'::text, COUNT(*) FROM cco.session_substitutions;
  RETURN QUERY SELECT 'occurrences'::text, COUNT(*) FROM cco.occurrences;
  RETURN QUERY SELECT 'dashboard_snapshot'::text, COUNT(*) FROM cco.dashboard_snapshot;
END;
$$;


ALTER FUNCTION "public"."count_cco_records"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_cco_records"() IS 'Count records in all CCO tables for debugging purposes.';



CREATE OR REPLACE FUNCTION "public"."count_test_data"() RETURNS TABLE("table_name" "text", "test_row_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."count_test_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."count_test_data"() IS 'Returns count of test data (test_*) in CCO tables. Useful for validation without needing Data API schema access.';



CREATE OR REPLACE FUNCTION "public"."create_worker_token"() RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_token uuid;
begin
  new_token := gen_random_uuid();

  insert into public.worker_tokens (token, user_id, expires_at)
  values (
    new_token,
    auth.uid(),
    now() + interval '2 minutes'
  );

  return new_token;
end;
$$;


ALTER FUNCTION "public"."create_worker_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r1_autorizacao_pendente"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'PENDENTE';
END;
$$;


ALTER FUNCTION "public"."detect_r1_autorizacao_pendente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r2_sessao_sem_autorizacao"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."detect_r2_sessao_sem_autorizacao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r3_evolucao_atrasada"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  WHERE a.orphaned_at IS NULL
    AND a.data_sessao < CURRENT_DATE
    AND (a.possui_tratativa = false OR a.possui_tratativa IS NULL);
END;
$$;


ALTER FUNCTION "public"."detect_r3_evolucao_atrasada"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r4_falta_terapeuta"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.status_ct = 'falta'
    AND ss.profissional_substituto_id IS NULL;
END;
$$;


ALTER FUNCTION "public"."detect_r4_falta_terapeuta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r5_substituicao"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.profissional_substituto_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."detect_r5_substituicao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r6_falta_paciente"() RETURNS TABLE("session_key" "text", "justificativa" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT a.session_key, a.justificativa
  FROM cco.atendimentos a
  WHERE a.status_agendamento = 'FALTA_PACIENTE';
END;
$$;


ALTER FUNCTION "public"."detect_r6_falta_paciente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_r7_glosa"() RETURNS TABLE("session_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'GLOSA';
END;
$$;


ALTER FUNCTION "public"."detect_r7_glosa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_sessions_without_authorization"() RETURNS TABLE("session_key" "text", "data_sessao" "date", "status_agendamento" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."detect_sessions_without_authorization"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."detect_sessions_without_authorization"() IS 'Finds sessions that: (1) are active (not cancelled/rescheduled), (2) have passed the session date, (3) lack authorization records (excluding SEM_SOLICITACAO status).';



CREATE OR REPLACE FUNCTION "public"."executar_relatorio_crm_inconsistente"() RETURNS TABLE("nome_medico_normalizado" "text", "qtd_crms" bigint)
    LANGUAGE "sql"
    AS $$
    select
        nome_medico_normalizado,
        count(distinct crm_numero)
    from paciente_medico_vigente
    where crm_numero is not null
    and crm_numero <> ''
    group by nome_medico_normalizado
    having count(distinct crm_numero) > 1;
$$;


ALTER FUNCTION "public"."executar_relatorio_crm_inconsistente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_carga_dia"("profissional_ids" bigint[], "p_data" "date") RETURNS TABLE("profissional_id" bigint, "total" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT a.profissional_id, COUNT(*)::BIGINT AS total
  FROM public.agenda_tita a
  WHERE a.profissional_id = ANY(profissional_ids)
    AND a.data_atendimento = p_data
    AND a.ativo = TRUE
  GROUP BY a.profissional_id;
$$;


ALTER FUNCTION "public"."fn_carga_dia"("profissional_ids" bigint[], "p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_continuidade_semana"("p_paciente_ids" bigint[], "p_data" "date", "profissional_ids" bigint[]) RETURNS TABLE("profissional_id" bigint, "paciente_id" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT DISTINCT a.profissional_id, a.paciente_id
  FROM public.agenda_tita a
  WHERE a.profissional_id = ANY(profissional_ids)
    AND a.paciente_id     = ANY(p_paciente_ids)
    AND a.ativo = TRUE
    AND DATE_TRUNC('week', a.data_atendimento) = DATE_TRUNC('week', p_data);
$$;


ALTER FUNCTION "public"."fn_continuidade_semana"("p_paciente_ids" bigint[], "p_data" "date", "profissional_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_substituicoes_competencia"("profissional_ids" bigint[], "p_competencia" "text") RETURNS TABLE("profissional_id" bigint, "total" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT sh.profissional_substituto_id AS profissional_id, COUNT(*)::BIGINT AS total
  FROM public.substituicoes_historico sh
  WHERE sh.profissional_substituto_id = ANY(profissional_ids)
    AND sh.competencia = p_competencia
    AND sh.cancelada = FALSE
  GROUP BY sh.profissional_substituto_id;
$$;


ALTER FUNCTION "public"."fn_substituicoes_competencia"("profissional_ids" bigint[], "p_competencia" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_tita_grade"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
  seg0  date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- Semana corrente (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', seg0::text, 'data_fim', (seg0 + 4)::text)
  );
  -- Próxima semana (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', (seg0 + 7)::text, 'data_fim', (seg0 + 11)::text)
  );
  -- Semana 2 à frente (Seg–Sex)
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object('Authorization', _auth, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('data_inicio', (seg0 + 14)::text, 'data_fim', (seg0 + 18)::text)
  );
END;
$$;


ALTER FUNCTION "public"."fn_sync_tita_grade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_tita_grade_hoje"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
  seg   date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex   date := seg + 4;
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data_inicio', seg::text,
      'data_fim',    sex::text
    )
  );
END;
$$;


ALTER FUNCTION "public"."fn_sync_tita_grade_hoje"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_tita_hoje"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
BEGIN
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', _auth,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data', (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date::text
    )
  );
END;
$$;


ALTER FUNCTION "public"."fn_sync_tita_hoje"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_tita_semana"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  _url  text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo';
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
$$;


ALTER FUNCTION "public"."fn_sync_tita_semana"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auditoria_assim"("p_data" "date") RETURNS TABLE("bloco_id" "text", "paciente_id" "text", "paciente_nome" "text", "empresa" "text", "matricula" "text", "dep" "text", "carteirinha" "text", "data_atendimento" "date", "hora_inicial" time without time zone, "codigo_tuss" "text", "convenio_nome" "text", "terapias" "text", "profissionais" "text", "quantidade_sessoes" bigint, "guia" "text", "status_assim" "text", "codigo_erro" "text", "descricao_erro" "text", "data_execucao" timestamp with time zone, "autorizacao_updated_at" timestamp with time zone, "diferenca_minutos" numeric, "situacao" "text", "prioridade" integer, "dias_atraso" integer, "possui_autorizacao" boolean, "possui_solicitacao" boolean, "observacao" "text", "motivo_glosa" "text")
    LANGUAGE "sql" STABLE
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
      WHERE at.data_atendimento = p_data
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


ALTER FUNCTION "public"."get_auditoria_assim"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cco_stats"() RETURNS TABLE("atendimentos_total" bigint, "atendimentos_ativos" bigint, "session_authorizations" bigint, "session_mutations" bigint, "session_substitutions" bigint, "occurrences_total" bigint, "occurrences_ativas" bigint, "dashboard_snapshots" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_cco_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_cco_stats"() IS 'Returns count of records in CCO tables for validation and monitoring.';



CREATE OR REPLACE FUNCTION "public"."get_faltas_auditoria_assim"("p_data" "date") RETURNS TABLE("paciente_id" "text", "paciente_nome" "text", "data_atendimento" "date", "hora_inicial" time without time zone, "tuss" "text", "terapia_nome" "text", "tipo_falta" "text", "profissional_nome" "text")
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."get_faltas_auditoria_assim"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_kpis_auditoria_assim"("p_data" "date") RETURNS TABLE("total" bigint, "liberadas" bigint, "faltas" bigint, "nao_solicitadas" bigint, "sincronizando" bigint, "retorno_nao_confirmado" bigint, "canceladas" bigint, "glosas" bigint)
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_kpis_auditoria_assim"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.usuarios (id, nome, email, role, ativo, primeiro_acesso)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'recepcao'),
    false,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inserir_na_fila_autorizacoes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare

  v_crm text;
  v_nome_medico text;

begin

  if new.status = 'manual'
     and new.matricula is not null
     and new.tuss is not null then

    select
      pmv.crm_numero,
      pmv.nome_medico
    into
      v_crm,
      v_nome_medico
    from paciente_medico_vigente pmv
    where pmv.paciente_id = new.paciente_id::text
    order by pmv.updated_at desc
    limit 1;

    v_crm := coalesce(v_crm, new.crm);

    v_nome_medico :=
      coalesce(v_nome_medico, new.nome_medico);

    insert into fila_autorizacoes (

      agenda_id,
      paciente_id,
      paciente_nome,

      matricula,
      data_atendimento,
      horario,

      status,

      empresa,
      dep,

      crm,
      nome_medico,

      tuss,

      machine_id,
      created_at

    )
    values (

      new.id,
      new.paciente_id,
      new.paciente_nome,

      new.matricula,
      new.data_atendimento,
      new.horario,

      'concluido',

      new.empresa,
      new.dep,

      v_crm,
      v_nome_medico,

      new.tuss,

      'manual_trigger',
      now()

    )
    on conflict do nothing;

  end if;

  return new;

end;
$$;


ALTER FUNCTION "public"."inserir_na_fila_autorizacoes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agenda_orbita" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "text" NOT NULL,
    "paciente_nome" "text" NOT NULL,
    "matricula" "text",
    "empresa" "text",
    "dep" "text",
    "data_atendimento" "date" NOT NULL,
    "horario" time without time zone NOT NULL,
    "terapia" "text",
    "tuss" "text",
    "crm" "text",
    "nome_medico" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "ativo" boolean DEFAULT true,
    "crm_numero" "text",
    "crm_uf" "text",
    "crm_formatado" "text",
    "nome_medico_normalizado" "text"
);


ALTER TABLE "public"."agenda_orbita" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agenda_tita" (
    "id" bigint NOT NULL,
    "tita_agendamento_id" bigint NOT NULL,
    "origem" "text",
    "data_atendimento" "date",
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "paciente_id" bigint,
    "paciente_nome" "text",
    "cpf" "text",
    "profissional_id" bigint,
    "profissional_nome" "text",
    "profissional_cpf" "text",
    "terapia_id" bigint,
    "terapia_nome" "text",
    "terapia_exibicao_id" bigint,
    "terapia_exibicao_nome" "text",
    "sala_id" bigint,
    "sala_nome" "text",
    "sala_observacoes" "text",
    "clinica_id" bigint,
    "clinica_nome" "text",
    "convenio_id" bigint,
    "convenio_nome" "text",
    "numero_carteirinha" "text",
    "responsavel_nome" "text",
    "responsavel_telefone" "text",
    "responsavel_email" "text",
    "atividade" "text",
    "ativo" boolean DEFAULT true,
    "raw_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data_nascimento" "date",
    "motivo_inativacao" "text"
);


ALTER TABLE "public"."agenda_tita" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."agenda_tita_autorizacao" AS
 SELECT "a"."id",
    "a"."tita_agendamento_id",
    "a"."origem",
    "a"."data_atendimento",
    "a"."hora_inicial",
    "a"."hora_final",
    "a"."paciente_id",
    "a"."paciente_nome",
    "a"."cpf",
    "a"."data_nascimento",
    "a"."profissional_id",
    "a"."profissional_nome",
    "a"."profissional_cpf",
    "a"."terapia_id",
    "a"."terapia_nome",
    "a"."terapia_exibicao_id",
    "a"."terapia_exibicao_nome",
    "a"."sala_id",
    "a"."sala_nome",
    "a"."sala_observacoes",
    "a"."clinica_id",
    "a"."clinica_nome",
    "a"."convenio_id",
    "a"."convenio_nome",
    "a"."numero_carteirinha",
    "a"."responsavel_nome",
    "a"."responsavel_telefone",
    "a"."responsavel_email",
    "a"."atividade",
    "a"."ativo",
    "a"."raw_json",
    "a"."created_at",
    "a"."updated_at",
    "substring"("a"."numero_carteirinha", 1, 6) AS "empresa",
    "substring"("a"."numero_carteirinha", 7, 7) AS "matricula",
    "right"("regexp_replace"("a"."numero_carteirinha", '\D'::"text", ''::"text", 'g'::"text"), 2) AS "dep",
    "ao"."crm",
    "upper"("replace"("translate"(COALESCE("ao"."nome_medico", ''::"text"), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::"text", 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::"text"), '.'::"text", ''::"text")) AS "nome_medico",
        CASE
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Psicologia'::"text", 'Psicologia ABA'::"text", 'Arteterapia'::"text", 'Arteterapia (Psicologia ABA)'::"text", 'Avaliação Neuropsicológica'::"text", 'Habilidades Sociais (Psicologia ABA)'::"text"])) THEN '22070384'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Coordenador de Caso'::"text") THEN '22070384'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Fonoaudiologia'::"text") THEN '22070397'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Psicomotricidade'::"text") THEN '22070400'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Fisioterapia'::"text") THEN '22070419'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Terapia Ocupacional'::"text") THEN '22070427'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Psicopedagogia'::"text") THEN '22070435'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Musicoterapia'::"text") THEN '22070451'::"text"
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Nutrição'::"text", 'Terapia Alimentar'::"text"])) THEN '22070460'::"text"
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Hidroterapia'::"text", 'Fisioterapia Aquática'::"text"])) THEN '22070265'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Equoterapia'::"text") THEN '22070257'::"text"
            ELSE NULL::"text"
        END AS "codigo_tuss"
   FROM ("public"."agenda_tita" "a"
     LEFT JOIN LATERAL ( SELECT "o"."crm",
            "o"."nome_medico"
           FROM "public"."agenda_orbita" "o"
          WHERE ("o"."paciente_nome" = "a"."paciente_nome")
         LIMIT 1) "ao" ON (true))
  WHERE (("a"."ativo" = true) AND ("a"."paciente_nome" <> ALL (ARRAY['Horário Administrativo'::"text", 'Notificação Prévia'::"text"])) AND (
        CASE
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Psicologia'::"text", 'Psicologia ABA'::"text", 'Arteterapia'::"text", 'Arteterapia (Psicologia ABA)'::"text", 'Avaliação Neuropsicológica'::"text", 'Habilidades Sociais (Psicologia ABA)'::"text"])) THEN '22070384'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Coordenador de Caso'::"text") THEN '22070384'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Fonoaudiologia'::"text") THEN '22070397'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Psicomotricidade'::"text") THEN '22070400'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Fisioterapia'::"text") THEN '22070419'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Terapia Ocupacional'::"text") THEN '22070427'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Psicopedagogia'::"text") THEN '22070435'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Musicoterapia'::"text") THEN '22070451'::"text"
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Nutrição'::"text", 'Terapia Alimentar'::"text"])) THEN '22070460'::"text"
            WHEN ("a"."terapia_exibicao_nome" = ANY (ARRAY['Hidroterapia'::"text", 'Fisioterapia Aquática'::"text"])) THEN '22070265'::"text"
            WHEN ("a"."terapia_exibicao_nome" = 'Equoterapia'::"text") THEN '22070257'::"text"
            ELSE NULL::"text"
        END IS NOT NULL));


ALTER VIEW "public"."agenda_tita_autorizacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."autorizacoes_assim" (
    "guia" "text" NOT NULL,
    "matricula" "text",
    "paciente_nome" "text",
    "data_execucao" timestamp without time zone,
    "data_autorizacao" timestamp without time zone,
    "status" "text",
    "codigo_tuss" "text",
    "codigo_erro" "text",
    "descricao_erro" "text",
    "teve_token" boolean DEFAULT false,
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "token" "text",
    "status_tratado" "text",
    "matricula_limpa" "text",
    "paciente_id" bigint
);


ALTER TABLE "public"."autorizacoes_assim" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fila_autorizacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "text" NOT NULL,
    "paciente_nome" "text" NOT NULL,
    "data_atendimento" "date" NOT NULL,
    "horario" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "criado_por" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone,
    "machine_id" "text",
    "empresa" "text",
    "matricula" "text",
    "dep" "text",
    "crm" "text",
    "nome_medico" "text",
    "tuss1" "text",
    "tuss" "text",
    "tipo_falta" "text",
    "terapia_falta" "text",
    "agenda_id" "uuid",
    "completion_type" "text" DEFAULT 'automated'::"text",
    "completed_at" timestamp without time zone,
    "completed_by" "text",
    "numero_autorizacao" "text",
    "started_at" timestamp without time zone,
    "execution_time_ms" integer,
    "error_message" "text",
    "status_assim" "text",
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "data_horario" timestamp with time zone,
    "usuario_id" "text",
    "terapia_nome" "text",
    "terapia_exibicao_id" bigint,
    "tita_agendamento_id" bigint,
    "forma_autorizacao" "text",
    "validacao_finalizada_em" timestamp without time zone,
    "justificativa_falta" "text",
    CONSTRAINT "chk_status" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'processando'::"text", 'executando'::"text", 'concluido'::"text", 'erro'::"text", 'falta'::"text", 'glosa'::"text", 'cancelado'::"text"])))
);

ALTER TABLE ONLY "public"."fila_autorizacoes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."fila_autorizacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maquinas" (
    "id" "text" NOT NULL,
    "nome" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid",
    "last_seen" timestamp without time zone,
    "ativa" boolean DEFAULT true,
    "hostname" "text",
    "ip" "text",
    "token_maquina" "text",
    "sistema_operacional" "text",
    "navegador" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "restart_solicitado" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."maquinas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_central_pacientes" AS
( SELECT DISTINCT ON ("fa"."id") "fa"."id",
    "fa"."agenda_id",
    "fa"."paciente_id",
    "fa"."paciente_nome",
    "fa"."data_atendimento",
    "fa"."horario",
    (((("fa"."data_atendimento")::"text" || ' '::"text") || ("fa"."horario")::"text"))::timestamp without time zone AS "data_horario",
    "fa"."status",
    "fa"."status_assim",
    "fa"."tipo_falta",
    "fa"."completion_type",
    "fa"."numero_autorizacao",
    "fa"."machine_id",
    "fa"."error_message",
    "fa"."execution_time_ms",
    "fa"."created_at",
    "fa"."updated_at",
    "fa"."assim_updated_at",
    "fa"."horario_autorizacao",
    "fa"."terapia_exibicao_id",
    "fa"."terapia_nome" AS "classificacao_terapia",
    "fa"."forma_autorizacao",
    "ag"."hora_inicial",
    "ag"."hora_final",
    "ag"."profissional_nome",
    "ag"."profissional_id",
    "ag"."terapia_nome",
    "ag"."terapia_exibicao_nome",
    "ag"."sala_nome",
    "ag"."clinica_nome",
    "ag"."convenio_nome",
    "ag"."responsavel_nome",
    "ag"."responsavel_telefone",
    "ag"."numero_carteirinha",
    "ag"."sala_nome" AS "unidade",
    "ag"."convenio_nome" AS "convenio",
    "maq"."nome" AS "usuario_nome",
        CASE
            WHEN ("fa"."status" = 'erro'::"text") THEN 'erro'::"text"
            WHEN ("fa"."status" = 'processando'::"text") THEN 'processando'::"text"
            WHEN ("fa"."tipo_falta" = 'terapeuta'::"text") THEN 'falta_terapeuta'::"text"
            WHEN ("fa"."tipo_falta" = 'paciente'::"text") THEN 'falta_paciente'::"text"
            WHEN ("fa"."status_assim" = 'autorizado'::"text") THEN 'autorizado'::"text"
            WHEN ("fa"."status" = 'concluido'::"text") THEN 'autorizado'::"text"
            WHEN ("fa"."status" = 'pendente'::"text") THEN 'pendente'::"text"
            ELSE COALESCE("fa"."status", 'pendente'::"text")
        END AS "status_operacional"
   FROM (("public"."fila_autorizacoes" "fa"
     LEFT JOIN "public"."maquinas" "maq" ON (("maq"."id" = "fa"."machine_id")))
     LEFT JOIN "public"."agenda_tita_autorizacao" "ag" ON (((("fa"."paciente_id")::bigint = "ag"."paciente_id") AND ("fa"."data_atendimento" = "ag"."data_atendimento") AND ("fa"."horario" = "ag"."hora_inicial") AND ("lower"(TRIM(BOTH FROM COALESCE("fa"."terapia_nome", ''::"text"))) = "lower"(TRIM(BOTH FROM COALESCE("ag"."terapia_nome", ''::"text")))))))
  WHERE (("fa"."id" IS NOT NULL) AND (("fa"."status" IS NOT NULL) OR ("fa"."status_assim" IS NOT NULL) OR ("fa"."numero_autorizacao" IS NOT NULL) OR ("fa"."tipo_falta" IS NOT NULL)))
  ORDER BY "fa"."id", "fa"."created_at" DESC NULLS LAST, "ag"."updated_at" DESC NULLS LAST, "ag"."created_at" DESC NULLS LAST)
UNION ALL
 SELECT "p2"."id",
    "p2"."agenda_id",
    "p2"."paciente_id",
    "p2"."paciente_nome",
    "p2"."data_atendimento",
    "p2"."horario",
    "p2"."data_horario",
    "p2"."status",
    "p2"."status_assim",
    "p2"."tipo_falta",
    "p2"."completion_type",
    "p2"."numero_autorizacao",
    "p2"."machine_id",
    "p2"."error_message",
    "p2"."execution_time_ms",
    "p2"."created_at",
    "p2"."updated_at",
    "p2"."assim_updated_at",
    "p2"."horario_autorizacao",
    "p2"."terapia_exibicao_id",
    "p2"."classificacao_terapia",
    "p2"."forma_autorizacao",
    "p2"."hora_inicial",
    "p2"."hora_final",
    "p2"."profissional_nome",
    "p2"."profissional_id",
    "p2"."terapia_nome",
    "p2"."terapia_exibicao_nome",
    "p2"."sala_nome",
    "p2"."clinica_nome",
    "p2"."convenio_nome",
    "p2"."responsavel_nome",
    "p2"."responsavel_telefone",
    "p2"."numero_carteirinha",
    "p2"."unidade",
    "p2"."convenio",
    "p2"."usuario_nome",
    "p2"."status_operacional"
   FROM ( WITH "agenda_com_tuss" AS (
                 SELECT "at"."id",
                    "at"."paciente_id",
                    "at"."paciente_nome",
                    "at"."data_atendimento",
                    "at"."hora_inicial",
                    "at"."hora_final",
                    "at"."profissional_id",
                    "at"."profissional_nome",
                    "at"."terapia_nome",
                    "at"."terapia_exibicao_id",
                    "at"."terapia_exibicao_nome",
                    "at"."sala_nome",
                    "at"."clinica_nome",
                    "at"."convenio_nome",
                    "at"."responsavel_nome",
                    "at"."responsavel_telefone",
                    "at"."numero_carteirinha",
                        CASE
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Psicologia'::"text", 'Psicologia ABA'::"text", 'Arteterapia'::"text", 'Arteterapia (Psicologia ABA)'::"text", 'Avaliação Neuropsicológica'::"text", 'Habilidades Sociais (Psicologia ABA)'::"text"])) THEN '22070384'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Fonoaudiologia'::"text") THEN '22070397'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Psicomotricidade'::"text") THEN '22070400'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Fisioterapia'::"text") THEN '22070419'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Terapia Ocupacional'::"text") THEN '22070427'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Psicopedagogia'::"text") THEN '22070435'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Musicoterapia'::"text") THEN '22070451'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Nutrição'::"text", 'Terapia Alimentar'::"text"])) THEN '22070460'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Hidroterapia'::"text", 'Fisioterapia Aquática'::"text"])) THEN '22070265'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Equoterapia'::"text") THEN '22070257'::"text"
                            ELSE NULL::"text"
                        END AS "codigo_tuss"
                   FROM "public"."agenda_tita" "at"
                  WHERE ("at"."paciente_nome" <> ALL (ARRAY['Horário Administrativo'::"text", 'Notificação Prévia'::"text"]))
                ), "slots_sem_fila" AS (
                 SELECT "agenda_com_tuss"."id",
                    "agenda_com_tuss"."paciente_id",
                    "agenda_com_tuss"."paciente_nome",
                    "agenda_com_tuss"."data_atendimento",
                    "agenda_com_tuss"."hora_inicial",
                    "agenda_com_tuss"."hora_final",
                    "agenda_com_tuss"."profissional_id",
                    "agenda_com_tuss"."profissional_nome",
                    "agenda_com_tuss"."terapia_nome",
                    "agenda_com_tuss"."terapia_exibicao_id",
                    "agenda_com_tuss"."terapia_exibicao_nome",
                    "agenda_com_tuss"."sala_nome",
                    "agenda_com_tuss"."clinica_nome",
                    "agenda_com_tuss"."convenio_nome",
                    "agenda_com_tuss"."responsavel_nome",
                    "agenda_com_tuss"."responsavel_telefone",
                    "agenda_com_tuss"."numero_carteirinha",
                    "agenda_com_tuss"."codigo_tuss",
                    "row_number"() OVER (PARTITION BY "agenda_com_tuss"."paciente_id", "agenda_com_tuss"."data_atendimento", "agenda_com_tuss"."codigo_tuss" ORDER BY "agenda_com_tuss"."hora_inicial") AS "ordem"
                   FROM "agenda_com_tuss"
                  WHERE (("agenda_com_tuss"."codigo_tuss" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM "public"."fila_autorizacoes" "fa"
                          WHERE ((("fa"."paciente_id")::bigint = "agenda_com_tuss"."paciente_id") AND ("fa"."data_atendimento" = "agenda_com_tuss"."data_atendimento") AND ("fa"."horario" = "agenda_com_tuss"."hora_inicial"))))))
                ), "guias_sem_fila" AS (
                 SELECT "aa"."guia",
                    "aa"."matricula",
                    "aa"."paciente_nome",
                    "aa"."data_execucao",
                    "aa"."data_autorizacao",
                    "aa"."status",
                    "aa"."codigo_tuss",
                    "aa"."codigo_erro",
                    "aa"."descricao_erro",
                    "aa"."teve_token",
                    "aa"."updated_at",
                    "aa"."token",
                    "aa"."status_tratado",
                    "aa"."matricula_limpa",
                    "aa"."paciente_id",
                    "row_number"() OVER (PARTITION BY "aa"."paciente_id", (("aa"."data_execucao")::"date"), "aa"."codigo_tuss" ORDER BY "aa"."guia") AS "ordem"
                   FROM "public"."autorizacoes_assim" "aa"
                  WHERE (("aa"."codigo_tuss" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM "public"."fila_autorizacoes" "fa"
                          WHERE ("fa"."numero_autorizacao" = "aa"."guia")))))
                )
         SELECT ((((((((("substr"("md5"(((((("s"."paciente_id")::"text" || '|'::"text") || ("s"."data_atendimento")::"text") || '|'::"text") || ("s"."hora_inicial")::"text")), 1, 8) || '-'::"text") || "substr"("md5"(((((("s"."paciente_id")::"text" || '|'::"text") || ("s"."data_atendimento")::"text") || '|'::"text") || ("s"."hora_inicial")::"text")), 9, 4)) || '-'::"text") || "substr"("md5"(((((("s"."paciente_id")::"text" || '|'::"text") || ("s"."data_atendimento")::"text") || '|'::"text") || ("s"."hora_inicial")::"text")), 13, 4)) || '-'::"text") || "substr"("md5"(((((("s"."paciente_id")::"text" || '|'::"text") || ("s"."data_atendimento")::"text") || '|'::"text") || ("s"."hora_inicial")::"text")), 17, 4)) || '-'::"text") || "substr"("md5"(((((("s"."paciente_id")::"text" || '|'::"text") || ("s"."data_atendimento")::"text") || '|'::"text") || ("s"."hora_inicial")::"text")), 21, 12)))::"uuid" AS "id",
            NULL::"uuid" AS "agenda_id",
            ("s"."paciente_id")::"text" AS "paciente_id",
            "s"."paciente_nome",
            "s"."data_atendimento",
            "s"."hora_inicial" AS "horario",
            (((("s"."data_atendimento")::"text" || ' '::"text") || ("s"."hora_inicial")::"text"))::timestamp without time zone AS "data_horario",
            'concluido'::"text" AS "status",
            'autorizado'::"text" AS "status_assim",
            NULL::"text" AS "tipo_falta",
            'automated'::"text" AS "completion_type",
            "g"."guia" AS "numero_autorizacao",
            NULL::"text" AS "machine_id",
            NULL::"text" AS "error_message",
            NULL::integer AS "execution_time_ms",
            "g"."data_autorizacao" AS "created_at",
            "g"."updated_at",
            "g"."updated_at" AS "assim_updated_at",
            "g"."data_autorizacao" AS "horario_autorizacao",
            "s"."terapia_exibicao_id",
            "s"."terapia_nome" AS "classificacao_terapia",
            'automatico'::"text" AS "forma_autorizacao",
            "s"."hora_inicial",
            "s"."hora_final",
            "s"."profissional_nome",
            "s"."profissional_id",
            "s"."terapia_nome",
            "s"."terapia_exibicao_nome",
            "s"."sala_nome",
            "s"."clinica_nome",
            "s"."convenio_nome",
            "s"."responsavel_nome",
            "s"."responsavel_telefone",
            "s"."numero_carteirinha",
            "s"."sala_nome" AS "unidade",
            "s"."convenio_nome" AS "convenio",
            NULL::"text" AS "usuario_nome",
            'autorizado'::"text" AS "status_operacional"
           FROM ("slots_sem_fila" "s"
             JOIN "guias_sem_fila" "g" ON ((("g"."paciente_id" = "s"."paciente_id") AND (("g"."data_execucao")::"date" = "s"."data_atendimento") AND ("g"."codigo_tuss" = "s"."codigo_tuss") AND ("g"."ordem" = "s"."ordem"))))) "p2";


ALTER VIEW "public"."vw_central_pacientes" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_central_pacientes"("p_data" "date") RETURNS SETOF "public"."vw_central_pacientes"
    LANGUAGE "sql" STABLE
    AS $$

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
        END AS status_operacional
    FROM public.fila_autorizacoes fa
    LEFT JOIN public.maquinas maq
        ON maq.id = fa.machine_id
    LEFT JOIN public.agenda_tita_autorizacao ag
        ON  fa.paciente_id::bigint = ag.paciente_id
        AND fa.data_atendimento    = ag.data_atendimento
        AND fa.horario             = ag.hora_inicial
        AND lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) =
            lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))
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
        p2.unidade, p2.convenio, p2.usuario_nome, p2.status_operacional
    FROM (
        WITH
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
                    ORDER BY aa.data_execucao ASC
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
            'autorizado'::text        AS status_operacional
        FROM slots_sem_fila s
        INNER JOIN guias_sem_fila g
            ON  g.paciente_id         = s.paciente_id
            AND g.data_execucao::date = s.data_atendimento
            AND g.codigo_tuss         = s.codigo_tuss
            AND g.ordem               = s.ordem
    ) p2
)

$$;


ALTER FUNCTION "public"."listar_central_pacientes"("p_data" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preencher_paciente_assim"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin

  new.matricula_limpa :=
    case
      when new.matricula like '%.%.%'
        then split_part(new.matricula, '.', 2)
      else regexp_replace(new.matricula, '\D', '', 'g')
    end;

  select ao.paciente_id::bigint
  into new.paciente_id
  from agenda_orbita ao
  where ao.matricula = new.matricula_limpa
  order by ao.created_at desc
  limit 1;

  return new;

end;
$$;


ALTER FUNCTION "public"."preencher_paciente_assim"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_horarios_disponiveis"("p_data" "date", "p_unidade" "text") RETURNS TABLE("hora" time without time zone)
    LANGUAGE "sql"
    AS $$

    select distinct
        hora_inicial as hora

    from vw_central_terapeutica

    where
        data_atendimento = p_data
        and unidade = p_unidade

    order by hora_inicial;

$$;


ALTER FUNCTION "public"."rpc_horarios_disponiveis"("p_data" "date", "p_unidade" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sample_cco_data"() RETURNS TABLE("data_type" "text", "sample" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."sample_cco_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_data_atualizacao"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.data_atualizacao = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_data_atualizacao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_assim_results"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE fila_autorizacoes fa
  SET
    status_assim        = vm.status_assim,
    status              = CASE
      WHEN vm.status_assim = 'Liberado *'
        AND fa.status <> 'concluido'
        THEN 'cancelado'
      WHEN vm.status_assim = 'Liberado'
        AND fa.status = 'erro'
        THEN 'concluido'
      WHEN vm.status_assim IS NOT NULL
        AND vm.status_assim NOT ILIKE '%Liberado%'
        AND fa.status NOT IN ('concluido', 'falta', 'pendente')
        THEN 'glosa'
      ELSE fa.status
    END,
    numero_autorizacao  = vm.guia,
    horario_autorizacao = vm.data_execucao,
    error_message       = CASE
      WHEN vm.status_assim ILIKE '%REINCIDENCIA%' THEN vm.status_assim
      WHEN vm.status_assim ILIKE '%ERRO%'         THEN vm.status_assim
      ELSE NULL
    END,
    assim_updated_at    = NOW()
  FROM vw_match_autorizacoes_assim vm
  WHERE fa.paciente_id::bigint = vm.paciente_id
    AND fa.data_atendimento    = vm.data_atendimento
    AND fa.horario             = vm.hora_inicial;
END;
$$;


ALTER FUNCTION "public"."sync_assim_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_activation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.perfis
  SET ativo = NEW.email_confirmed_at IS NOT NULL
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_user_activation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_occurrences_view"() RETURNS TABLE("view_exists" boolean, "record_count" bigint, "columns" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."test_occurrences_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_log_fila_autorizacoes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$

declare

  descricao_evento text;

begin

  -- ============================================
  -- INSERT
  -- ============================================

  if tg_op = 'INSERT' then

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Solicitação criada'

        when new.status = 'processando'
          then 'Processamento iniciado'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'falta'
          then 'Falta registrada'

        when new.status = 'erro'
          then 'Erro operacional'

        else
          'Registro criado'

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      new.horario_autorizacao,
      new.numero_autorizacao,

      jsonb_build_object(

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  -- ============================================
  -- UPDATE
  -- ============================================

  if tg_op = 'UPDATE' then

    if

      old.status is not distinct from new.status

      and old.numero_autorizacao
      is not distinct from
      new.numero_autorizacao

      and old.tipo_falta
      is not distinct from
      new.tipo_falta

      and old.completion_type
      is not distinct from
      new.completion_type

    then
      return new;
    end if;

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Autorização reenviada'

        when new.status = 'processando'
          then 'Worker iniciou processamento'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'erro'
          then 'Erro operacional'

        when new.status = 'falta'

          then

            case

              when new.tipo_falta = 'terapeuta'
                then 'Falta do terapeuta'

              when new.tipo_falta = 'paciente'
                then 'Falta do paciente'

              else 'Falta registrada'

            end

        else

          concat(
            'Status alterado para ',
            coalesce(new.status, 'desconhecido')
          )

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      new.horario_autorizacao,
      new.numero_autorizacao,

      jsonb_build_object(

        'status_anterior',
        old.status,

        'status_novo',
        new.status,

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  return new;

end;

$$;


ALTER FUNCTION "public"."trigger_log_fila_autorizacoes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_dashboard_snapshot"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."update_dashboard_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_controle_disponibilidade"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_controle_disponibilidade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") RETURNS TABLE("upserted_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") IS 'Upsert multiple session records into cco.atendimentos. Accepts array of JSON objects. v2: includes id_profissional_tratativa and origem_tratativa.';



CREATE OR REPLACE FUNCTION "public"."upsert_occurrences"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."upsert_occurrences"("p_rows" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "cco"."atendimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_key" "text" NOT NULL,
    "tita_agendamento_id" bigint,
    "paciente_nome" "text" NOT NULL,
    "data_sessao" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fim" time without time zone,
    "profissional_agendado" "text",
    "terapia" "text",
    "convenio" "text",
    "unidade" "text",
    "status_agendamento" "text",
    "justificativa" "text",
    "possui_tratativa" boolean,
    "profissional_tratativa" "text",
    "data_tratativa" "date",
    "sync_hash" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "orphaned_at" timestamp with time zone,
    "orphan_reason" "text",
    "id_profissional_tratativa" bigint,
    "origem_tratativa" "text"
);


ALTER TABLE "cco"."atendimentos" OWNER TO "postgres";


COMMENT ON TABLE "cco"."atendimentos" IS 'Consolidated session view across TITA agenda, ASSIM authorizations, and operational data. Sidecar pattern: read-only for legacy sources.';



COMMENT ON COLUMN "cco"."atendimentos"."session_key" IS 'Deterministic conciliation key: sha256(unaccent(lower(trim(paciente_nome))) || data_sessao || hora_inicio). Must be normalized before hash in application layer.';



COMMENT ON COLUMN "cco"."atendimentos"."sync_hash" IS 'Change detection hash to skip unnecessary updates. Computed in application layer.';



COMMENT ON COLUMN "cco"."atendimentos"."orphaned_at" IS 'Timestamp de quando a sessão foi marcada como órfã (session_key_old após remarcação). Registros em soft-delete permitem auditoria por 30 dias antes de hard-delete.';



COMMENT ON COLUMN "cco"."atendimentos"."orphan_reason" IS 'Razão pela qual a sessão foi marcada como órfã (ex: "RESCHEDULED → abc123...def456...")';



COMMENT ON COLUMN "cco"."atendimentos"."id_profissional_tratativa" IS 'ID numérico do profissional que registrou a tratativa (TITA: "id profissional tratativa").';



COMMENT ON COLUMN "cco"."atendimentos"."origem_tratativa" IS 'Origem da tratativa (TITA: "origem tratativa"). Ex: manual, automatica.';



CREATE TABLE IF NOT EXISTS "cco"."dashboard_snapshot" (
    "id" bigint NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "data_ref" "date" NOT NULL,
    "autorizacoes_pendentes" integer,
    "sessoes_sem_autorizacao" integer,
    "evolucoes_atrasadas" integer,
    "faltas_terapeuta" integer,
    "substituicoes" integer,
    "faltas_paciente" integer,
    "glosas" integer,
    "receita_em_risco_count" integer
);


ALTER TABLE "cco"."dashboard_snapshot" OWNER TO "postgres";


COMMENT ON TABLE "cco"."dashboard_snapshot" IS 'Pre-calculated dashboard counters updated daily by conciliation-engine. Guarantees <500ms response time. UPSERT by data_ref ensures exactly one row per date.';



COMMENT ON COLUMN "cco"."dashboard_snapshot"."data_ref" IS 'Reference date for dashboard snapshot. UNIQUE constraint prevents duplicates. Expected one row per day.';



CREATE SEQUENCE IF NOT EXISTS "cco"."dashboard_snapshot_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "cco"."dashboard_snapshot_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "cco"."dashboard_snapshot_id_seq" OWNED BY "cco"."dashboard_snapshot"."id";



CREATE TABLE IF NOT EXISTS "cco"."occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_key" "text" NOT NULL,
    "tipo" "cco"."occurrence_type_enum" NOT NULL,
    "severity" "cco"."severity_enum" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "impacto_financeiro" numeric(10,2),
    "responsavel_acao" "text",
    "acao_recomendada" "text",
    "fingerprint" "text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payload_json" "jsonb"
);


ALTER TABLE "cco"."occurrences" OWNER TO "postgres";


COMMENT ON TABLE "cco"."occurrences" IS 'Ocorrências detectadas pelo motor de conciliação. Cada tipo de problema gera uma ocorrência com fingerprint único por session_key + tipo. Pode ser reaberta automaticamente se condição reaparecer.';



COMMENT ON COLUMN "cco"."occurrences"."fingerprint" IS 'Idempotency key: sha256(session_key || tipo || date_trunc(''day'', data_sessao)). Daily granularity prevents duplicate occurrences within same day. Computed in conciliation-engine.';



COMMENT ON COLUMN "cco"."occurrences"."resolved_at" IS 'Timestamp when occurrence was manually resolved by user. NULL = unresolved. Retention policy: rows with resolved_at < now()-90days are deleted daily at 01:00 UTC.';



COMMENT ON COLUMN "cco"."occurrences"."payload_json" IS 'Dados contextuais da ocorrência em JSON (timestamps, IDs, valores brutos). Permite rastrear valores no momento da detecção sem multiplicar colunas da tabela.';



CREATE TABLE IF NOT EXISTS "cco"."processing_logs" (
    "id" bigint NOT NULL,
    "job_name" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "finished_at" timestamp with time zone,
    "status" "text",
    "rows_processed" integer,
    "error_message" "text"
);


ALTER TABLE "cco"."processing_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "cco"."processing_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "cco"."processing_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "cco"."processing_logs_id_seq" OWNED BY "cco"."processing_logs"."id";



CREATE TABLE IF NOT EXISTS "cco"."session_authorizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_key" "text" NOT NULL,
    "source" "cco"."authorization_source_enum" NOT NULL,
    "guia" "text",
    "status_assim" "text",
    "status_tratado" "text",
    "data_autorizacao" timestamp with time zone,
    "fila_id" "uuid",
    "status_fila" "text",
    "forma_autorizacao" "text",
    "numero_autorizacao" "text",
    "authorization_status" "cco"."authorization_status_enum" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "inherited_from" "text"
);


ALTER TABLE "cco"."session_authorizations" OWNER TO "postgres";


COMMENT ON TABLE "cco"."session_authorizations" IS 'Authorization status from two sources: ASSIM (sistema_assim) and FILA (fila_autorizacoes). UPSERT by (session_key, source) ensures no duplicates per source.';



COMMENT ON COLUMN "cco"."session_authorizations"."source" IS 'Data source: ''assim'' for autorizacoes_assim table, ''fila'' for fila_autorizacoes table.';



COMMENT ON COLUMN "cco"."session_authorizations"."inherited_from" IS 'session_key da sessão antiga quando autorização foi herdada após remarcação. NULL = autorização original ou sincronia normal.';



CREATE TABLE IF NOT EXISTS "cco"."session_mutations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tita_agendamento_id" bigint NOT NULL,
    "session_key_old" "text" NOT NULL,
    "session_key_new" "text" NOT NULL,
    "mutation_type" "text" NOT NULL,
    "data_sessao_old" "date",
    "data_sessao_new" "date",
    "hora_inicio_old" time without time zone,
    "hora_inicio_new" time without time zone,
    "paciente_nome" "text",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "consolidation_note" "text",
    CONSTRAINT "session_mutations_mutation_type_check" CHECK (("mutation_type" = ANY (ARRAY['RESCHEDULED'::"text", 'DELETED'::"text", 'CONSOLIDATED'::"text"])))
);


ALTER TABLE "cco"."session_mutations" OWNER TO "postgres";


COMMENT ON TABLE "cco"."session_mutations" IS 'Change log de mutações de sessões. Quando uma sessão é remarcada em TITA (data/hora muda) ou deletada, registra session_key_old → session_key_new para rastreamento de herança de autorizações e validação de orphans.';



CREATE TABLE IF NOT EXISTS "cco"."session_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_key" "text" NOT NULL,
    "tita_agendamento_id" bigint NOT NULL,
    "status_ct" "text" NOT NULL,
    "profissional_substituto_nome" "text",
    "profissional_substituto_id" bigint,
    "confirmado_em" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ck_status_ct" CHECK (("status_ct" = ANY (ARRAY['falta'::"text", 'substituto'::"text", 'presente'::"text", 'confirmado'::"text"])))
);


ALTER TABLE "cco"."session_substitutions" OWNER TO "postgres";


COMMENT ON TABLE "cco"."session_substitutions" IS 'Therapist substitution records from controle_terapeutico. Source of truth for absences and replacements.';



COMMENT ON COLUMN "cco"."session_substitutions"."status_ct" IS 'Status copied from controle_terapeutico table. Valid values: falta, substituto, presente, confirmado.';



CREATE OR REPLACE VIEW "public"."agenda_classificada" AS
 SELECT "id",
    "paciente_id",
    "paciente_nome",
    "matricula",
    "empresa",
    "dep",
    "data_atendimento",
    "horario",
    "terapia",
    "tuss",
    "crm",
    "nome_medico",
    "created_at",
    "updated_at",
    "ativo",
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM "public"."fila_autorizacoes" "f"
              WHERE (("f"."matricula" = "a"."matricula") AND ("f"."data_atendimento" = "a"."data_atendimento") AND ("f"."tuss" = "a"."tuss")))) THEN 'robo'::"text"
            WHEN (EXISTS ( SELECT 1
               FROM "public"."autorizacoes_assim" "aa"
              WHERE (("aa"."matricula_limpa" = "a"."matricula") AND (("aa"."data_execucao")::"date" = "a"."data_atendimento") AND ("aa"."codigo_tuss" = "a"."tuss") AND ("abs"((EXTRACT(epoch FROM (("aa"."data_execucao")::time without time zone - "a"."horario")) / (60)::numeric)) <= (20)::numeric)))) THEN 'manual'::"text"
            ELSE 'pendente'::"text"
        END AS "status"
   FROM "public"."agenda_orbita" "a";


ALTER VIEW "public"."agenda_classificada" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agenda_terapias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "text" NOT NULL,
    "paciente_nome" "text" NOT NULL,
    "matricula" "text",
    "empresa" "text",
    "dep" "text",
    "data_atendimento" "date" NOT NULL,
    "horario" time without time zone NOT NULL,
    "terapia" "text",
    "tuss" "text",
    "crm" "text",
    "nome_medico" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agenda_terapias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agenda_tita_autorizacao_backup_20260508" (
    "id" bigint,
    "tita_agendamento_id" bigint,
    "origem" "text",
    "data_atendimento" "date",
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "paciente_id" bigint,
    "paciente_nome" "text",
    "cpf" "text",
    "profissional_id" bigint,
    "profissional_nome" "text",
    "profissional_cpf" "text",
    "terapia_id" bigint,
    "terapia_nome" "text",
    "terapia_exibicao_id" bigint,
    "terapia_exibicao_nome" "text",
    "sala_id" bigint,
    "sala_nome" "text",
    "sala_observacoes" "text",
    "clinica_id" bigint,
    "clinica_nome" "text",
    "convenio_id" bigint,
    "convenio_nome" "text",
    "numero_carteirinha" "text",
    "responsavel_nome" "text",
    "responsavel_telefone" "text",
    "responsavel_email" "text",
    "atividade" "text",
    "ativo" boolean,
    "raw_json" "jsonb",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "empresa" "text",
    "matricula" "text",
    "dep" "text",
    "crm" "text",
    "nome_medico" "text",
    "codigo_tuss" "text"
);


ALTER TABLE "public"."agenda_tita_autorizacao_backup_20260508" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paciente_medico_vigente" (
    "paciente_id" "text" NOT NULL,
    "crm_numero" "text",
    "crm_uf" "text",
    "crm_formatado" "text",
    "nome_medico" "text",
    "origem" "text" DEFAULT 'orbita'::"text",
    "vigente_desde" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "nome_medico_normalizado" "text",
    "crm_original" "text",
    "crm_suspeito" boolean DEFAULT false
);


ALTER TABLE "public"."paciente_medico_vigente" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."agenda_tita_autorizacao_v2" AS
 SELECT "a"."id",
    "a"."tita_agendamento_id",
    "a"."origem",
    "a"."data_atendimento",
    "a"."hora_inicial",
    "a"."hora_final",
    "a"."paciente_id",
    "a"."paciente_nome",
    "a"."cpf",
    "a"."profissional_id",
    "a"."profissional_nome",
    "a"."profissional_cpf",
    "a"."terapia_id",
    "a"."terapia_nome",
    "a"."terapia_exibicao_id",
    "a"."terapia_exibicao_nome",
    "a"."sala_id",
    "a"."sala_nome",
    "a"."sala_observacoes",
    "a"."clinica_id",
    "a"."clinica_nome",
    "a"."convenio_id",
    "a"."convenio_nome",
    "a"."numero_carteirinha",
    "a"."responsavel_nome",
    "a"."responsavel_telefone",
    "a"."responsavel_email",
    "a"."atividade",
    "a"."ativo",
    "a"."raw_json",
    "a"."created_at",
    "a"."updated_at",
    "a"."data_nascimento",
    "substring"("a"."numero_carteirinha", 1, 6) AS "empresa",
    "substring"("a"."numero_carteirinha", 7, 7) AS "matricula",
    "right"("regexp_replace"("a"."numero_carteirinha", '\D'::"text", ''::"text", 'g'::"text"), 2) AS "dep",
    "pmv"."crm_formatado" AS "crm",
    "pmv"."crm_numero",
    "pmv"."crm_uf",
    "upper"("replace"("translate"(COALESCE("pmv"."nome_medico", ''::"text"), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::"text", 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::"text"), '.'::"text", ''::"text")) AS "nome_medico"
   FROM ("public"."agenda_tita" "a"
     LEFT JOIN "public"."paciente_medico_vigente" "pmv" ON (("pmv"."paciente_id" = ("a"."paciente_id")::"text")))
  WHERE (("a"."ativo" = true) AND ("a"."paciente_nome" <> ALL (ARRAY['Horário Administrativo'::"text", 'Notificação Prévia'::"text"])));


ALTER VIEW "public"."agenda_tita_autorizacao_v2" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agenda_tita_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agenda_tita_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agenda_tita_id_seq" OWNED BY "public"."agenda_tita"."id";



CREATE TABLE IF NOT EXISTS "public"."auditoria_glosa_motivos" (
    "bloco_id" "text" NOT NULL,
    "motivo_glosa" "text" NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auditoria_glosa_motivos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."autorizacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_nome" "text",
    "empresa" "text",
    "matricula" "text",
    "dep" "text",
    "crm" "text",
    "nome_medico" "text",
    "terapia" "text",
    "tuss1" "text",
    "data_horario" timestamp without time zone,
    "usuario_id" "uuid",
    "machine_id" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "erro" "text",
    "log" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "paciente_id" "text",
    "data_atendimento" "date",
    "horario_atendimento" time without time zone,
    "orbita_agenda_id" "text",
    "erro_detalhe" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "horario" "text",
    "ultima_autorizacao" timestamp without time zone,
    CONSTRAINT "autorizacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'executando'::"text", 'concluido'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."autorizacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_fila_null_terapia" (
    "id" "uuid",
    "paciente_id" "text",
    "paciente_nome" "text",
    "data_atendimento" "date",
    "horario" time without time zone,
    "status" "text",
    "criado_por" "text",
    "created_at" timestamp without time zone,
    "updated_at" timestamp without time zone,
    "machine_id" "text",
    "empresa" "text",
    "matricula" "text",
    "dep" "text",
    "crm" "text",
    "nome_medico" "text",
    "tuss1" "text",
    "tuss" "text",
    "tipo_falta" "text",
    "terapia_falta" "text",
    "agenda_id" "uuid",
    "completion_type" "text",
    "completed_at" timestamp without time zone,
    "completed_by" "text",
    "numero_autorizacao" "text",
    "started_at" timestamp without time zone,
    "execution_time_ms" integer,
    "error_message" "text",
    "status_assim" "text",
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "data_horario" timestamp with time zone,
    "usuario_id" "text",
    "terapia_nome" "text",
    "terapia_exibicao_id" bigint
);


ALTER TABLE "public"."backup_fila_null_terapia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamada_paciente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agenda_id" "uuid",
    "nome" "text" NOT NULL,
    "sala" "text" DEFAULT '1'::"text",
    "chamado_por" "text",
    "unidade" "text" DEFAULT 'principal'::"text",
    "chamado_em" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'ativo'::"text"
);

ALTER TABLE ONLY "public"."chamada_paciente" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chamada_paciente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."config_regras_terapias" (
    "id" bigint NOT NULL,
    "categoria" "text" NOT NULL,
    "terapia_nome" "text" NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."config_regras_terapias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."config_regras_terapias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."config_regras_terapias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."config_regras_terapias_id_seq" OWNED BY "public"."config_regras_terapias"."id";



CREATE TABLE IF NOT EXISTS "public"."controle_disponibilidade_terapeutas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data" "date" NOT NULL,
    "agenda_id" bigint,
    "terapeuta_id" bigint NOT NULL,
    "terapeuta_nome" "text" NOT NULL,
    "terapia_id" bigint,
    "terapia_nome" "text",
    "hora_inicial" time without time zone NOT NULL,
    "hora_final" time without time zone,
    "status" "text" DEFAULT 'disponivel'::"text" NOT NULL,
    "possui_substituto" boolean DEFAULT false NOT NULL,
    "substituto_id" bigint,
    "substituto_nome" "text",
    "motivo" "text",
    "observacao" "text",
    "criado_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "controle_disponibilidade_terapeutas_status_check" CHECK (("status" = ANY (ARRAY['disponivel'::"text", 'indisponivel'::"text"])))
);


ALTER TABLE "public"."controle_disponibilidade_terapeutas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."controle_terapeutico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tita_agendamento_id" bigint NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "profissional_substituto_id" bigint,
    "observacao" "text",
    "confirmado_por" "uuid",
    "confirmado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data_atualizacao" timestamp with time zone,
    "profissional_substituto_nome" "text",
    "data_atendimento" "date",
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "profissional_id" bigint,
    "profissional_nome" "text",
    "terapia_id" bigint,
    "terapia_nome" "text",
    "confirmado_por_nome" "text",
    CONSTRAINT "controle_terapeutico_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'presente'::"text", 'faltou'::"text", 'disponivel'::"text", 'indisponivel'::"text", 'cobertura_planejada'::"text", 'cobertura_confirmada'::"text", 'substituido'::"text"])))
);


ALTER TABLE "public"."controle_terapeutico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_inconsistencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_medico_normalizado" "text",
    "crm_numero" "text",
    "ocorrencias" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_inconsistencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fila_autorizacoes_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fila_id" "uuid" NOT NULL,
    "status" "text",
    "descricao" "text",
    "usuario" "text",
    "machine_id" "text",
    "erro" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tita_agendamento_id" bigint,
    "horario_autorizacao" timestamp with time zone,
    "numero_autorizacao" "text"
);


ALTER TABLE "public"."fila_autorizacoes_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grade_profissionais_tita" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grade_terapeuta_id" bigint NOT NULL,
    "grade_clinica_id" bigint,
    "profissional_id" bigint,
    "nome_profissional" "text",
    "cpf_profissional" "text",
    "numero_telefone" "text",
    "cbo_profissional" "text",
    "registro_profissional" "text",
    "tipo_registro_profissional" "text",
    "uf_registro_profissional" "text",
    "id_unidade" bigint,
    "nome_unidade" "text",
    "dia_semana" "text",
    "data" "date" NOT NULL,
    "hora_inicial" time without time zone NOT NULL,
    "hora_final" time without time zone NOT NULL,
    "status_agendamento" "text",
    "terapia_id" bigint,
    "nome_terapia" "text",
    "terapia_exibicao_id" bigint,
    "terapia_exibicao" "text",
    "id_sala" bigint,
    "sala" "text",
    "observacoes_sala" "text",
    "raw_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grade_profissionais_tita" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guia_terapias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guia_numero" "text" NOT NULL,
    "terapeuta_id" "uuid",
    "terapia_nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guia_terapias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guias_processadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guia_numero" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "page_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guias_processadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "autorizacao_id" "uuid",
    "mensagem" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "nivel" "text" DEFAULT 'info'::"text",
    "origem" "text" DEFAULT 'worker'::"text",
    "fila_id" "uuid",
    CONSTRAINT "logs_nivel_check" CHECK (("nivel" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs_execucao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "machine_id" "text",
    "tipo_acao" "text",
    "status" "text",
    "mensagem" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."logs_execucao" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."occurrences" AS
 SELECT "id",
    "session_key",
    "tipo",
    "severity",
    "titulo",
    "descricao",
    "impacto_financeiro",
    "responsavel_acao",
    "acao_recomendada",
    "fingerprint",
    "resolved_at",
    "resolved_by",
    "resolution_note",
    "created_at",
    "updated_at"
   FROM "cco"."occurrences"
  ORDER BY "created_at" DESC;


ALTER VIEW "public"."occurrences" OWNER TO "postgres";


COMMENT ON VIEW "public"."occurrences" IS 'Public proxy view for cco.occurrences. Enables REST API access for dashboards and test validation scripts.';



CREATE TABLE IF NOT EXISTS "public"."paciente_classificacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_id" "text",
    "paciente_nome" "text",
    "convenio_tipo" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."paciente_classificacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "nome" "text",
    "role" "text" DEFAULT 'atendente'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "rota" "text",
    "grupo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "descricao" "text"
);


ALTER TABLE "public"."permissoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pre_auditoria_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data_ref" "date",
    "total" integer,
    "liberados" integer,
    "erros" integer,
    "pendentes" integer,
    "faltas" integer,
    "tokens" integer,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."pre_auditoria_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid",
    "machine_id" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_seen" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."substituicoes_historico" (
    "id" bigint NOT NULL,
    "data_criacao" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usuario_responsavel" "text",
    "sessao_id" bigint,
    "paciente_id" bigint,
    "paciente_nome" "text",
    "unidade_nome" "text",
    "terapia_real" "text" NOT NULL,
    "data_sessao" "date" NOT NULL,
    "horario_inicio" time without time zone,
    "horario_fim" time without time zone,
    "profissional_original_id" bigint,
    "profissional_original_nome" "text",
    "profissional_substituto_id" bigint NOT NULL,
    "profissional_substituto_nome" "text" NOT NULL,
    "competencia" "text" NOT NULL,
    "motivo" "text",
    "cancelada" boolean DEFAULT false NOT NULL,
    "cancelada_por" "text",
    "cancelada_em" timestamp with time zone,
    "motivo_cancelamento" "text"
);


ALTER TABLE "public"."substituicoes_historico" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."substituicoes_historico_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."substituicoes_historico_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."substituicoes_historico_id_seq" OWNED BY "public"."substituicoes_historico"."id";



CREATE TABLE IF NOT EXISTS "public"."sync_controle" (
    "id" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'idle'::"text",
    "force" boolean DEFAULT false,
    "last_run" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "machine_id" "text"
);


ALTER TABLE "public"."sync_controle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_status" (
    "id" integer NOT NULL,
    "status" "text",
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."sync_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terapeuta_eventos" (
    "id" bigint NOT NULL,
    "data_evento" "date" NOT NULL,
    "terapeuta" "text" NOT NULL,
    "terapia" "text",
    "unidade" "text",
    "sala" "text",
    "horario_referencia" time without time zone,
    "evento" "text" NOT NULL,
    "substituto" "text",
    "observacao" "text",
    "usuario" "text",
    "created_at" timestamp without time zone DEFAULT "timezone"('America/Sao_Paulo'::"text", "now"())
);


ALTER TABLE "public"."terapeuta_eventos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."terapeuta_eventos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."terapeuta_eventos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."terapeuta_eventos_id_seq" OWNED BY "public"."terapeuta_eventos"."id";



CREATE TABLE IF NOT EXISTS "public"."terapeutas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "carimbo_digital" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."terapeutas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terapias_controle" (
    "terapia_id" bigint NOT NULL,
    "terapia_nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."terapias_controle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tita_grade_profissionais" (
    "id" bigint NOT NULL,
    "data_atendimento" "date" NOT NULL,
    "terapeuta_id" bigint,
    "terapeuta_nome" "text" NOT NULL,
    "cpf_profissional" "text",
    "terapia" "text",
    "unidade" "text",
    "sala" "text",
    "status_agendamento" "text",
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "grade_terapeuta_id" bigint,
    "grade_clinica_id" bigint,
    "raw_json" "jsonb",
    "created_at" timestamp without time zone DEFAULT "timezone"('America/Sao_Paulo'::"text", "now"())
);


ALTER TABLE "public"."tita_grade_profissionais" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tita_grade_profissionais_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tita_grade_profissionais_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tita_grade_profissionais_id_seq" OWNED BY "public"."tita_grade_profissionais"."id";



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'recepcao'::"text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ultimo_acesso" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "username" "text",
    "primeiro_acesso" boolean DEFAULT true,
    CONSTRAINT "usuarios_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'diretoria'::"text", 'recepcao'::"text", 'autorizacao'::"text", 'terapeutico'::"text", 'faturamento'::"text", 'rp'::"text", 'disponibilidade_terapeuta'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios_permissoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "permissao_codigo" "text" NOT NULL,
    "permitido" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usuarios_permissoes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_auditoria_autorizacoes_assim" AS
 WITH "blocos_auditoria" AS (
         WITH "agenda_tita_tuss" AS (
                 SELECT "at"."paciente_id",
                    "at"."paciente_nome",
                    "at"."data_atendimento",
                    "at"."hora_inicial",
                    "at"."terapia_nome",
                    "at"."terapia_exibicao_nome",
                    "at"."profissional_nome",
                    "at"."convenio_nome",
                    "at"."numero_carteirinha",
                    "substring"("at"."numero_carteirinha", 1, 6) AS "empresa",
                    "substring"("at"."numero_carteirinha", 7, 7) AS "matricula",
                    "right"("regexp_replace"("at"."numero_carteirinha", '\D'::"text", ''::"text", 'g'::"text"), 2) AS "dep",
                        CASE
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Psicologia'::"text", 'Psicologia ABA'::"text", 'Arteterapia'::"text", 'Arteterapia (Psicologia ABA)'::"text", 'Avaliação Neuropsicológica'::"text", 'Habilidades Sociais (Psicologia ABA)'::"text"])) THEN '22070384'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Fonoaudiologia'::"text") THEN '22070397'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Psicomotricidade'::"text") THEN '22070400'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Fisioterapia'::"text") THEN '22070419'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Terapia Ocupacional'::"text") THEN '22070427'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Psicopedagogia'::"text") THEN '22070435'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Musicoterapia'::"text") THEN '22070451'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Nutrição'::"text", 'Terapia Alimentar'::"text"])) THEN '22070460'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = ANY (ARRAY['Hidroterapia'::"text", 'Fisioterapia Aquática'::"text"])) THEN '22070265'::"text"
                            WHEN ("at"."terapia_exibicao_nome" = 'Equoterapia'::"text") THEN '22070257'::"text"
                            ELSE NULL::"text"
                        END AS "codigo_tuss"
                   FROM "public"."agenda_tita" "at"
                  WHERE (("at"."convenio_nome" ~~* '%assim%'::"text") AND ("at"."paciente_nome" <> ALL (ARRAY['Horário Administrativo'::"text", 'Notificação Prévia'::"text"])))
                ), "agenda_filtrada" AS (
                 SELECT "a"."paciente_id",
                    "a"."paciente_nome",
                    "a"."data_atendimento",
                    "a"."hora_inicial",
                    "a"."terapia_nome",
                    "a"."terapia_exibicao_nome",
                    "a"."profissional_nome",
                    "a"."convenio_nome",
                    "a"."numero_carteirinha",
                    "a"."empresa",
                    "a"."matricula",
                    "a"."dep",
                    "a"."codigo_tuss"
                   FROM "agenda_tita_tuss" "a"
                  WHERE (("a"."codigo_tuss" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM "public"."config_regras_terapias" "r"
                          WHERE (("r"."categoria" = 'BLACKLIST_AUTORIZACAO'::"text") AND ("r"."ativo" = true) AND ("a"."terapia_nome" ~~* (('%'::"text" || "r"."terapia_nome") || '%'::"text")))))))
                ), "agenda_sem_falta" AS (
                 SELECT "a"."paciente_id",
                    "a"."paciente_nome",
                    "a"."data_atendimento",
                    "a"."hora_inicial",
                    "a"."terapia_nome",
                    "a"."terapia_exibicao_nome",
                    "a"."profissional_nome",
                    "a"."convenio_nome",
                    "a"."numero_carteirinha",
                    "a"."empresa",
                    "a"."matricula",
                    "a"."dep",
                    "a"."codigo_tuss"
                   FROM "agenda_filtrada" "a"
                  WHERE (NOT (EXISTS ( SELECT 1
                           FROM "public"."fila_autorizacoes" "f"
                          WHERE ((("f"."paciente_id")::bigint = "a"."paciente_id") AND ("f"."data_atendimento" = "a"."data_atendimento") AND ("f"."horario" = "a"."hora_inicial") AND (("upper"(COALESCE("f"."status_assim", ''::"text")) ~~ '%FALTA%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%PACIENTE%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%TERAPEUTA%'::"text"))))))
                )
         SELECT "concat_ws"('_'::"text", "agenda_sem_falta"."paciente_id", "agenda_sem_falta"."data_atendimento", "agenda_sem_falta"."codigo_tuss", "agenda_sem_falta"."hora_inicial") AS "bloco_id",
            "agenda_sem_falta"."paciente_id",
            "agenda_sem_falta"."paciente_nome",
            "agenda_sem_falta"."empresa",
            "agenda_sem_falta"."matricula",
            "agenda_sem_falta"."dep",
            "concat_ws"('.'::"text", "agenda_sem_falta"."empresa", "agenda_sem_falta"."matricula", "agenda_sem_falta"."dep") AS "carteirinha",
            "agenda_sem_falta"."data_atendimento",
            "agenda_sem_falta"."hora_inicial",
            "agenda_sem_falta"."codigo_tuss",
            "agenda_sem_falta"."convenio_nome",
            "string_agg"(DISTINCT "agenda_sem_falta"."terapia_exibicao_nome", ' | '::"text" ORDER BY "agenda_sem_falta"."terapia_exibicao_nome") AS "terapias",
            "string_agg"(DISTINCT "agenda_sem_falta"."profissional_nome", ' | '::"text" ORDER BY "agenda_sem_falta"."profissional_nome") AS "profissionais",
            "count"(*) AS "quantidade_sessoes"
           FROM "agenda_sem_falta"
          GROUP BY "agenda_sem_falta"."paciente_id", "agenda_sem_falta"."paciente_nome", "agenda_sem_falta"."empresa", "agenda_sem_falta"."matricula", "agenda_sem_falta"."dep", "agenda_sem_falta"."data_atendimento", "agenda_sem_falta"."hora_inicial", "agenda_sem_falta"."codigo_tuss", "agenda_sem_falta"."convenio_nome"
        ), "fila_operacional" AS (
         SELECT "f"."empresa",
            "f"."matricula",
            "f"."dep",
            "f"."data_atendimento",
            "f"."horario",
            "f"."tuss" AS "codigo_tuss",
            "max"(COALESCE("f"."updated_at", "f"."created_at")) AS "ultimo_updated_at"
           FROM "public"."fila_autorizacoes" "f"
          WHERE (NOT (("upper"(COALESCE("f"."status_assim", ''::"text")) ~~ '%FALTA%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%PACIENTE%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%TERAPEUTA%'::"text")))
          GROUP BY "f"."empresa", "f"."matricula", "f"."dep", "f"."data_atendimento", "f"."horario", "f"."tuss"
        ), "match_temporal" AS (
         WITH "sessoes" AS (
                 SELECT "b_1"."bloco_id",
                    "b_1"."paciente_id",
                    "b_1"."paciente_nome",
                    "b_1"."empresa",
                    "b_1"."matricula",
                    "b_1"."dep",
                    "b_1"."carteirinha",
                    "b_1"."data_atendimento",
                    "b_1"."hora_inicial",
                    "b_1"."codigo_tuss",
                    "b_1"."convenio_nome",
                    "b_1"."terapias",
                    "b_1"."profissionais",
                    "b_1"."quantidade_sessoes",
                    "row_number"() OVER (PARTITION BY "b_1"."empresa", "b_1"."matricula", "b_1"."dep", "b_1"."data_atendimento", "b_1"."codigo_tuss" ORDER BY "b_1"."hora_inicial") AS "ordem_sessao"
                   FROM "blocos_auditoria" "b_1"
                ), "autorizacoes" AS (
                 SELECT "aa"."guia",
                    "aa"."matricula",
                    "aa"."paciente_nome",
                    "aa"."data_execucao",
                    "aa"."data_autorizacao",
                    "aa"."status",
                    "aa"."codigo_tuss",
                    "aa"."codigo_erro",
                    "aa"."descricao_erro",
                    "aa"."teve_token",
                    "aa"."updated_at",
                    "aa"."token",
                    "aa"."status_tratado",
                    "aa"."matricula_limpa",
                    "aa"."paciente_id",
                    "split_part"("aa"."matricula", '.'::"text", 1) AS "empresa",
                    "split_part"("aa"."matricula", '.'::"text", 2) AS "matricula_base",
                    "split_part"("aa"."matricula", '.'::"text", 3) AS "dep",
                    "row_number"() OVER (PARTITION BY ("split_part"("aa"."matricula", '.'::"text", 1)), ("split_part"("aa"."matricula", '.'::"text", 2)), ("split_part"("aa"."matricula", '.'::"text", 3)), ("date"("aa"."data_execucao")), "aa"."codigo_tuss" ORDER BY "aa"."data_execucao") AS "ordem_autorizacao"
                   FROM "public"."autorizacoes_assim" "aa"
                )
         SELECT DISTINCT ON ("s"."bloco_id") "s"."bloco_id",
            "a"."guia",
            "a"."status",
            "a"."codigo_erro",
            "a"."descricao_erro",
            "a"."data_execucao",
            "a"."updated_at",
            (EXTRACT(epoch FROM (("a"."data_execucao")::time without time zone - "s"."hora_inicial")) / (60)::numeric) AS "diferenca_minutos"
           FROM ("sessoes" "s"
             LEFT JOIN "autorizacoes" "a" ON ((("a"."empresa" = "s"."empresa") AND ("a"."matricula_base" = "s"."matricula") AND ("a"."dep" = "s"."dep") AND ("date"("a"."data_execucao") = "s"."data_atendimento") AND ("a"."codigo_tuss" = "s"."codigo_tuss") AND ("a"."ordem_autorizacao" = "s"."ordem_sessao"))))
          ORDER BY "s"."bloco_id", "a"."updated_at" DESC
        )
 SELECT "b"."bloco_id",
    "b"."paciente_id",
    "b"."paciente_nome",
    "b"."empresa",
    "b"."matricula",
    "b"."dep",
    "b"."carteirinha",
    "b"."data_atendimento",
    "b"."hora_inicial",
    "b"."codigo_tuss",
    "b"."convenio_nome",
    "b"."terapias",
    "b"."profissionais",
    "b"."quantidade_sessoes",
    "mt"."guia",
    "mt"."status" AS "status_assim",
    "mt"."codigo_erro",
    "mt"."descricao_erro",
    "mt"."data_execucao",
    "mt"."updated_at" AS "autorizacao_updated_at",
    "mt"."diferenca_minutos",
        CASE
            WHEN (("mt"."codigo_erro" IS NOT NULL) OR (("mt"."status" IS NOT NULL) AND ("mt"."status" <> ALL (ARRAY['Liberado'::"text", 'Liberado *'::"text"])))) THEN 'GLOSA'::"text"
            WHEN ("mt"."status" = 'Liberado *'::"text") THEN 'CANCELADA'::"text"
            WHEN ("mt"."status" = 'Liberado'::"text") THEN 'LIBERADA'::"text"
            WHEN (("fo"."matricula" IS NOT NULL) AND ("fo"."ultimo_updated_at" IS NOT NULL) AND (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) <= '00:10:00'::interval)) THEN 'SINCRONIZANDO'::"text"
            WHEN (("fo"."matricula" IS NOT NULL) AND (("fo"."ultimo_updated_at" IS NULL) OR (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) > '00:10:00'::interval))) THEN 'RETORNO_NAO_CONFIRMADO'::"text"
            ELSE 'NAO_SOLICITADA'::"text"
        END AS "situacao",
        CASE
            WHEN (("mt"."codigo_erro" IS NOT NULL) OR (("mt"."status" IS NOT NULL) AND ("mt"."status" <> ALL (ARRAY['Liberado'::"text", 'Liberado *'::"text"])))) THEN 2
            WHEN ("mt"."status" = 'Liberado *'::"text") THEN 5
            WHEN ("mt"."status" = 'Liberado'::"text") THEN 6
            WHEN (("fo"."matricula" IS NOT NULL) AND ("fo"."ultimo_updated_at" IS NOT NULL) AND (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) <= '00:10:00'::interval)) THEN 4
            WHEN (("fo"."matricula" IS NOT NULL) AND (("fo"."ultimo_updated_at" IS NULL) OR (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) > '00:10:00'::interval))) THEN 3
            ELSE 1
        END AS "prioridade",
    (CURRENT_DATE - "b"."data_atendimento") AS "dias_atraso",
        CASE
            WHEN ("mt"."status" = 'Liberado'::"text") THEN true
            ELSE false
        END AS "possui_autorizacao",
        CASE
            WHEN ("fo"."matricula" IS NOT NULL) THEN true
            ELSE false
        END AS "possui_solicitacao",
        CASE
            WHEN (("mt"."codigo_erro" IS NOT NULL) OR (("mt"."status" IS NOT NULL) AND ("mt"."status" <> ALL (ARRAY['Liberado'::"text", 'Liberado *'::"text"])))) THEN "concat"('Glosa: ', COALESCE("mt"."codigo_erro", "mt"."status", 'Erro não identificado'::"text"),
            CASE
                WHEN ("mt"."descricao_erro" IS NOT NULL) THEN "concat"(' - ', "mt"."descricao_erro")
                ELSE ''::"text"
            END)
            WHEN ("mt"."status" = 'Liberado'::"text") THEN 'Autorização confirmada pela ASSIM'::"text"
            WHEN ("mt"."status" = 'Liberado *'::"text") THEN 'Autorização cancelada'::"text"
            WHEN (("fo"."matricula" IS NOT NULL) AND ("fo"."ultimo_updated_at" IS NOT NULL) AND (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) <= '00:10:00'::interval)) THEN 'Solicitação enviada. Aguardando sincronização com a ASSIM.'::"text"
            WHEN (("fo"."matricula" IS NOT NULL) AND (("fo"."ultimo_updated_at" IS NULL) OR (("now"() - ("fo"."ultimo_updated_at" AT TIME ZONE 'UTC'::"text")) > '00:10:00'::interval))) THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'::"text"
            ELSE 'Nenhuma solicitação encontrada'::"text"
        END AS "observacao",
    "agm"."motivo_glosa"
   FROM ((("blocos_auditoria" "b"
     LEFT JOIN "match_temporal" "mt" ON (("mt"."bloco_id" = "b"."bloco_id")))
     LEFT JOIN "fila_operacional" "fo" ON ((("fo"."empresa" = "b"."empresa") AND ("fo"."matricula" = "b"."matricula") AND ("fo"."dep" = "b"."dep") AND ("fo"."data_atendimento" = "b"."data_atendimento") AND ("fo"."codigo_tuss" = "b"."codigo_tuss") AND ("fo"."horario" = "b"."hora_inicial"))))
     LEFT JOIN "public"."auditoria_glosa_motivos" "agm" ON (("agm"."bloco_id" = "b"."bloco_id")));


ALTER VIEW "public"."vw_auditoria_autorizacoes_assim" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_blocos_autorizaveis_assim" AS
 WITH "agenda_filtrada" AS (
         SELECT "a"."id",
            "a"."tita_agendamento_id",
            "a"."origem",
            "a"."data_atendimento",
            "a"."hora_inicial",
            "a"."hora_final",
            "a"."paciente_id",
            "a"."paciente_nome",
            "a"."cpf",
            "a"."data_nascimento",
            "a"."profissional_id",
            "a"."profissional_nome",
            "a"."profissional_cpf",
            "a"."terapia_id",
            "a"."terapia_nome",
            "a"."terapia_exibicao_id",
            "a"."terapia_exibicao_nome",
            "a"."sala_id",
            "a"."sala_nome",
            "a"."sala_observacoes",
            "a"."clinica_id",
            "a"."clinica_nome",
            "a"."convenio_id",
            "a"."convenio_nome",
            "a"."numero_carteirinha",
            "a"."responsavel_nome",
            "a"."responsavel_telefone",
            "a"."responsavel_email",
            "a"."atividade",
            "a"."ativo",
            "a"."raw_json",
            "a"."created_at",
            "a"."updated_at",
            "a"."empresa",
            "a"."matricula",
            "a"."dep",
            "a"."crm",
            "a"."nome_medico",
            "a"."codigo_tuss"
           FROM "public"."agenda_tita_autorizacao" "a"
          WHERE (("a"."convenio_nome" ~~* '%assim%'::"text") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."config_regras_terapias" "r"
                  WHERE (("r"."categoria" = 'BLACKLIST_AUTORIZACAO'::"text") AND ("r"."ativo" = true) AND ("a"."terapia_nome" ~~* (('%'::"text" || "r"."terapia_nome") || '%'::"text")))))))
        ), "agenda_sem_falta" AS (
         SELECT "a"."id",
            "a"."tita_agendamento_id",
            "a"."origem",
            "a"."data_atendimento",
            "a"."hora_inicial",
            "a"."hora_final",
            "a"."paciente_id",
            "a"."paciente_nome",
            "a"."cpf",
            "a"."data_nascimento",
            "a"."profissional_id",
            "a"."profissional_nome",
            "a"."profissional_cpf",
            "a"."terapia_id",
            "a"."terapia_nome",
            "a"."terapia_exibicao_id",
            "a"."terapia_exibicao_nome",
            "a"."sala_id",
            "a"."sala_nome",
            "a"."sala_observacoes",
            "a"."clinica_id",
            "a"."clinica_nome",
            "a"."convenio_id",
            "a"."convenio_nome",
            "a"."numero_carteirinha",
            "a"."responsavel_nome",
            "a"."responsavel_telefone",
            "a"."responsavel_email",
            "a"."atividade",
            "a"."ativo",
            "a"."raw_json",
            "a"."created_at",
            "a"."updated_at",
            "a"."empresa",
            "a"."matricula",
            "a"."dep",
            "a"."crm",
            "a"."nome_medico",
            "a"."codigo_tuss"
           FROM "agenda_filtrada" "a"
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM "public"."fila_autorizacoes" "f"
                  WHERE ((("f"."paciente_id")::bigint = "a"."paciente_id") AND ("f"."data_atendimento" = "a"."data_atendimento") AND ("f"."horario" = "a"."hora_inicial") AND (("upper"(COALESCE("f"."status_assim", ''::"text")) ~~ '%FALTA%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%PACIENTE%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%TERAPEUTA%'::"text"))))))
        )
 SELECT "concat_ws"('_'::"text", "paciente_id", "data_atendimento", "codigo_tuss", "hora_inicial") AS "bloco_id",
    "paciente_id",
    "paciente_nome",
    "empresa",
    "matricula",
    "dep",
    "concat_ws"('.'::"text", "empresa", "matricula", "dep") AS "carteirinha",
    "data_atendimento",
    "hora_inicial",
    "codigo_tuss",
    "convenio_nome",
    "string_agg"(DISTINCT "terapia_exibicao_nome", ' | '::"text" ORDER BY "terapia_exibicao_nome") AS "terapias",
    "string_agg"(DISTINCT "profissional_nome", ' | '::"text" ORDER BY "profissional_nome") AS "profissionais",
    "count"(*) AS "quantidade_sessoes"
   FROM "agenda_sem_falta"
  GROUP BY "paciente_id", "paciente_nome", "empresa", "matricula", "dep", "data_atendimento", "hora_inicial", "codigo_tuss", "convenio_nome";


ALTER VIEW "public"."vw_blocos_autorizaveis_assim" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_match_autorizacoes_assim" AS
 WITH "blocos_operacionais" AS (
         SELECT "ag"."paciente_id",
            "ag"."paciente_nome",
            "ag"."cpf",
            "ag"."data_nascimento",
            "ag"."data_atendimento",
            "ag"."hora_inicial",
            "ag"."codigo_tuss",
            "ag"."matricula",
            "ag"."dep",
            "min"("ag"."tita_agendamento_id") AS "tita_agendamento_id",
            "array_agg"(DISTINCT "ag"."terapia_nome") AS "terapias",
            "row_number"() OVER (PARTITION BY "ag"."matricula", "ag"."dep", "ag"."data_atendimento", "ag"."codigo_tuss" ORDER BY "ag"."hora_inicial") AS "ordem_consumo"
           FROM "public"."agenda_tita_autorizacao" "ag"
          WHERE (("ag"."data_atendimento" = ("timezone"('America/Sao_Paulo'::"text", "now"()))::"date") AND ("lower"(COALESCE("ag"."terapia_nome", ''::"text")) <> ALL (ARRAY['aplicador aba escola'::"text", 'aplicador aba casa'::"text", 'aplicador suporte'::"text", 'apoio operacional'::"text", 'especialista técnico de área'::"text", 'estágio'::"text", 'facilitador técnico'::"text", 'operações clínicas'::"text", 'supervisão aba'::"text", 'técnico terapêutico particular'::"text", 'triagem'::"text"])) AND ("lower"(COALESCE("ag"."paciente_nome", ''::"text")) <> 'horário bloqueado'::"text") AND ("lower"(COALESCE("ag"."sala_nome", ''::"text")) !~~ '%sala teste%'::"text"))
          GROUP BY "ag"."paciente_id", "ag"."paciente_nome", "ag"."cpf", "ag"."data_nascimento", "ag"."data_atendimento", "ag"."hora_inicial", "ag"."codigo_tuss", "ag"."matricula", "ag"."dep"
        ), "consumos_falta" AS (
         SELECT DISTINCT "bo"."matricula",
            "bo"."dep",
            "bo"."data_atendimento",
            "bo"."codigo_tuss",
            "bo"."ordem_consumo"
           FROM ("blocos_operacionais" "bo"
             JOIN "public"."fila_autorizacoes" "fa" ON ((("fa"."matricula" = "bo"."matricula") AND (COALESCE("fa"."dep", ''::"text") = COALESCE("bo"."dep", ''::"text")) AND ("fa"."data_atendimento" = "bo"."data_atendimento") AND ("fa"."horario" = "bo"."hora_inicial") AND ("fa"."status" = 'falta'::"text"))))
        ), "autorizacoes_numeradas" AS (
         SELECT "aa"."guia",
            "aa"."paciente_id",
            "aa"."paciente_nome",
            "aa"."matricula_limpa" AS "matricula",
            "right"("aa"."matricula", 2) AS "dep",
            "aa"."codigo_tuss",
            "aa"."status" AS "status_assim",
            "aa"."data_execucao",
            "date"("aa"."data_execucao") AS "data_atendimento",
            "row_number"() OVER (PARTITION BY "aa"."matricula_limpa", ("right"("aa"."matricula", 2)), ("date"("aa"."data_execucao")), "aa"."codigo_tuss" ORDER BY "aa"."data_execucao") AS "ordem_autorizacao"
           FROM "public"."autorizacoes_assim" "aa"
          WHERE ("date"("aa"."data_execucao") = ("timezone"('America/Sao_Paulo'::"text", "now"()))::"date")
        ), "matches_externos" AS (
         SELECT "bo"."tita_agendamento_id",
            "bo"."paciente_id",
            "bo"."paciente_nome",
            "bo"."cpf",
            "bo"."data_nascimento",
            "bo"."data_atendimento",
            "bo"."hora_inicial",
            "bo"."codigo_tuss",
            "an"."guia",
            "an"."data_execucao",
            "an"."status_assim",
            true AS "consome_autorizacao",
            "bo"."ordem_consumo",
            "an"."ordem_autorizacao"
           FROM ("blocos_operacionais" "bo"
             JOIN "autorizacoes_numeradas" "an" ON ((("an"."matricula" = "bo"."matricula") AND (COALESCE("an"."dep", ''::"text") = COALESCE("bo"."dep", ''::"text")) AND ("an"."data_atendimento" = "bo"."data_atendimento") AND ("an"."codigo_tuss" = "bo"."codigo_tuss") AND ("an"."ordem_autorizacao" = "bo"."ordem_consumo"))))
        ), "matches_falta" AS (
         SELECT "bo"."tita_agendamento_id",
            "bo"."paciente_id",
            "bo"."paciente_nome",
            "bo"."cpf",
            "bo"."data_nascimento",
            "bo"."data_atendimento",
            "bo"."hora_inicial",
            "bo"."codigo_tuss",
            NULL::"text" AS "guia",
            NULL::timestamp without time zone AS "data_execucao",
            'falta'::"text" AS "status_assim",
            true AS "consome_autorizacao",
            "bo"."ordem_consumo",
            NULL::bigint AS "ordem_autorizacao"
           FROM ("blocos_operacionais" "bo"
             JOIN "consumos_falta" "cf" ON ((("cf"."matricula" = "bo"."matricula") AND (COALESCE("cf"."dep", ''::"text") = COALESCE("bo"."dep", ''::"text")) AND ("cf"."data_atendimento" = "bo"."data_atendimento") AND ("cf"."codigo_tuss" = "bo"."codigo_tuss") AND ("cf"."ordem_consumo" = "bo"."ordem_consumo"))))
        )
 SELECT "matches_externos"."tita_agendamento_id",
    "matches_externos"."paciente_id",
    "matches_externos"."paciente_nome",
    "matches_externos"."cpf",
    "matches_externos"."data_nascimento",
    "matches_externos"."data_atendimento",
    "matches_externos"."hora_inicial",
    "matches_externos"."codigo_tuss",
    "matches_externos"."guia",
    "matches_externos"."data_execucao",
    "matches_externos"."status_assim",
    "matches_externos"."consome_autorizacao",
    "matches_externos"."ordem_consumo",
    "matches_externos"."ordem_autorizacao"
   FROM "matches_externos"
UNION ALL
 SELECT "matches_falta"."tita_agendamento_id",
    "matches_falta"."paciente_id",
    "matches_falta"."paciente_nome",
    "matches_falta"."cpf",
    "matches_falta"."data_nascimento",
    "matches_falta"."data_atendimento",
    "matches_falta"."hora_inicial",
    "matches_falta"."codigo_tuss",
    "matches_falta"."guia",
    "matches_falta"."data_execucao",
    "matches_falta"."status_assim",
    "matches_falta"."consome_autorizacao",
    "matches_falta"."ordem_consumo",
    "matches_falta"."ordem_autorizacao"
   FROM "matches_falta";


ALTER VIEW "public"."vw_match_autorizacoes_assim" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_central_autorizacoes" AS
 WITH "base" AS (
         SELECT "ag"."paciente_id",
            "ag"."paciente_nome",
            "ag"."cpf",
            "ag"."data_nascimento",
            "ag"."data_atendimento",
            "ag"."hora_inicial" AS "horario",
            "array_agg"(DISTINCT "ag"."terapia_nome") AS "terapias",
            "array_agg"(DISTINCT "ag"."sala_nome") AS "sala_nome",
            "array_agg"(DISTINCT "ag"."profissional_nome") AS "profissionais",
            "array_agg"(DISTINCT "ag"."codigo_tuss") AS "codigos_tuss",
            "array_agg"(DISTINCT ("ag"."tita_agendamento_id")::"text") AS "agendamentos",
            "ag"."convenio_nome",
            "ag"."convenio_id",
            "ag"."empresa",
            "ag"."matricula",
            "ag"."dep",
            "ag"."crm",
            "ag"."nome_medico"
           FROM "public"."agenda_tita_autorizacao" "ag"
          WHERE (("lower"(COALESCE("ag"."terapia_nome", ''::"text")) <> ALL (ARRAY['aplicador aba escola'::"text", 'aplicador aba casa'::"text", 'aplicador suporte'::"text", 'apoio operacional'::"text", 'especialista técnico de área'::"text", 'estágio'::"text", 'facilitador técnico'::"text", 'operações clínicas'::"text", 'supervisão aba'::"text", 'técnico terapêutico particular'::"text", 'triagem'::"text"])) AND ("lower"(COALESCE("ag"."paciente_nome", ''::"text")) <> 'horário bloqueado'::"text") AND ("lower"(COALESCE("ag"."sala_nome", ''::"text")) !~~ '%sala teste%'::"text"))
          GROUP BY "ag"."paciente_id", "ag"."paciente_nome", "ag"."cpf", "ag"."data_nascimento", "ag"."data_atendimento", "ag"."hora_inicial", "ag"."convenio_nome", "ag"."convenio_id", "ag"."empresa", "ag"."matricula", "ag"."dep", "ag"."crm", "ag"."nome_medico"
        ), "match_assim" AS (
         SELECT DISTINCT "vw_match_autorizacoes_assim"."paciente_id",
            "vw_match_autorizacoes_assim"."data_atendimento",
            "vw_match_autorizacoes_assim"."hora_inicial" AS "horario",
            "vw_match_autorizacoes_assim"."status_assim",
            "vw_match_autorizacoes_assim"."data_execucao"
           FROM "public"."vw_match_autorizacoes_assim"
        ), "ultima_fila" AS (
         SELECT DISTINCT ON ("fila_autorizacoes"."paciente_id", "fila_autorizacoes"."data_atendimento", "fila_autorizacoes"."horario") "fila_autorizacoes"."paciente_id",
            "fila_autorizacoes"."data_atendimento",
            "fila_autorizacoes"."horario",
            "fila_autorizacoes"."status",
            "fila_autorizacoes"."horario_autorizacao",
            "fila_autorizacoes"."created_at"
           FROM "public"."fila_autorizacoes"
          ORDER BY "fila_autorizacoes"."paciente_id", "fila_autorizacoes"."data_atendimento", "fila_autorizacoes"."horario", "fila_autorizacoes"."created_at" DESC
        )
 SELECT "b"."paciente_id",
    "b"."paciente_nome",
    "b"."cpf",
    "b"."data_nascimento",
    "b"."data_atendimento",
    "b"."horario",
    "b"."terapias",
    "b"."sala_nome",
    "b"."profissionais",
    "b"."codigos_tuss",
    "b"."agendamentos",
    "b"."convenio_nome",
    "b"."convenio_id",
    "b"."empresa",
    "b"."matricula",
    "b"."dep",
    "b"."crm",
    "b"."nome_medico",
    "uf"."horario_autorizacao",
    ( SELECT "max"("ma2"."data_execucao") AS "max"
           FROM "match_assim" "ma2"
          WHERE (("ma2"."paciente_id" = "b"."paciente_id") AND ("ma2"."data_atendimento" = "b"."data_atendimento") AND ("ma2"."horario" < "b"."horario"))) AS "ultima_autorizacao_anterior",
        CASE
            WHEN ("ma"."paciente_id" IS NOT NULL) THEN 'autorizado_externo'::"text"
            WHEN ("uf"."status" = 'concluido'::"text") THEN 'concluido'::"text"
            WHEN ("uf"."status" = 'concluido_sem_guia'::"text") THEN 'concluido_sem_guia'::"text"
            WHEN ("uf"."status" = 'falta'::"text") THEN 'falta'::"text"
            WHEN ("uf"."status" = 'processando'::"text") THEN 'processando'::"text"
            WHEN ("uf"."status" = 'pendente'::"text") THEN 'pendente'::"text"
            WHEN ("uf"."status" = 'erro'::"text") THEN 'erro'::"text"
            ELSE 'sem_acao'::"text"
        END AS "status_final",
        CASE
            WHEN ("ma"."paciente_id" IS NOT NULL) THEN false
            WHEN ("uf"."status" = ANY (ARRAY['concluido'::"text", 'falta'::"text", 'concluido_sem_guia'::"text"])) THEN false
            ELSE true
        END AS "mostrar_na_tela",
        CASE
            WHEN ("lower"(COALESCE("b"."convenio_nome", ''::"text")) ~~ '%assim%'::"text") THEN 'autorizacao'::"text"
            ELSE 'presenca'::"text"
        END AS "tipo_fluxo"
   FROM (("base" "b"
     LEFT JOIN "match_assim" "ma" ON ((("ma"."paciente_id" = "b"."paciente_id") AND ("ma"."data_atendimento" = "b"."data_atendimento") AND ("ma"."horario" = "b"."horario"))))
     LEFT JOIN "ultima_fila" "uf" ON (((("uf"."paciente_id")::bigint = "b"."paciente_id") AND ("uf"."data_atendimento" = "b"."data_atendimento") AND ("uf"."horario" = "b"."horario"))));


ALTER VIEW "public"."vw_central_autorizacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vw_central_pacientes_backup_20260508" (
    "id" "uuid",
    "agenda_id" "uuid",
    "paciente_id" "text",
    "paciente_nome" "text",
    "data_atendimento" "date",
    "horario" time without time zone,
    "data_horario" timestamp without time zone,
    "status" "text",
    "status_assim" "text",
    "tipo_falta" "text",
    "completion_type" "text",
    "numero_autorizacao" "text",
    "machine_id" "text",
    "error_message" "text",
    "execution_time_ms" integer,
    "created_at" timestamp without time zone,
    "updated_at" timestamp without time zone,
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "terapia_exibicao_id" bigint,
    "classificacao_terapia" "text",
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "profissional_nome" "text",
    "profissional_id" bigint,
    "terapia_nome" "text",
    "terapia_exibicao_nome" "text",
    "sala_nome" "text",
    "clinica_nome" "text",
    "convenio_nome" "text",
    "responsavel_nome" "text",
    "responsavel_telefone" "text",
    "numero_carteirinha" "text",
    "unidade" "text",
    "convenio" "text",
    "status_operacional" "text",
    "usuario_nome" "text"
);


ALTER TABLE "public"."vw_central_pacientes_backup_20260508" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_central_terapeutica" AS
 SELECT "a"."tita_agendamento_id",
    COALESCE("ct"."data_atendimento", "a"."data_atendimento") AS "data_atendimento",
    COALESCE("ct"."hora_inicial", "a"."hora_inicial") AS "hora_inicial",
    COALESCE("ct"."hora_final", "a"."hora_final") AS "hora_final",
    "a"."paciente_id",
    "a"."paciente_nome",
    COALESCE("ct"."profissional_id", "a"."profissional_id") AS "profissional_id",
    COALESCE("ct"."profissional_nome", "a"."profissional_nome") AS "profissional_nome",
    COALESCE("ct"."terapia_id", "a"."terapia_id") AS "terapia_id",
    COALESCE("ct"."terapia_nome", "a"."terapia_nome") AS "terapia_nome",
    "a"."sala_id",
    "a"."sala_nome",
        CASE
            WHEN ("a"."sala_nome" ~~* '%Realengo%'::"text") THEN 'Realengo'::"text"
            WHEN ("a"."sala_nome" ~~* '%Fazendinha%'::"text") THEN 'Fazendinha'::"text"
            WHEN ("a"."sala_nome" ~~* '%Padre Miguel%'::"text") THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END AS "unidade",
    "regexp_replace"("a"."sala_nome", '^Unid\.\s(Realengo|Fazendinha|Padre Miguel)\s-\s'::"text", ''::"text") AS "sala_operacional",
    "a"."clinica_id",
    "a"."clinica_nome",
    "a"."convenio_nome",
    COALESCE("ct"."status", 'pendente'::"text") AS "status",
    "ct"."profissional_substituto_id",
    COALESCE("ct"."profissional_substituto_nome", "sub"."profissional_nome") AS "profissional_substituto_nome",
    "ct"."observacao",
    "ct"."confirmado_por",
    "ct"."confirmado_em",
    "ct"."created_at" AS "controle_created_at",
    "ct"."updated_at" AS "controle_updated_at",
    "ct"."confirmado_por_nome"
   FROM ((("public"."agenda_tita" "a"
     JOIN "public"."terapias_controle" "tc" ON ((("tc"."terapia_id" = "a"."terapia_id") AND ("tc"."ativo" = true))))
     LEFT JOIN "public"."controle_terapeutico" "ct" ON (("ct"."tita_agendamento_id" = "a"."tita_agendamento_id")))
     LEFT JOIN ( SELECT DISTINCT ON ("agenda_tita"."profissional_id") "agenda_tita"."profissional_id",
            "agenda_tita"."profissional_nome"
           FROM "public"."agenda_tita"
          ORDER BY "agenda_tita"."profissional_id") "sub" ON (("sub"."profissional_id" = "ct"."profissional_substituto_id")))
  WHERE ("a"."ativo" = true);


ALTER VIEW "public"."vw_central_terapeutica" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_kpis_auditoria_assim" AS
 WITH "auditoria" AS (
         SELECT "vw_auditoria_autorizacoes_assim"."bloco_id",
            "vw_auditoria_autorizacoes_assim"."paciente_id",
            "vw_auditoria_autorizacoes_assim"."paciente_nome",
            "vw_auditoria_autorizacoes_assim"."empresa",
            "vw_auditoria_autorizacoes_assim"."matricula",
            "vw_auditoria_autorizacoes_assim"."dep",
            "vw_auditoria_autorizacoes_assim"."carteirinha",
            "vw_auditoria_autorizacoes_assim"."data_atendimento",
            "vw_auditoria_autorizacoes_assim"."hora_inicial",
            "vw_auditoria_autorizacoes_assim"."codigo_tuss",
            "vw_auditoria_autorizacoes_assim"."convenio_nome",
            "vw_auditoria_autorizacoes_assim"."terapias",
            "vw_auditoria_autorizacoes_assim"."profissionais",
            "vw_auditoria_autorizacoes_assim"."quantidade_sessoes",
            "vw_auditoria_autorizacoes_assim"."guia",
            "vw_auditoria_autorizacoes_assim"."status_assim",
            "vw_auditoria_autorizacoes_assim"."codigo_erro",
            "vw_auditoria_autorizacoes_assim"."descricao_erro",
            "vw_auditoria_autorizacoes_assim"."data_execucao",
            "vw_auditoria_autorizacoes_assim"."autorizacao_updated_at",
            "vw_auditoria_autorizacoes_assim"."diferenca_minutos",
            "vw_auditoria_autorizacoes_assim"."situacao",
            "vw_auditoria_autorizacoes_assim"."prioridade",
            "vw_auditoria_autorizacoes_assim"."dias_atraso",
            "vw_auditoria_autorizacoes_assim"."possui_autorizacao",
            "vw_auditoria_autorizacoes_assim"."possui_solicitacao",
            "vw_auditoria_autorizacoes_assim"."observacao"
           FROM "public"."vw_auditoria_autorizacoes_assim"
          WHERE ("vw_auditoria_autorizacoes_assim"."data_atendimento" = CURRENT_DATE)
        ), "liberadas_assim" AS (
         SELECT "count"(*) AS "total_liberadas"
           FROM "public"."autorizacoes_assim"
          WHERE (("date"("autorizacoes_assim"."data_execucao") = CURRENT_DATE) AND ("autorizacoes_assim"."status" = 'Liberado'::"text"))
        ), "faltas_dia" AS (
         SELECT "count"(*) AS "total_faltas"
           FROM ("public"."fila_autorizacoes" "f"
             JOIN "public"."agenda_tita_autorizacao" "a" ON ((("a"."paciente_id" = ("f"."paciente_id")::bigint) AND ("a"."data_atendimento" = "f"."data_atendimento") AND ("a"."hora_inicial" = "f"."horario"))))
          WHERE (("a"."convenio_nome" ~~* '%assim%'::"text") AND ("f"."data_atendimento" = CURRENT_DATE) AND (("upper"(COALESCE("f"."status_assim", ''::"text")) ~~ '%FALTA%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%PACIENTE%'::"text") OR ("upper"(COALESCE("f"."tipo_falta", ''::"text")) ~~ '%TERAPEUTA%'::"text")))
        )
 SELECT ( SELECT "count"(*) AS "count"
           FROM "auditoria" "auditoria_1") AS "total",
    ( SELECT "liberadas_assim"."total_liberadas"
           FROM "liberadas_assim") AS "liberadas",
    ( SELECT "faltas_dia"."total_faltas"
           FROM "faltas_dia") AS "faltas",
    "count"(*) FILTER (WHERE ("situacao" = 'NAO_SOLICITADA'::"text")) AS "nao_solicitadas",
    "count"(*) FILTER (WHERE ("situacao" = 'AGUARDANDO_RETORNO'::"text")) AS "aguardando_retorno",
    "count"(*) FILTER (WHERE ("situacao" = 'CANCELADA'::"text")) AS "canceladas",
    "count"(*) FILTER (WHERE ("situacao" = 'GLOSA'::"text")) AS "glosas"
   FROM "auditoria";


ALTER VIEW "public"."vw_kpis_auditoria_assim" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_modal_substituicao_terapeutas" AS
 SELECT "a"."profissional_id",
    "a"."profissional_nome",
    "a"."terapia_nome",
    "a"."terapia_exibicao_nome",
        CASE
            WHEN ("a"."sala_nome" ~~* '%Realengo%'::"text") THEN 'Realengo'::"text"
            WHEN ("a"."sala_nome" ~~* '%Fazendinha%'::"text") THEN 'Fazendinha'::"text"
            WHEN ("a"."sala_nome" ~~* '%Padre Miguel%'::"text") THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END AS "unidade",
    ("a"."hora_inicial")::"text" AS "hora",
    'ocupado'::"text" AS "status_slot",
    "a"."paciente_nome",
    "a"."sala_nome",
    "a"."data_atendimento" AS "data_grade"
   FROM "public"."agenda_tita" "a"
  WHERE (("a"."ativo" = true) AND ("a"."profissional_id" IS NOT NULL) AND ("a"."terapia_nome" IS NOT NULL) AND ("a"."clinica_id" = 280))
UNION ALL
 SELECT "gp"."profissional_id",
    "gp"."nome_profissional" AS "profissional_nome",
    "gp"."nome_terapia" AS "terapia_nome",
    COALESCE("th"."terapia_exibicao_nome", "gp"."terapia_exibicao") AS "terapia_exibicao_nome",
        CASE
            WHEN (("gp"."nome_unidade" ~~* '%Realengo%'::"text") OR ("gp"."sala" ~~* '%Realengo%'::"text")) THEN 'Realengo'::"text"
            WHEN (("gp"."nome_unidade" ~~* '%Fazendinha%'::"text") OR ("gp"."sala" ~~* '%Fazendinha%'::"text")) THEN 'Fazendinha'::"text"
            WHEN (("gp"."nome_unidade" ~~* '%Padre Miguel%'::"text") OR ("gp"."sala" ~~* '%Padre Miguel%'::"text")) THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END AS "unidade",
    ("gp"."hora_inicial")::"text" AS "hora",
    'livre'::"text" AS "status_slot",
    NULL::"text" AS "paciente_nome",
    "gp"."sala" AS "sala_nome",
    "gp"."data" AS "data_grade"
   FROM (("public"."grade_profissionais_tita" "gp"
     LEFT JOIN ( SELECT DISTINCT ON ("agenda_tita"."profissional_id", "agenda_tita"."data_atendimento") "agenda_tita"."profissional_id",
            "agenda_tita"."data_atendimento",
            "agenda_tita"."terapia_exibicao_nome"
           FROM "public"."agenda_tita"
          WHERE (("agenda_tita"."terapia_exibicao_nome" IS NOT NULL) AND ("agenda_tita"."profissional_id" IS NOT NULL))
          ORDER BY "agenda_tita"."profissional_id", "agenda_tita"."data_atendimento") "th" ON ((("th"."profissional_id" = "gp"."profissional_id") AND ("th"."data_atendimento" = "gp"."data"))))
     LEFT JOIN "public"."agenda_tita" "a" ON ((("a"."profissional_id" = "gp"."profissional_id") AND ("a"."data_atendimento" = "gp"."data") AND ("a"."hora_inicial" = "gp"."hora_inicial") AND ("a"."ativo" = true))))
  WHERE (("a"."tita_agendamento_id" IS NULL) AND ("gp"."id_unidade" = 280));


ALTER VIEW "public"."vw_modal_substituicao_terapeutas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_profissionais_disponiveis" AS
 SELECT "id",
    "grade_terapeuta_id",
    "grade_clinica_id",
    "profissional_id",
    "nome_profissional",
    "cpf_profissional",
    "numero_telefone",
    "cbo_profissional",
    "registro_profissional",
    "tipo_registro_profissional",
    "uf_registro_profissional",
    "id_unidade",
    "nome_unidade",
    "dia_semana",
    "data",
    "hora_inicial",
    "hora_final",
    "status_agendamento",
    "terapia_id",
    "nome_terapia",
    "terapia_exibicao_id",
    "terapia_exibicao",
    "id_sala",
    "sala",
    "observacoes_sala",
    "raw_json",
    "created_at",
    "updated_at"
   FROM "public"."grade_profissionais_tita"
  WHERE (("status_agendamento" = 'Livre'::"text") AND ("id_unidade" = 280));


ALTER VIEW "public"."vw_profissionais_disponiveis" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_terapeutas_semana" AS
 WITH "turnos" AS (
         SELECT "grade_profissionais_tita"."profissional_id",
                CASE
                    WHEN ("bool_or"(("grade_profissionais_tita"."hora_inicial" < '13:00:00'::time without time zone)) AND "bool_or"(("grade_profissionais_tita"."hora_inicial" >= '13:00:00'::time without time zone))) THEN 'ambos'::"text"
                    WHEN "bool_or"(("grade_profissionais_tita"."hora_inicial" < '13:00:00'::time without time zone)) THEN 'manha'::"text"
                    ELSE 'tarde'::"text"
                END AS "turno_semana"
           FROM "public"."grade_profissionais_tita"
          WHERE ((("grade_profissionais_tita"."data" >= ("date_trunc"('week'::"text", (CURRENT_DATE)::timestamp with time zone))::"date") AND ("grade_profissionais_tita"."data" <= (("date_trunc"('week'::"text", (CURRENT_DATE)::timestamp with time zone) + '4 days'::interval))::"date")) AND ("grade_profissionais_tita"."id_unidade" = 280))
          GROUP BY "grade_profissionais_tita"."profissional_id"
        )
 SELECT DISTINCT ON ("g"."profissional_id", "g"."nome_terapia",
        CASE
            WHEN (("g"."nome_unidade" ~~* '%Realengo%'::"text") OR ("g"."sala" ~~* '%Realengo%'::"text")) THEN 'Realengo'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Fazendinha%'::"text") OR ("g"."sala" ~~* '%Fazendinha%'::"text")) THEN 'Fazendinha'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Padre Miguel%'::"text") OR ("g"."sala" ~~* '%Padre Miguel%'::"text")) THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END) "g"."profissional_id",
    "g"."nome_profissional" AS "profissional_nome",
    "g"."nome_terapia" AS "terapia_nome",
    COALESCE("g"."terapia_exibicao", "g"."nome_terapia") AS "terapia_exibicao_nome",
        CASE
            WHEN (("g"."nome_unidade" ~~* '%Realengo%'::"text") OR ("g"."sala" ~~* '%Realengo%'::"text")) THEN 'Realengo'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Fazendinha%'::"text") OR ("g"."sala" ~~* '%Fazendinha%'::"text")) THEN 'Fazendinha'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Padre Miguel%'::"text") OR ("g"."sala" ~~* '%Padre Miguel%'::"text")) THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END AS "unidade",
    COALESCE("t"."turno_semana", 'ambos'::"text") AS "turno_semana"
   FROM ("public"."grade_profissionais_tita" "g"
     LEFT JOIN "turnos" "t" ON (("t"."profissional_id" = "g"."profissional_id")))
  WHERE ((("g"."data" >= ("date_trunc"('week'::"text", (CURRENT_DATE)::timestamp with time zone))::"date") AND ("g"."data" <= (("date_trunc"('week'::"text", (CURRENT_DATE)::timestamp with time zone) + '4 days'::interval))::"date")) AND ("g"."id_unidade" = 280) AND ("g"."nome_terapia" IS NOT NULL) AND ("g"."profissional_id" IS NOT NULL))
  ORDER BY "g"."profissional_id", "g"."nome_terapia",
        CASE
            WHEN (("g"."nome_unidade" ~~* '%Realengo%'::"text") OR ("g"."sala" ~~* '%Realengo%'::"text")) THEN 'Realengo'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Fazendinha%'::"text") OR ("g"."sala" ~~* '%Fazendinha%'::"text")) THEN 'Fazendinha'::"text"
            WHEN (("g"."nome_unidade" ~~* '%Padre Miguel%'::"text") OR ("g"."sala" ~~* '%Padre Miguel%'::"text")) THEN 'Padre Miguel'::"text"
            ELSE 'Outros'::"text"
        END;


ALTER VIEW "public"."vw_terapeutas_semana" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_tokens" (
    "token" "uuid" NOT NULL,
    "user_id" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."worker_tokens" OWNER TO "postgres";


ALTER TABLE ONLY "cco"."dashboard_snapshot" ALTER COLUMN "id" SET DEFAULT "nextval"('"cco"."dashboard_snapshot_id_seq"'::"regclass");



ALTER TABLE ONLY "cco"."processing_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"cco"."processing_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agenda_tita" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agenda_tita_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."config_regras_terapias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."config_regras_terapias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."substituicoes_historico" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."substituicoes_historico_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."terapeuta_eventos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."terapeuta_eventos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tita_grade_profissionais" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tita_grade_profissionais_id_seq"'::"regclass");



ALTER TABLE ONLY "cco"."atendimentos"
    ADD CONSTRAINT "atendimentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."atendimentos"
    ADD CONSTRAINT "atendimentos_session_key_key" UNIQUE ("session_key");



ALTER TABLE ONLY "cco"."dashboard_snapshot"
    ADD CONSTRAINT "dashboard_snapshot_data_ref_key" UNIQUE ("data_ref");



ALTER TABLE ONLY "cco"."dashboard_snapshot"
    ADD CONSTRAINT "dashboard_snapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."occurrences"
    ADD CONSTRAINT "occurrences_fingerprint_key" UNIQUE ("fingerprint");



ALTER TABLE ONLY "cco"."occurrences"
    ADD CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."processing_logs"
    ADD CONSTRAINT "processing_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."session_authorizations"
    ADD CONSTRAINT "session_authorizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."session_authorizations"
    ADD CONSTRAINT "session_authorizations_session_key_source_key" UNIQUE ("session_key", "source");



ALTER TABLE ONLY "cco"."session_mutations"
    ADD CONSTRAINT "session_mutations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."session_mutations"
    ADD CONSTRAINT "session_mutations_session_key_old_session_key_new_key" UNIQUE ("session_key_old", "session_key_new");



ALTER TABLE ONLY "cco"."session_substitutions"
    ADD CONSTRAINT "session_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "cco"."session_substitutions"
    ADD CONSTRAINT "session_substitutions_session_key_key" UNIQUE ("session_key");



ALTER TABLE ONLY "public"."agenda_orbita"
    ADD CONSTRAINT "agenda_orbita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_orbita"
    ADD CONSTRAINT "agenda_orbita_unique" UNIQUE ("paciente_id", "data_atendimento", "horario", "terapia");



ALTER TABLE ONLY "public"."agenda_terapias"
    ADD CONSTRAINT "agenda_terapias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_tita"
    ADD CONSTRAINT "agenda_tita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auditoria_glosa_motivos"
    ADD CONSTRAINT "auditoria_glosa_motivos_pkey" PRIMARY KEY ("bloco_id");



ALTER TABLE ONLY "public"."autorizacoes_assim"
    ADD CONSTRAINT "autorizacoes_assim_guia_key" UNIQUE ("guia");



ALTER TABLE ONLY "public"."autorizacoes_assim"
    ADD CONSTRAINT "autorizacoes_assim_pkey" PRIMARY KEY ("guia");



ALTER TABLE ONLY "public"."autorizacoes"
    ADD CONSTRAINT "autorizacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamada_paciente"
    ADD CONSTRAINT "chamada_paciente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."config_regras_terapias"
    ADD CONSTRAINT "config_regras_terapias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_disponibilidade_terapeutas"
    ADD CONSTRAINT "controle_disponibilidade_terapeutas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_terapeutico"
    ADD CONSTRAINT "controle_terapeutico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_terapeutico"
    ADD CONSTRAINT "controle_terapeutico_tita_agendamento_id_key" UNIQUE ("tita_agendamento_id");



ALTER TABLE ONLY "public"."crm_inconsistencias"
    ADD CONSTRAINT "crm_inconsistencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_disponibilidade_terapeutas"
    ADD CONSTRAINT "disponibilidade_terapeuta_horario_unico" UNIQUE ("data", "terapeuta_id", "hora_inicial", "terapia_id");



ALTER TABLE ONLY "public"."fila_autorizacoes_logs"
    ADD CONSTRAINT "fila_autorizacoes_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fila_autorizacoes"
    ADD CONSTRAINT "fila_autorizacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fila_autorizacoes"
    ADD CONSTRAINT "fila_autorizacoes_unique" UNIQUE ("paciente_id", "data_atendimento", "horario", "terapia_nome");



ALTER TABLE ONLY "public"."grade_profissionais_tita"
    ADD CONSTRAINT "grade_profissionais_tita_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guia_terapias"
    ADD CONSTRAINT "guia_terapias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guias_processadas"
    ADD CONSTRAINT "guias_processadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs_execucao"
    ADD CONSTRAINT "logs_execucao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maquinas"
    ADD CONSTRAINT "maquinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paciente_classificacao"
    ADD CONSTRAINT "paciente_classificacao_paciente_id_key" UNIQUE ("paciente_id");



ALTER TABLE ONLY "public"."paciente_classificacao"
    ADD CONSTRAINT "paciente_classificacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."paciente_medico_vigente"
    ADD CONSTRAINT "paciente_medico_vigente_pkey" PRIMARY KEY ("paciente_id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissoes"
    ADD CONSTRAINT "permissoes_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."permissoes"
    ADD CONSTRAINT "permissoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pre_auditoria_snapshot"
    ADD CONSTRAINT "pre_auditoria_snapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."substituicoes_historico"
    ADD CONSTRAINT "substituicoes_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_controle"
    ADD CONSTRAINT "sync_controle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_status"
    ADD CONSTRAINT "sync_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terapeuta_eventos"
    ADD CONSTRAINT "terapeuta_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terapeutas"
    ADD CONSTRAINT "terapeutas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terapias_controle"
    ADD CONSTRAINT "terapias_controle_pkey" PRIMARY KEY ("terapia_id");



ALTER TABLE ONLY "public"."tita_grade_profissionais"
    ADD CONSTRAINT "tita_grade_profissionais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."autorizacoes"
    ADD CONSTRAINT "unique_agendamento" UNIQUE ("paciente_nome", "data_atendimento", "horario");



ALTER TABLE ONLY "public"."fila_autorizacoes"
    ADD CONSTRAINT "unique_fila_agendamento" UNIQUE ("paciente_id", "data_atendimento", "horario");



ALTER TABLE ONLY "public"."grade_profissionais_tita"
    ADD CONSTRAINT "uq_grade_profissionais_snapshot" UNIQUE ("grade_terapeuta_id", "data", "hora_inicial", "hora_final", "status_agendamento");



ALTER TABLE ONLY "public"."usuarios_permissoes"
    ADD CONSTRAINT "uq_usuario_permissao" UNIQUE ("usuario_id", "permissao_codigo");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios_permissoes"
    ADD CONSTRAINT "usuarios_permissoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."worker_tokens"
    ADD CONSTRAINT "worker_tokens_pkey" PRIMARY KEY ("token");



CREATE INDEX "idx_atend_orphaned_at" ON "cco"."atendimentos" USING "btree" ("orphaned_at") WHERE ("orphaned_at" IS NOT NULL);



COMMENT ON INDEX "cco"."idx_atend_orphaned_at" IS 'Performance index for orphan cleanup queries. Filters only orphaned records (orphaned_at IS NOT NULL) for efficient deletion by daily cron job.';



CREATE INDEX "idx_auth_session_key" ON "cco"."session_authorizations" USING "btree" ("session_key");



CREATE INDEX "idx_auth_status" ON "cco"."session_authorizations" USING "btree" ("authorization_status");



CREATE INDEX "idx_logs_job_name" ON "cco"."processing_logs" USING "btree" ("job_name", "started_at" DESC);



CREATE INDEX "idx_mutations_detected_at" ON "cco"."session_mutations" USING "btree" ("detected_at");



CREATE INDEX "idx_mutations_new_key" ON "cco"."session_mutations" USING "btree" ("session_key_new");



CREATE INDEX "idx_mutations_old_key" ON "cco"."session_mutations" USING "btree" ("session_key_old");



CREATE INDEX "idx_mutations_processed_at" ON "cco"."session_mutations" USING "btree" ("processed_at") WHERE ("processed_at" IS NULL);



CREATE INDEX "idx_mutations_tita_id" ON "cco"."session_mutations" USING "btree" ("tita_agendamento_id");



CREATE INDEX "idx_occ_active" ON "cco"."occurrences" USING "btree" ("severity", "tipo", "created_at") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_occ_created_at" ON "cco"."occurrences" USING "btree" ("created_at");



CREATE INDEX "idx_occ_payload" ON "cco"."occurrences" USING "gin" ("payload_json");



CREATE INDEX "idx_occ_receita_risco" ON "cco"."occurrences" USING "btree" ("session_key") WHERE (("tipo" = ANY (ARRAY['SESSAO_SEM_AUTORIZACAO'::"cco"."occurrence_type_enum", 'AUTORIZACAO_PENDENTE'::"cco"."occurrence_type_enum", 'EVOLUCAO_ATRASADA'::"cco"."occurrence_type_enum"])) AND ("resolved_at" IS NULL));



CREATE INDEX "idx_occ_session_key" ON "cco"."occurrences" USING "btree" ("session_key");



CREATE INDEX "idx_occ_tipo_severity" ON "cco"."occurrences" USING "btree" ("tipo", "severity");



CREATE INDEX "idx_sessions_convenio_data" ON "cco"."atendimentos" USING "btree" ("convenio", "data_sessao");



CREATE INDEX "idx_sessions_data_sessao" ON "cco"."atendimentos" USING "btree" ("data_sessao");



CREATE INDEX "idx_sessions_profissional" ON "cco"."atendimentos" USING "btree" ("profissional_agendado", "data_sessao");



CREATE UNIQUE INDEX "idx_sessions_session_key" ON "cco"."atendimentos" USING "btree" ("session_key");



CREATE INDEX "idx_sessions_tita_id" ON "cco"."atendimentos" USING "btree" ("tita_agendamento_id") WHERE ("tita_agendamento_id" IS NOT NULL);



CREATE INDEX "idx_sessions_unidade_data" ON "cco"."atendimentos" USING "btree" ("unidade", "data_sessao");



CREATE INDEX "idx_snapshot_data_ref" ON "cco"."dashboard_snapshot" USING "btree" ("data_ref" DESC);



CREATE INDEX "idx_sub_session_key" ON "cco"."session_substitutions" USING "btree" ("session_key");



CREATE INDEX "agenda_tita_ativo_idx" ON "public"."agenda_tita" USING "btree" ("ativo");



CREATE INDEX "agenda_tita_data_idx" ON "public"."agenda_tita" USING "btree" ("data_atendimento");



CREATE INDEX "agenda_tita_paciente_idx" ON "public"."agenda_tita" USING "btree" ("paciente_id");



CREATE UNIQUE INDEX "agenda_tita_unico_active" ON "public"."agenda_tita" USING "btree" ("tita_agendamento_id") WHERE ("ativo" = true);



CREATE INDEX "idx_agenda_data" ON "public"."agenda_terapias" USING "btree" ("data_atendimento");



CREATE INDEX "idx_agenda_orbita_data" ON "public"."agenda_orbita" USING "btree" ("data_atendimento");



CREATE INDEX "idx_agenda_orbita_paciente" ON "public"."agenda_orbita" USING "btree" ("paciente_id");



CREATE INDEX "idx_agenda_paciente" ON "public"."agenda_terapias" USING "btree" ("paciente_id");



CREATE INDEX "idx_agenda_tita_carteirinha" ON "public"."agenda_tita" USING "btree" ("numero_carteirinha");



CREATE INDEX "idx_agenda_tita_operacional" ON "public"."agenda_tita" USING "btree" ("data_atendimento", "hora_inicial", "numero_carteirinha", "terapia_exibicao_nome", "paciente_nome");



CREATE INDEX "idx_agenda_tita_profissional_id" ON "public"."agenda_tita" USING "btree" ("profissional_id", "profissional_nome");



CREATE INDEX "idx_autorizacoes_assim_auditoria" ON "public"."autorizacoes_assim" USING "btree" ("paciente_id", "codigo_tuss", "data_execucao");



CREATE INDEX "idx_autorizacoes_assim_match" ON "public"."autorizacoes_assim" USING "btree" ("matricula_limpa", "codigo_tuss", "data_execucao");



CREATE INDEX "idx_autorizacoes_assim_paciente_id" ON "public"."autorizacoes_assim" USING "btree" ("paciente_id");



CREATE INDEX "idx_autorizacoes_created_at_desc" ON "public"."autorizacoes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_autorizacoes_data_atendimento" ON "public"."autorizacoes" USING "btree" ("data_atendimento");



CREATE INDEX "idx_autorizacoes_machine_id" ON "public"."autorizacoes" USING "btree" ("machine_id");



CREATE INDEX "idx_autorizacoes_status" ON "public"."autorizacoes" USING "btree" ("status");



CREATE INDEX "idx_autorizacoes_status_created_at" ON "public"."autorizacoes" USING "btree" ("status", "created_at");



CREATE INDEX "idx_autorizacoes_status_machine" ON "public"."autorizacoes" USING "btree" ("status", "machine_id");



CREATE INDEX "idx_autorizacoes_usuario_id" ON "public"."autorizacoes" USING "btree" ("usuario_id");



CREATE INDEX "idx_chamada_paciente_agenda" ON "public"."chamada_paciente" USING "btree" ("agenda_id");



CREATE INDEX "idx_chamada_paciente_data" ON "public"."chamada_paciente" USING "btree" ("chamado_em" DESC);



CREATE INDEX "idx_chamada_paciente_unidade" ON "public"."chamada_paciente" USING "btree" ("unidade");



CREATE INDEX "idx_chamada_recent" ON "public"."chamada_paciente" USING "btree" ("agenda_id", "chamado_em" DESC);



CREATE INDEX "idx_config_regras_terapias_categoria" ON "public"."config_regras_terapias" USING "btree" ("categoria", "ativo");



CREATE INDEX "idx_controle_terapeutico_confirmado_em" ON "public"."controle_terapeutico" USING "btree" ("confirmado_em");



CREATE INDEX "idx_controle_terapeutico_status" ON "public"."controle_terapeutico" USING "btree" ("status");



CREATE INDEX "idx_controle_terapeutico_substituto" ON "public"."controle_terapeutico" USING "btree" ("profissional_substituto_id");



CREATE INDEX "idx_data_execucao" ON "public"."autorizacoes_assim" USING "btree" ("data_execucao");



CREATE INDEX "idx_disponibilidade_agenda" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("agenda_id");



CREATE INDEX "idx_disponibilidade_data" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("data");



CREATE INDEX "idx_disponibilidade_horario" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("hora_inicial");



CREATE INDEX "idx_disponibilidade_status" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("status");



CREATE INDEX "idx_disponibilidade_substituto" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("substituto_id");



CREATE INDEX "idx_disponibilidade_terapeuta" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("terapeuta_id");



CREATE INDEX "idx_disponibilidade_terapia" ON "public"."controle_disponibilidade_terapeutas" USING "btree" ("terapia_id");



CREATE INDEX "idx_fila_autorizacoes_auditoria" ON "public"."fila_autorizacoes" USING "btree" ("paciente_id", "tuss", "data_atendimento");



CREATE INDEX "idx_fila_autorizacoes_lookup" ON "public"."fila_autorizacoes" USING "btree" ("paciente_id", "data_atendimento", "horario", "tuss", "terapia_exibicao_id");



CREATE INDEX "idx_fila_autorizacoes_match" ON "public"."fila_autorizacoes" USING "btree" ("empresa", "matricula", "dep", "data_atendimento", "tuss");



CREATE INDEX "idx_fila_data" ON "public"."fila_autorizacoes" USING "btree" ("data_atendimento");



CREATE INDEX "idx_fila_operacional" ON "public"."fila_autorizacoes" USING "btree" ("data_atendimento", "matricula", "dep", "horario", "status");



CREATE INDEX "idx_fila_paciente" ON "public"."fila_autorizacoes" USING "btree" ("paciente_id");



CREATE INDEX "idx_fila_status" ON "public"."fila_autorizacoes" USING "btree" ("status");



CREATE INDEX "idx_grade_data" ON "public"."grade_profissionais_tita" USING "btree" ("data");



CREATE INDEX "idx_grade_profissional" ON "public"."grade_profissionais_tita" USING "btree" ("profissional_id");



CREATE INDEX "idx_grade_status" ON "public"."grade_profissionais_tita" USING "btree" ("status_agendamento");



CREATE INDEX "idx_grade_terapia" ON "public"."grade_profissionais_tita" USING "btree" ("terapia_id");



CREATE INDEX "idx_guia_terapias_guia_numero" ON "public"."guia_terapias" USING "btree" ("guia_numero");



CREATE INDEX "idx_guia_terapias_terapeuta_id" ON "public"."guia_terapias" USING "btree" ("terapeuta_id");



CREATE INDEX "idx_guias_processadas_guia_numero" ON "public"."guias_processadas" USING "btree" ("guia_numero");



CREATE INDEX "idx_logs_autorizacao_id_created_at_desc" ON "public"."logs" USING "btree" ("autorizacao_id", "created_at" DESC);



CREATE INDEX "idx_logs_created_at" ON "public"."logs_execucao" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_logs_fila_id" ON "public"."fila_autorizacoes_logs" USING "btree" ("fila_id");



CREATE INDEX "idx_logs_machine" ON "public"."logs_execucao" USING "btree" ("machine_id");



CREATE INDEX "idx_logs_user" ON "public"."logs_execucao" USING "btree" ("user_id");



CREATE INDEX "idx_maquinas_user_id" ON "public"."maquinas" USING "btree" ("user_id");



CREATE INDEX "idx_paciente_medico_vigente" ON "public"."paciente_medico_vigente" USING "btree" ("paciente_id");



CREATE INDEX "idx_sessions_machine" ON "public"."sessions" USING "btree" ("machine_id");



CREATE INDEX "idx_sessions_user" ON "public"."sessions" USING "btree" ("user_id");



CREATE INDEX "idx_status" ON "public"."autorizacoes_assim" USING "btree" ("status");



CREATE INDEX "idx_status_tratado" ON "public"."autorizacoes_assim" USING "btree" ("status_tratado");



CREATE INDEX "idx_subst_hist_competencia" ON "public"."substituicoes_historico" USING "btree" ("competencia");



CREATE INDEX "idx_subst_hist_data_sessao" ON "public"."substituicoes_historico" USING "btree" ("data_sessao");



CREATE INDEX "idx_subst_hist_prof_subst_id" ON "public"."substituicoes_historico" USING "btree" ("profissional_substituto_id");



CREATE INDEX "idx_subst_hist_sessao_id" ON "public"."substituicoes_historico" USING "btree" ("sessao_id");



CREATE INDEX "idx_terapeuta_eventos_data" ON "public"."terapeuta_eventos" USING "btree" ("data_evento");



CREATE INDEX "idx_terapeuta_eventos_evento" ON "public"."terapeuta_eventos" USING "btree" ("evento");



CREATE INDEX "idx_terapeuta_eventos_terapeuta" ON "public"."terapeuta_eventos" USING "btree" ("terapeuta");



CREATE INDEX "idx_tita_grade_data" ON "public"."tita_grade_profissionais" USING "btree" ("data_atendimento");



CREATE INDEX "idx_tita_grade_status" ON "public"."tita_grade_profissionais" USING "btree" ("status_agendamento");



CREATE INDEX "idx_tita_grade_terapeuta" ON "public"."tita_grade_profissionais" USING "btree" ("terapeuta_nome");



CREATE INDEX "idx_worker_tokens_expires" ON "public"."worker_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_worker_tokens_user" ON "public"."worker_tokens" USING "btree" ("user_id");



CREATE UNIQUE INDEX "unique_agenda" ON "public"."agenda_terapias" USING "btree" ("paciente_id", "data_atendimento", "horario");



CREATE UNIQUE INDEX "unique_fila_execucao" ON "public"."fila_autorizacoes" USING "btree" ("paciente_id", "data_atendimento", "horario") WHERE ("status" = ANY (ARRAY['pendente'::"text", 'processando'::"text"]));



CREATE UNIQUE INDEX "unique_user_machine" ON "public"."maquinas" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uq_grade_slot" ON "public"."grade_profissionais_tita" USING "btree" ("grade_terapeuta_id", "data", "hora_inicial");



CREATE OR REPLACE TRIGGER "controle-terapeutico-slack" AFTER INSERT OR UPDATE ON "public"."controle_terapeutico" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/msg-slack', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trg_autorizacoes_set_updated_at" BEFORE UPDATE ON "public"."autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_controle_terapeutico_data_atualizacao" BEFORE UPDATE ON "public"."controle_terapeutico" FOR EACH ROW EXECUTE FUNCTION "public"."set_data_atualizacao"();



CREATE OR REPLACE TRIGGER "trg_controle_terapeutico_updated_at" BEFORE UPDATE ON "public"."controle_terapeutico" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_log_fila_autorizacoes" AFTER INSERT OR UPDATE ON "public"."fila_autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_log_fila_autorizacoes"();



CREATE OR REPLACE TRIGGER "trg_preencher_paciente_assim" BEFORE INSERT ON "public"."autorizacoes_assim" FOR EACH ROW EXECUTE FUNCTION "public"."preencher_paciente_assim"();



CREATE OR REPLACE TRIGGER "trg_preencher_paciente_assim_update" BEFORE UPDATE ON "public"."autorizacoes_assim" FOR EACH ROW EXECUTE FUNCTION "public"."preencher_paciente_assim"();



CREATE OR REPLACE TRIGGER "trg_update_controle_disponibilidade_updated_at" BEFORE UPDATE ON "public"."controle_disponibilidade_terapeutas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_controle_disponibilidade"();



CREATE OR REPLACE TRIGGER "trigger_ajustar_crm" BEFORE INSERT OR UPDATE ON "public"."fila_autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."ajustar_crm_fila"();



CREATE OR REPLACE TRIGGER "trigger_ajustar_matricula" BEFORE INSERT OR UPDATE ON "public"."fila_autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."ajustar_matricula_fila"();



CREATE OR REPLACE TRIGGER "trigger_updated_at" BEFORE INSERT OR UPDATE ON "public"."fila_autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."atualizar_updated_at"();



CREATE OR REPLACE TRIGGER "update_autorizacoes_updated_at" BEFORE UPDATE ON "public"."autorizacoes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_autorizacoes_updated_at" BEFORE UPDATE ON "public"."autorizacoes_assim" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "cco"."occurrences"
    ADD CONSTRAINT "occurrences_session_key_fkey" FOREIGN KEY ("session_key") REFERENCES "cco"."atendimentos"("session_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "cco"."session_authorizations"
    ADD CONSTRAINT "session_authorizations_session_key_fkey" FOREIGN KEY ("session_key") REFERENCES "cco"."atendimentos"("session_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "cco"."session_mutations"
    ADD CONSTRAINT "session_mutations_session_key_new_fkey" FOREIGN KEY ("session_key_new") REFERENCES "cco"."atendimentos"("session_key") ON DELETE SET NULL;



ALTER TABLE ONLY "cco"."session_substitutions"
    ADD CONSTRAINT "session_substitutions_session_key_fkey" FOREIGN KEY ("session_key") REFERENCES "cco"."atendimentos"("session_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."autorizacoes"
    ADD CONSTRAINT "autorizacoes_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."maquinas"("id");



ALTER TABLE ONLY "public"."autorizacoes"
    ADD CONSTRAINT "autorizacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."guia_terapias"
    ADD CONSTRAINT "guia_terapias_terapeuta_id_fkey" FOREIGN KEY ("terapeuta_id") REFERENCES "public"."terapeutas"("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_autorizacao_id_fkey" FOREIGN KEY ("autorizacao_id") REFERENCES "public"."autorizacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logs_execucao"
    ADD CONSTRAINT "logs_execucao_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."logs_execucao"
    ADD CONSTRAINT "logs_execucao_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios_permissoes"
    ADD CONSTRAINT "usuarios_permissoes_permissao_codigo_fkey" FOREIGN KEY ("permissao_codigo") REFERENCES "public"."permissoes"("codigo") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_tokens"
    ADD CONSTRAINT "worker_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin pode atualizar usuarios" ON "public"."usuarios" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admin pode ver todos usuarios" ON "public"."usuarios" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Allow insert for authenticated" ON "public"."auditoria_glosa_motivos" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow select for authenticated" ON "public"."agenda_tita" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow select for authenticated" ON "public"."auditoria_glosa_motivos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow select for authenticated" ON "public"."grade_profissionais_tita" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow update for authenticated" ON "public"."auditoria_glosa_motivos" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Leitura agenda para usuarios autenticados" ON "public"."agenda_terapias" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Leitura fila para usuarios autenticados" ON "public"."fila_autorizacoes" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Liberar tudo chamada" ON "public"."chamada_paciente" TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir insert chamada" ON "public"."chamada_paciente" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir select controle terapeutico autenticado" ON "public"."controle_terapeutico" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir select sync" ON "public"."sync_controle" FOR SELECT USING (true);



CREATE POLICY "Permitir update controle terapeutico autenticado" ON "public"."controle_terapeutico" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir update de autorizacoes" ON "public"."autorizacoes" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Permitir update sync" ON "public"."sync_controle" FOR UPDATE USING (true);



CREATE POLICY "Usuarios autenticados podem acessar" ON "public"."fila_autorizacoes" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Usuarios autenticados podem atualizar classificacao" ON "public"."fila_autorizacoes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados podem ver registros" ON "public"."fila_autorizacoes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuário pode ver próprio perfil" ON "public"."usuarios" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "admin_ver_todas_maquinas" ON "public"."maquinas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"text")))));



ALTER TABLE "public"."agenda_orbita" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agenda_terapias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agenda_tita" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agenda_tita_autorizacao_backup_20260508" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "allow insert agenda_orbita" ON "public"."agenda_orbita" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "allow select agenda_orbita" ON "public"."agenda_orbita" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "allow update agenda_orbita" ON "public"."agenda_orbita" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."auditoria_glosa_motivos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated read" ON "public"."autorizacoes_assim" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_access" ON "public"."fila_autorizacoes_logs" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."autorizacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."autorizacoes_assim" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_fila_null_terapia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "block delete frontend" ON "public"."autorizacoes_assim" FOR DELETE USING (false);



CREATE POLICY "block insert frontend" ON "public"."autorizacoes_assim" FOR INSERT WITH CHECK (false);



CREATE POLICY "block update frontend" ON "public"."autorizacoes_assim" FOR UPDATE USING (false);



ALTER TABLE "public"."chamada_paciente" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."config_regras_terapias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."controle_disponibilidade_terapeutas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."controle_terapeutico" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "controle_terapeutico_insert_authenticated" ON "public"."controle_terapeutico" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "controle_terapeutico_select_authenticated" ON "public"."controle_terapeutico" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "controle_terapeutico_update_authenticated" ON "public"."controle_terapeutico" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."crm_inconsistencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fila_autorizacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fila_autorizacoes_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "full access fila" ON "public"."fila_autorizacoes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."grade_profissionais_tita" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guia_terapias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guias_processadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert autorizacao" ON "public"."autorizacoes" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = "auth"."uid"()));



CREATE POLICY "insert classificacao" ON "public"."paciente_classificacao" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert logs liberado" ON "public"."logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "insert logs liberado geral" ON "public"."logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "insert publico" ON "public"."autorizacoes" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs_execucao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "maquina_select_propria" ON "public"."maquinas" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "maquina_update_propria" ON "public"."maquinas" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."maquinas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no delete" ON "public"."autorizacoes" FOR DELETE TO "authenticated" USING (false);



ALTER TABLE "public"."paciente_classificacao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."paciente_medico_vigente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "perfil próprio" ON "public"."perfis" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissoes_all_admin" ON "public"."permissoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."role" = 'admin'::"text")))));



CREATE POLICY "permissoes_select_authenticated" ON "public"."permissoes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pre_auditoria_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select agenda" ON "public"."agenda_terapias" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select classificacao" ON "public"."paciente_classificacao" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select liberado geral" ON "public"."autorizacoes" FOR SELECT USING (true);



CREATE POLICY "select_agenda" ON "public"."agenda_terapias" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "select_fila" ON "public"."fila_autorizacoes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service role full access" ON "public"."autorizacoes_assim" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."substituicoes_historico" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "substituicoes_historico_insert" ON "public"."substituicoes_historico" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "substituicoes_historico_select" ON "public"."substituicoes_historico" FOR SELECT USING (("auth"."role"() = ANY (ARRAY['authenticated'::"text", 'service_role'::"text"])));



ALTER TABLE "public"."sync_controle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terapeuta_eventos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terapeutas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terapias_controle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tita_grade_profissionais" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update autorizacoes liberado" ON "public"."autorizacoes" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "update classificacao" ON "public"."paciente_classificacao" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "update fila" ON "public"."fila_autorizacoes" FOR UPDATE USING (true);



CREATE POLICY "user can access own sessions" ON "public"."sessions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user can manage own tokens" ON "public"."worker_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user can view own logs" ON "public"."logs_execucao" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios_permissoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios_permissoes_select" ON "public"."usuarios_permissoes" FOR SELECT TO "authenticated" USING ((("usuario_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."role" = 'admin'::"text"))))));



CREATE POLICY "usuarios_permissoes_write_admin" ON "public"."usuarios_permissoes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."role" = 'admin'::"text")))));



ALTER TABLE "public"."vw_central_pacientes_backup_20260508" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_tokens" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chamada_paciente";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."fila_autorizacoes";



GRANT USAGE ON SCHEMA "cco" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."ajustar_crm_fila"() TO "anon";
GRANT ALL ON FUNCTION "public"."ajustar_crm_fila"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_crm_fila"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ajustar_matricula_fila"() TO "anon";
GRANT ALL ON FUNCTION "public"."ajustar_matricula_fila"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_matricula_fila"() TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_auto_resolve_occurrences"("p_tipo" "text", "p_active_session_keys" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_cco_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_cco_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_cco_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_test_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_test_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_test_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_worker_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_worker_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_worker_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r1_autorizacao_pendente"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r1_autorizacao_pendente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r1_autorizacao_pendente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r2_sessao_sem_autorizacao"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r2_sessao_sem_autorizacao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r2_sessao_sem_autorizacao"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r3_evolucao_atrasada"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r3_evolucao_atrasada"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r3_evolucao_atrasada"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r4_falta_terapeuta"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r4_falta_terapeuta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r4_falta_terapeuta"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r5_substituicao"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r5_substituicao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r5_substituicao"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r6_falta_paciente"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r6_falta_paciente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r6_falta_paciente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_r7_glosa"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_r7_glosa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_r7_glosa"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_sessions_without_authorization"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_sessions_without_authorization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_sessions_without_authorization"() TO "service_role";



GRANT ALL ON FUNCTION "public"."executar_relatorio_crm_inconsistente"() TO "anon";
GRANT ALL ON FUNCTION "public"."executar_relatorio_crm_inconsistente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."executar_relatorio_crm_inconsistente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_carga_dia"("profissional_ids" bigint[], "p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_carga_dia"("profissional_ids" bigint[], "p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_carga_dia"("profissional_ids" bigint[], "p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_continuidade_semana"("p_paciente_ids" bigint[], "p_data" "date", "profissional_ids" bigint[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_continuidade_semana"("p_paciente_ids" bigint[], "p_data" "date", "profissional_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_continuidade_semana"("p_paciente_ids" bigint[], "p_data" "date", "profissional_ids" bigint[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_substituicoes_competencia"("profissional_ids" bigint[], "p_competencia" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_substituicoes_competencia"("profissional_ids" bigint[], "p_competencia" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_substituicoes_competencia"("profissional_ids" bigint[], "p_competencia" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade_hoje"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade_hoje"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_grade_hoje"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_tita_hoje"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_hoje"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_hoje"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_tita_semana"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_semana"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_tita_semana"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auditoria_assim"("p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_auditoria_assim"("p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auditoria_assim"("p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cco_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_cco_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cco_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_faltas_auditoria_assim"("p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_faltas_auditoria_assim"("p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_faltas_auditoria_assim"("p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_kpis_auditoria_assim"("p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_kpis_auditoria_assim"("p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_kpis_auditoria_assim"("p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."inserir_na_fila_autorizacoes"() TO "anon";
GRANT ALL ON FUNCTION "public"."inserir_na_fila_autorizacoes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inserir_na_fila_autorizacoes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."agenda_orbita" TO "anon";
GRANT ALL ON TABLE "public"."agenda_orbita" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_orbita" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_tita" TO "anon";
GRANT ALL ON TABLE "public"."agenda_tita" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_tita" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_tita_autorizacao" TO "anon";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao" TO "service_role";



GRANT ALL ON TABLE "public"."autorizacoes_assim" TO "anon";
GRANT ALL ON TABLE "public"."autorizacoes_assim" TO "authenticated";
GRANT ALL ON TABLE "public"."autorizacoes_assim" TO "service_role";



GRANT ALL ON TABLE "public"."fila_autorizacoes" TO "anon";
GRANT ALL ON TABLE "public"."fila_autorizacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."fila_autorizacoes" TO "service_role";



GRANT ALL ON TABLE "public"."maquinas" TO "anon";
GRANT ALL ON TABLE "public"."maquinas" TO "authenticated";
GRANT ALL ON TABLE "public"."maquinas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_central_pacientes" TO "anon";
GRANT ALL ON TABLE "public"."vw_central_pacientes" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_central_pacientes" TO "service_role";



GRANT ALL ON FUNCTION "public"."listar_central_pacientes"("p_data" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."listar_central_pacientes"("p_data" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."listar_central_pacientes"("p_data" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."preencher_paciente_assim"() TO "anon";
GRANT ALL ON FUNCTION "public"."preencher_paciente_assim"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."preencher_paciente_assim"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_horarios_disponiveis"("p_data" "date", "p_unidade" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_horarios_disponiveis"("p_data" "date", "p_unidade" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_horarios_disponiveis"("p_data" "date", "p_unidade" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sample_cco_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."sample_cco_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sample_cco_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_data_atualizacao"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_data_atualizacao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_data_atualizacao"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_assim_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_assim_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_assim_results"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_activation"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_activation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_activation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_occurrences_view"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_occurrences_view"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_occurrences_view"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_log_fila_autorizacoes"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_log_fila_autorizacoes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_log_fila_autorizacoes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_dashboard_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dashboard_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dashboard_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_controle_disponibilidade"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_controle_disponibilidade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_controle_disponibilidade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_atendimentos"("p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_occurrences"("p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_occurrences"("p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_occurrences"("p_rows" "jsonb") TO "service_role";












GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."atendimentos" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."dashboard_snapshot" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "cco"."dashboard_snapshot_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."occurrences" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."processing_logs" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "cco"."processing_logs_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."session_authorizations" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "cco"."session_substitutions" TO "service_role";















GRANT ALL ON TABLE "public"."agenda_classificada" TO "anon";
GRANT ALL ON TABLE "public"."agenda_classificada" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_classificada" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_terapias" TO "anon";
GRANT ALL ON TABLE "public"."agenda_terapias" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_terapias" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_backup_20260508" TO "anon";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_backup_20260508" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_backup_20260508" TO "service_role";



GRANT ALL ON TABLE "public"."paciente_medico_vigente" TO "anon";
GRANT ALL ON TABLE "public"."paciente_medico_vigente" TO "authenticated";
GRANT ALL ON TABLE "public"."paciente_medico_vigente" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_v2" TO "anon";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_tita_autorizacao_v2" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agenda_tita_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agenda_tita_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agenda_tita_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."auditoria_glosa_motivos" TO "anon";
GRANT ALL ON TABLE "public"."auditoria_glosa_motivos" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria_glosa_motivos" TO "service_role";



GRANT ALL ON TABLE "public"."autorizacoes" TO "anon";
GRANT ALL ON TABLE "public"."autorizacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."autorizacoes" TO "service_role";



GRANT ALL ON TABLE "public"."backup_fila_null_terapia" TO "anon";
GRANT ALL ON TABLE "public"."backup_fila_null_terapia" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_fila_null_terapia" TO "service_role";



GRANT ALL ON TABLE "public"."chamada_paciente" TO "anon";
GRANT ALL ON TABLE "public"."chamada_paciente" TO "authenticated";
GRANT ALL ON TABLE "public"."chamada_paciente" TO "service_role";



GRANT ALL ON TABLE "public"."config_regras_terapias" TO "anon";
GRANT ALL ON TABLE "public"."config_regras_terapias" TO "authenticated";
GRANT ALL ON TABLE "public"."config_regras_terapias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."config_regras_terapias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."config_regras_terapias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."config_regras_terapias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."controle_disponibilidade_terapeutas" TO "anon";
GRANT ALL ON TABLE "public"."controle_disponibilidade_terapeutas" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_disponibilidade_terapeutas" TO "service_role";



GRANT ALL ON TABLE "public"."controle_terapeutico" TO "anon";
GRANT ALL ON TABLE "public"."controle_terapeutico" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_terapeutico" TO "service_role";



GRANT ALL ON TABLE "public"."crm_inconsistencias" TO "anon";
GRANT ALL ON TABLE "public"."crm_inconsistencias" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_inconsistencias" TO "service_role";



GRANT ALL ON TABLE "public"."fila_autorizacoes_logs" TO "anon";
GRANT ALL ON TABLE "public"."fila_autorizacoes_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."fila_autorizacoes_logs" TO "service_role";



GRANT ALL ON TABLE "public"."grade_profissionais_tita" TO "anon";
GRANT ALL ON TABLE "public"."grade_profissionais_tita" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_profissionais_tita" TO "service_role";



GRANT ALL ON TABLE "public"."guia_terapias" TO "anon";
GRANT ALL ON TABLE "public"."guia_terapias" TO "authenticated";
GRANT ALL ON TABLE "public"."guia_terapias" TO "service_role";



GRANT ALL ON TABLE "public"."guias_processadas" TO "anon";
GRANT ALL ON TABLE "public"."guias_processadas" TO "authenticated";
GRANT ALL ON TABLE "public"."guias_processadas" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."logs_execucao" TO "anon";
GRANT ALL ON TABLE "public"."logs_execucao" TO "authenticated";
GRANT ALL ON TABLE "public"."logs_execucao" TO "service_role";



GRANT ALL ON TABLE "public"."occurrences" TO "anon";
GRANT ALL ON TABLE "public"."occurrences" TO "authenticated";
GRANT ALL ON TABLE "public"."occurrences" TO "service_role";



GRANT ALL ON TABLE "public"."paciente_classificacao" TO "anon";
GRANT ALL ON TABLE "public"."paciente_classificacao" TO "authenticated";
GRANT ALL ON TABLE "public"."paciente_classificacao" TO "service_role";



GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";



GRANT ALL ON TABLE "public"."permissoes" TO "anon";
GRANT ALL ON TABLE "public"."permissoes" TO "authenticated";
GRANT ALL ON TABLE "public"."permissoes" TO "service_role";



GRANT ALL ON TABLE "public"."pre_auditoria_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."pre_auditoria_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."pre_auditoria_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."substituicoes_historico" TO "anon";
GRANT ALL ON TABLE "public"."substituicoes_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."substituicoes_historico" TO "service_role";



GRANT ALL ON SEQUENCE "public"."substituicoes_historico_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."substituicoes_historico_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."substituicoes_historico_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sync_controle" TO "anon";
GRANT ALL ON TABLE "public"."sync_controle" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_controle" TO "service_role";



GRANT ALL ON TABLE "public"."sync_status" TO "anon";
GRANT ALL ON TABLE "public"."sync_status" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_status" TO "service_role";



GRANT ALL ON TABLE "public"."terapeuta_eventos" TO "anon";
GRANT ALL ON TABLE "public"."terapeuta_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."terapeuta_eventos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."terapeuta_eventos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."terapeuta_eventos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."terapeuta_eventos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."terapeutas" TO "anon";
GRANT ALL ON TABLE "public"."terapeutas" TO "authenticated";
GRANT ALL ON TABLE "public"."terapeutas" TO "service_role";



GRANT ALL ON TABLE "public"."terapias_controle" TO "anon";
GRANT ALL ON TABLE "public"."terapias_controle" TO "authenticated";
GRANT ALL ON TABLE "public"."terapias_controle" TO "service_role";



GRANT ALL ON TABLE "public"."tita_grade_profissionais" TO "anon";
GRANT ALL ON TABLE "public"."tita_grade_profissionais" TO "authenticated";
GRANT ALL ON TABLE "public"."tita_grade_profissionais" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tita_grade_profissionais_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tita_grade_profissionais_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tita_grade_profissionais_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios_permissoes" TO "anon";
GRANT ALL ON TABLE "public"."usuarios_permissoes" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios_permissoes" TO "service_role";



GRANT ALL ON TABLE "public"."vw_auditoria_autorizacoes_assim" TO "anon";
GRANT ALL ON TABLE "public"."vw_auditoria_autorizacoes_assim" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_auditoria_autorizacoes_assim" TO "service_role";



GRANT ALL ON TABLE "public"."vw_blocos_autorizaveis_assim" TO "anon";
GRANT ALL ON TABLE "public"."vw_blocos_autorizaveis_assim" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_blocos_autorizaveis_assim" TO "service_role";



GRANT ALL ON TABLE "public"."vw_match_autorizacoes_assim" TO "anon";
GRANT ALL ON TABLE "public"."vw_match_autorizacoes_assim" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_match_autorizacoes_assim" TO "service_role";



GRANT ALL ON TABLE "public"."vw_central_autorizacoes" TO "anon";
GRANT ALL ON TABLE "public"."vw_central_autorizacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_central_autorizacoes" TO "service_role";



GRANT ALL ON TABLE "public"."vw_central_pacientes_backup_20260508" TO "anon";
GRANT ALL ON TABLE "public"."vw_central_pacientes_backup_20260508" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_central_pacientes_backup_20260508" TO "service_role";



GRANT ALL ON TABLE "public"."vw_central_terapeutica" TO "anon";
GRANT ALL ON TABLE "public"."vw_central_terapeutica" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_central_terapeutica" TO "service_role";



GRANT ALL ON TABLE "public"."vw_kpis_auditoria_assim" TO "anon";
GRANT ALL ON TABLE "public"."vw_kpis_auditoria_assim" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_kpis_auditoria_assim" TO "service_role";



GRANT ALL ON TABLE "public"."vw_modal_substituicao_terapeutas" TO "anon";
GRANT ALL ON TABLE "public"."vw_modal_substituicao_terapeutas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_modal_substituicao_terapeutas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_profissionais_disponiveis" TO "anon";
GRANT ALL ON TABLE "public"."vw_profissionais_disponiveis" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_profissionais_disponiveis" TO "service_role";



GRANT ALL ON TABLE "public"."vw_terapeutas_semana" TO "anon";
GRANT ALL ON TABLE "public"."vw_terapeutas_semana" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_terapeutas_semana" TO "service_role";



GRANT ALL ON TABLE "public"."worker_tokens" TO "anon";
GRANT ALL ON TABLE "public"."worker_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_tokens" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































