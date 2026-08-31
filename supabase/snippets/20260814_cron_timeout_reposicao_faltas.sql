-- ============================================================
-- Ultimo job sem timeout: sync-reposicao-faltas  (2026-08-14)
--
-- Aplicar no SQL Editor. Achado pela conferencia 1 de
-- 20260814_cron_timeout_nos_dois_jobs.sql.
--
-- Ele escapou das migrations anteriores porque nao guardava a chave
-- embutida -- ja lia do Vault desde 20260724180000. Mas aquela migration
-- tambem nao passou timeout_milliseconds, entao ele herdou o default de
-- 5000 ms do pg_net e cai no mesmo modo cego: a Edge Function roda, a
-- resposta e descartada com status_code NULL / timed_out = true, e o
-- pg_cron marca sucesso. Roda '43 5 * * 1-5', fora de qualquer janela
-- que olhamos em net._http_response.
--
-- Testado no Postgres local, 7 assercoes: timeout aplicado,
-- jobid/horario/estado preservados, segue lendo do Vault sem chave,
-- URL e headers preservados, o comando executa, aplicavel 2x (a 2a
-- passada detecta o timeout e nao mexe), e o guard aborta se o comando
-- em producao divergir do esperado.
-- ============================================================

begin;

-- Último job sem timeout_milliseconds: sync-reposicao-faltas.
--
-- POR QUE FICOU PARA TRÁS
-- 20260814100200 e 20260814100300 trataram os jobs e funções que guardavam a
-- chave embutida. Este não guardava: já lia do Vault desde 20260724180000. Só
-- que aquela migration também não passou timeout_milliseconds — então ele
-- herdou o default de 5000 ms do pg_net, e cai no mesmo modo cego: a Edge
-- Function roda, a resposta é descartada com status_code NULL e
-- timed_out = true, e o pg_cron marca o job como sucesso.
--
-- Não apareceu nas verificações de net._http_response porque roda '43 5 * * 1-5'
-- — fora de qualquer janela que olhamos. Foi a conferência 1 de
-- 20260814_cron_timeout_nos_dois_jobs.sql que o encontrou.
--
-- O outro job daquela migration, sync-grade-csv-daily, não precisa: passou a
-- chamar fn_sync_grade_csv_em_lotes() (20260728120000), que já tem o timeout.
--
-- O comando abaixo é o de 20260724180000, que é a última escrita conhecida
-- deste job, com a única adição de timeout_milliseconds := 120000. O guard
-- confirma que o que está em produção ainda é esse — se alguém tiver mexido
-- pelo dashboard, a migration aborta em vez de sobrescrever cegamente.

DO $do$
DECLARE
  v_jobid   bigint;
  v_command text;
BEGIN
  SELECT jobid, command INTO v_jobid, v_command
    FROM cron.job WHERE jobname = 'sync-reposicao-faltas';

  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'job sync-reposicao-faltas nao encontrado';
  END IF;

  -- Idempotência: se já tem o timeout, nada a fazer.
  IF v_command LIKE '%timeout_milliseconds%' THEN
    RAISE NOTICE 'job sync-reposicao-faltas ja tem timeout; nada a fazer';
    RETURN;
  END IF;

  -- Guard: o comando em produção tem que ser o que esta migration espera.
  IF v_command NOT LIKE '%/functions/v1/sync-reposicao-faltas%'
     OR v_command NOT LIKE '%vault.decrypted_secrets%' THEN
    RAISE EXCEPTION
      'comando de sync-reposicao-faltas nao e o esperado (URL ou leitura do Vault ausente); revise antes de sobrescrever';
  END IF;

  PERFORM cron.alter_job(v_jobid, command := $cmd$
  SELECT net.http_post(
    url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-reposicao-faltas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$);

  RAISE NOTICE 'job sync-reposicao-faltas: timeout 120000 aplicado';
END
$do$;

-- ============================================================
-- Livro-caixa
-- ============================================================
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260814100400','cron_timeout_reposicao_faltas')
on conflict (version) do nothing;

commit;

-- ============================================================
-- Conferencia  (rodar depois do commit)
-- ============================================================

-- 1. Varredura final: nada que faca http fica sem timeout.
--    Esperado: 0 linhas nas duas metades.
select 'job'      as tipo, jobname as nome from cron.job
 where command like '%net.http_post%' and command not like '%timeout_milliseconds%'
union all
select 'funcao'   as tipo, p.proname     from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc like '%net.http_post%'
   and p.prosrc not like '%timeout_milliseconds%';

-- 2. Varredura final: a chave nao esta em lugar nenhum do banco.
--    Esperado: 0 linhas nas duas metades.
select 'job'    as tipo, jobname as nome from cron.job
 where command like '%eyJhbGciOiJIUzI1NiIs%'
union all
select 'funcao' as tipo, p.proname       from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosrc like '%eyJhbGciOiJIUzI1NiIs%';

-- 3. O job, com horario e estado intactos.
select jobname, schedule, active,
       command like '%timeout_milliseconds := 120000%' as tem_timeout,
       command like '%vault.decrypted_secrets%'        as le_do_vault
  from cron.job where jobname = 'sync-reposicao-faltas';
