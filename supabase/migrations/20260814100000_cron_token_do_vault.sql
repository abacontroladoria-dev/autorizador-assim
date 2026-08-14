-- Tira a service_role key de dentro do banco: tudo passa a ler do Vault.
--
-- POR QUE
-- A chave está no histórico de um repositório público (achado de 2026-07-06),
-- então precisa ser rotacionada. Só que rotacionar hoje quebraria 6 pontos em
-- SILÊNCIO: net.http_post é assíncrono, o pg_cron marca o job como sucesso e o
-- 401 da Edge Function não aparece em lugar nenhum. Ninguém descobre até os
-- dados pararem de chegar.
--
-- Levantamento em produção (2026-08-14), 23 jobs no cron.job:
--   5  não usam chave nenhuma (SQL puro)          -> imunes
--   7  já leem do Vault ('cron_service_role_key') -> imunes
--   5  cco-*, via current_setting('app.service_role_key') -> ver NOTA no fim
--   3  jobs com a chave escrita no cron.job.command
--   3  funções agendadas com a chave escrita no corpo
--
-- Esta migration cuida dos 6 últimos. Depois dela, trocar a chave é atualizar
-- UM segredo no Vault (mais o env do Coolify e as Edge Functions, que a
-- plataforma injeta sozinha).
--
-- Ela NÃO invalida chave nenhuma e não muda comportamento: cada job continua
-- com o mesmo horário, a mesma URL e o mesmo corpo. Só muda de onde vem o
-- header Authorization. Pode ser aplicada com o sistema no ar.

-- ---------------------------------------------------------------------------
-- 1. As 6 funções que guardavam a chave no corpo
-- ---------------------------------------------------------------------------
-- Três estão agendadas (fn_sync_tita_operacional, _planejamento, _reconciliacao);
-- as outras três não têm job nenhum hoje, mas seguem carregando a chave vazada
-- em pg_proc.prosrc — qualquer um com leitura no catálogo a lê. Ficam reescritas
-- em vez de removidas: DROP exigiria provar que nada mais as chama, e o ganho de
-- segurança já vem da reescrita. Aposentá-las é uma limpeza separada.
--
-- O guard de token ausente é o ponto principal. Sem ele, 'Bearer ' || NULL vira
-- NULL, o header sai como null no JSON, a Edge Function responde 401 e o job
-- segue marcando sucesso — exatamente o modo de falha que esta migration existe
-- para eliminar. Com ele, um segredo renomeado ou apagado estoura na hora, e o
-- erro fica em cron.job_run_details.
--
-- Continuam SECURITY INVOKER, como eram: o pg_cron as executa como o dono do
-- job (postgres), que lê o Vault. Trocar para SECURITY DEFINER mudaria quem
-- pode disparar um sync, e isso não é assunto desta migration.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_operacional()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  d      date;
  hoje   date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  -- sexta da PRÓXIMA semana = date_trunc('week', hoje) + 11 dias
  fim    date := (date_trunc('week', hoje) + interval '11 days')::date;
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _token text;
  _auth  text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_operacional: segredo cron_service_role_key ausente no Vault';
  END IF;
  _auth := 'Bearer ' || _token;

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
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_planejamento()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _token text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_planejamento: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_reconciliacao()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  d      date;
  hoje   date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  ini    date := hoje - 10;
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _token text;
  _auth  text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_reconciliacao: segredo cron_service_role_key ausente no Vault';
  END IF;
  _auth := 'Bearer ' || _token;

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
$function$;

-- As três sem job agendado hoje. Mesma reescrita, mesmo motivo.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_semana()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _token text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_semana: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_hoje()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda';
  _token text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_hoje: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data', (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date::text
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade_hoje()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade';
  _token text;
  seg    date := date_trunc('week', CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
  sex    date := seg + 4;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_grade_hoje: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'data_inicio', seg::text,
      'data_fim',    sex::text
    )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. fn_sync_tita_grade: o mesmo guard
-- ---------------------------------------------------------------------------
-- Já lia do Vault (20260805150000), mas sem checar o resultado — então herdava
-- a falha silenciosa. Só o guard muda; o corpo é o mesmo.

