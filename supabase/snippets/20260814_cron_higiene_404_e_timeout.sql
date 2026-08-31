-- ============================================================
-- Higiene do cron: job 404 e timeout do pg_net  (2026-08-14)
-- Aplicar no SQL Editor. NAO tem relacao com a rotacao da chave
-- (isso foi 20260814_cron_token_do_vault.sql, ja aplicado).
--
-- Conteudo: 20260814100200_cron_higiene_404_e_timeout.sql
--
-- 1. Aposenta sync_assim_status_5min. A function sync_assim_status
--    nao existe (confirmado em `supabase functions list`, 35 ACTIVE)
--    e o job levava 404 12x por hora. Quem alimenta autorizacoes_assim
--    e o robo do relatorio, que esta vivo (358 linhas/24h).
--
-- 2. Da timeout_milliseconds := 120000 as 6 fn_sync_tita_* que nao
--    passavam nada e por isso caiam no default de 5000 ms do pg_net,
--    gravando status_code NULL / timed_out = true. Mesmo valor que
--    fn_sync_tita_grade e os snapshots ja usam.
--
-- Testado no Postgres local, 7 assercoes (job morto sai, os outros
-- ficam, as 6 ganham timeout, fn_sync_tita_grade preservada, guard do
-- Vault intacto e sem chave, executam, aplicavel 2x).
-- ============================================================

begin;

-- Higiene do cron: aposenta um job que chama function inexistente e dá às
-- fn_sync_tita_* o timeout que só a fn_sync_tita_grade tinha.
--
-- Nada aqui tem a ver com a rotação da chave (20260814100000 fechou isso).
-- São dois defeitos antigos que ficaram visíveis quando fomos conferir o
-- resultado da rotação em net._http_response.

-- ---------------------------------------------------------------------------
-- 1. sync_assim_status_5min: 404 a cada 5 minutos
-- ---------------------------------------------------------------------------
-- O job chama https://<projeto>.supabase.co/functions/v1/sync_assim_status.
-- Essa Edge Function NÃO EXISTE: não está no repo e não aparece em
-- `supabase functions list` (verificado 2026-08-14, 35 functions ACTIVE).
--
-- Evidência de que já era assim antes da rotação: net._http_response mostrava
-- 12 respostas 404 por hora, constante, em todas as horas dentro da retenção do
-- pg_net (~6h) — muito antes de 20260814100000 ser aplicada. E um token errado
-- daria 401, não 404; 404 é a URL, que a reescrita não tocou.
--
-- Por que é seguro aposentar: quem alimenta autorizacoes_assim é o robô do
-- relatório, e ele está vivo (358 linhas nas últimas 24h, última atualização
-- minutos antes da verificação). A função SQL sync_assim_results(), no cron
-- 'sync-assim-results', não ingere nada — só reconcilia
-- (UPDATE fila_autorizacoes a partir de vw_match_autorizacoes_assim). Ou seja,
-- este job não era o caminho dos dados; era 12 requisições/hora para o vazio,
-- cada uma gravando uma linha em net._http_response.
--
-- Reversível: se a function um dia for deployada, reagendar é um cron.schedule.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_assim_status_5min') THEN
    PERFORM cron.unschedule('sync_assim_status_5min');
    RAISE NOTICE 'job sync_assim_status_5min aposentado';
  ELSE
    -- cron.unschedule estoura se o job não existe; isto mantém a migration
    -- aplicável duas vezes.
    RAISE NOTICE 'job sync_assim_status_5min ja nao existe';
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. timeout_milliseconds nas fn_sync_tita_*
-- ---------------------------------------------------------------------------
-- fn_sync_tita_grade passa timeout_milliseconds := 120000; as outras seis não
-- passam nada, e aí vale o default do pg_net: 5000 ms. O sync do TiTa demora
-- mais que isso, então o pg_net desiste de esperar e grava a linha com
-- status_code NULL e timed_out = true. A requisição foi enviada e a Edge
-- Function provavelmente roda até o fim — mas ninguém fica sabendo se deu
-- certo, o que é a mesma cegueira que 20260814100000 veio combater.
--
-- 120000 é o valor já estabelecido no projeto: fn_sync_tita_grade,
-- fn_sync_grade_csv_em_lotes, fn_sync_grade_execucao_em_lotes e os dois
-- snapshots de previsão usam 120000. (sync-orbita-agenda usa 60000, mas ali o
-- número é justificado no comentário da própria migration.)
--
-- Só o timeout muda. Corpo, URL, horários e a leitura do Vault vêm iguais a
-- 20260814100000.

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
        body    := jsonb_build_object('data', d::text),
        timeout_milliseconds := 120000
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
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
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
        body    := jsonb_build_object('data', d::text),
        timeout_milliseconds := 120000
      );
    END IF;
    d := d + 1;
  END LOOP;
END;
$function$;

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
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
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
    ),
    timeout_milliseconds := 120000
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
    ),
    timeout_milliseconds := 120000
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- NOTA: os jobs sync_tita_agenda e sync-grade-profissionais-hora
-- ---------------------------------------------------------------------------
-- Esses dois chamam net.http_post direto no cron.job.command, sem passar por
-- função, e (a julgar pelo comando de sync_assim_status_5min, que era do mesmo
-- lote criado pelo dashboard) provavelmente também não passam
-- timeout_milliseconds — as duas respostas com timed_out = true às 16:00:00 são
-- compatíveis com sync-grade-profissionais-hora, que roda de hora em hora e
-- chama sync-terapeutas-tita (function que EXISTE e está ACTIVE, então não é
-- 404, é timeout mesmo).
--
-- Ficam de fora porque injetar um parâmetro novo numa chamada é bem mais
-- arriscado que trocar um literal, e o texto exato dos dois comandos não está
-- em migration nenhuma. Agora que a chave saiu deles, o comando pode ser lido
-- e colado sem vazar segredo:
--
--   select jobname, command from cron.job
--    where jobname in ('sync_tita_agenda','sync-grade-profissionais-hora');

-- ============================================================
-- Livro-caixa
-- ============================================================
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260814100200','cron_higiene_404_e_timeout')
on conflict (version) do nothing;

commit;

-- ============================================================
-- Conferencia  (rodar depois do commit, uma por vez)
-- ============================================================

-- 1. As 6 funcoes passam timeout. Esperado: 6 linhas, todas true.
select p.proname, p.prosrc like '%timeout_milliseconds := 120000%' as tem_timeout
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('fn_sync_tita_operacional','fn_sync_tita_planejamento',
                     'fn_sync_tita_reconciliacao','fn_sync_tita_semana',
                     'fn_sync_tita_hoje','fn_sync_tita_grade_hoje')
 order by 1;

-- 2. O job morto sumiu. Esperado: 0 linhas.
select jobname from cron.job where jobname = 'sync_assim_status_5min';

-- 3. 17 jobs restantes (18 - 1).
select count(*) as jobs from cron.job;

-- 4. Daqui a ~1h: os 404 pararam. Esperado: nenhuma linha com 404.
select status_code, count(*) as respostas, max(created) as mais_recente
  from net._http_response
 where created > now() - interval '20 minutes'
 group by 1 order by 1;

-- 5. Falta resolver os 2 jobs que chamam net.http_post direto no comando.
--    Agora que a chave saiu deles, o comando pode ser lido sem vazar segredo.
select jobname, command from cron.job
 where jobname in ('sync_tita_agenda','sync-grade-profissionais-hora')
 order by jobname;