CREATE OR REPLACE FUNCTION public.fn_sync_tita_grade()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Mesma fórmula de getRangeUntilEndOfNextMonth() em
  -- supabase/functions/sync_tita_grade/index.ts e de fn_sync_grade_csv_em_lotes:
  -- fim do mês seguinte ao atual (ex.: hoje=05/08 -> v_fim=30/09).
  v_fim          date := (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) + interval '2 months' - interval '1 day')::date;
  v_chunk_inicio date := v_hoje;
  v_chunk_fim    date;
  v_token        text;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'fn_sync_tita_grade: segredo cron_service_role_key ausente no Vault';
  END IF;

  WHILE v_chunk_inicio <= v_fim LOOP
    v_chunk_fim := LEAST(v_chunk_inicio + 6, v_fim);

    PERFORM net.http_post(
      url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_grade',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_token,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('data_inicio', v_chunk_inicio::text, 'data_fim', v_chunk_fim::text),
      timeout_milliseconds := 120000
    );

    v_chunk_inicio := v_chunk_fim + 1;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Os 3 jobs com a chave dentro do cron.job.command
-- ---------------------------------------------------------------------------
-- sync_assim_status_5min, sync_tita_agenda e sync-grade-profissionais-hora
-- foram criados direto no dashboard, então não existem em migration nenhuma e
-- este arquivo não sabe qual é a URL, o corpo ou o timeout de cada um.
--
-- Por isso a reescrita é feita sobre o comando que está lá: troca só o literal
-- 'Bearer eyJ...' pela leitura do Vault e reagenda com o MESMO nome e o MESMO
-- horário (cron.schedule com nome existente substitui). Nada mais do comando é
-- tocado — e o segredo nunca precisa aparecer neste arquivo, que vai para um
-- repositório público.
--
-- O laço é dirigido pelo LIKE, não por uma lista fixa de nomes: se algum outro
-- job tiver a chave embutida, ele entra junto.

DO $do$
DECLARE
  j        record;
  v_novo   text;
  v_jobid  bigint;
  v_qtd    int := 0;
BEGIN
  FOR j IN
    SELECT jobid, jobname, schedule, command, active
      FROM cron.job
     WHERE command LIKE '%eyJhbGciOiJIUzI1NiIs%'
     ORDER BY jobname
  LOOP
    v_novo := regexp_replace(
      j.command,
      $re$'Bearer\s+eyJ[A-Za-z0-9_.-]+'$re$,
      $repl$'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')$repl$,
      'g'
    );

    -- Rede de segurança: se o formato do comando não for o esperado, o regex
    -- não casa e a chave continuaria lá. Melhor abortar a migration inteira do
    -- que reagendar um job achando que ele foi limpo.
    IF v_novo LIKE '%eyJhbGciOiJIUzI1NiIs%' THEN
      RAISE EXCEPTION 'job %: o literal da chave nao casou com o regex; comando fora do formato esperado', j.jobname;
    END IF;

    v_jobid := cron.schedule(j.jobname, j.schedule, v_novo);

    -- cron.schedule reativa o job. Um job desligado de propósito continua desligado.
    IF NOT j.active THEN
      PERFORM cron.alter_job(v_jobid, active := false);
    END IF;

    v_qtd := v_qtd + 1;
    RAISE NOTICE 'job % reescrito para ler do Vault', j.jobname;
  END LOOP;

  RAISE NOTICE '% job(s) reescrito(s)', v_qtd;
END
$do$;

-- ---------------------------------------------------------------------------
-- NOTA sobre os 5 jobs cco-*
-- ---------------------------------------------------------------------------
-- cco-conciliation-engine, cco-sync-assim-authorizations, cco-sync-authorization-queue,
-- cco-sync-therapist-control e cco-sync-tita-sessions leem
-- current_setting('app.service_role_key') — sem o segundo argumento, que é o
-- que permitiria o valor ausente. Em 2026-08-14,
-- current_setting('app.service_role_key', true) devolve NULL em produção: o
-- GUC não existe. Ou seja, esses 5 jobs já levantam exceção a cada execução,
-- o que é coerente com o CCO estar parado desde 11/06.
--
-- Ficam de fora desta migration de propósito. Reescrevê-los para o Vault não
-- seria limpeza, seria RESSUSCITAR 5 jobs que batem em Edge Function a cada
-- 5–15 minutos — decisão de produto, e com custo de I/O que já foi assunto
-- (orçamento de disco de 2026-07-08). Aposentar (cron.unschedule) ou reviver
-- é escolha separada.
--
-- De qualquer forma, eles não são afetados pela rotação da chave: não têm chave.
