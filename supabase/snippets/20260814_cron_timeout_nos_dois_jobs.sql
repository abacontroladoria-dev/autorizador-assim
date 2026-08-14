-- ============================================================
-- timeout_milliseconds nos 2 jobs que chamam net.http_post
-- direto no comando  (2026-08-14)
--
-- Aplicar no SQL Editor. Fecha o que 20260814100200 deixou de fora:
-- sync_tita_agenda e sync-grade-profissionais-hora nao passam por
-- funcao, o net.http_post esta no proprio cron.job.command, e sem o
-- parametro vale o default do pg_net (5000 ms) -- a Edge Function roda
-- mas a resposta e descartada com status_code NULL / timed_out = true.
--
-- Os comandos abaixo sao os que estao em producao (lidos de cron.job
-- depois de 20260814100000 ja ter trocado a chave pela leitura do
-- Vault). URL, headers, corpo e horario iguais; a UNICA adicao e o
-- timeout. Usa cron.alter_job, que preserva jobid, horario e o estado
-- ativo -- cron.schedule recriaria o job.
--
-- Testado no Postgres local, 8 assercoes: os 2 ganham o timeout,
-- jobid/horario/estado preservados, job alheio intacto, seguem lendo do
-- Vault sem chave, headers preservados exatamente (Content-Type presente
-- no primeiro e ausente no segundo, como em producao), os comandos
-- executam, aplicavel 2x, e aborta se um job nao existir.
-- ============================================================

begin;

-- Fecha o timeout nos 2 jobs que chamam net.http_post direto no comando.
--
-- POR QUE
-- 20260814100200 deu timeout_milliseconds := 120000 às 6 fn_sync_tita_*, mas
-- estes dois não passam por função nenhuma: o net.http_post está no próprio
-- cron.job.command, e eles foram criados pelo dashboard, então não existiam em
-- migration alguma. Sem o parâmetro, vale o default do pg_net (5000 ms): a
-- requisição é enviada, a Edge Function roda, e a resposta é descartada com
-- status_code NULL e timed_out = true. As duas respostas assim das 16:00:00 de
-- 2026-08-14 são deste lote — sync-grade-profissionais-hora roda '0 * * * 1-5'.
--
-- O texto de cada comando foi lido de cron.job depois de 20260814100000, que já
-- havia trocado a chave embutida pela leitura do Vault — é por isso que o
-- Authorization abaixo já vem do vault.decrypted_secrets. URL, headers, corpo e
-- horário são os que estão em produção; a ÚNICA adição é o timeout.
--
-- 120000 é o valor estabelecido no projeto (fn_sync_tita_grade,
-- fn_sync_grade_csv_em_lotes, fn_sync_grade_execucao_em_lotes, os dois
-- snapshots de previsão e agora as 6 fn_sync_tita_*).
--
-- Usa cron.alter_job em vez de cron.schedule: altera só o comando, preservando
-- jobid, horário e o estado ativo. cron.schedule recriaria o job e reativaria
-- um que estivesse desligado.
--
-- NOTA sobre sync-grade-profissionais-hora: ele passa headers com APENAS
-- Authorization, o que substitui o default do pg_net e portanto omite o
-- Content-Type. Mantido como está — vem funcionando assim, o corpo é o '{}'
-- default e Deno parseia sem o header. Acrescentá-lo seria mudança de
-- comportamento fora do escopo deste arquivo.

DO $do$
DECLARE
  v_jobid bigint;
BEGIN
  -- ---------------------------------------------------------------------
  -- sync_tita_agenda  ('0 10,13,16,19 * * 1-5')
  -- ---------------------------------------------------------------------
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync_tita_agenda';
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'job sync_tita_agenda nao encontrado';
  END IF;

  PERFORM cron.alter_job(v_jobid, command := $cmd$
    select net.http_post(
      url := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync_tita_agenda',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
        'Content-Type',
        'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cmd$);
  RAISE NOTICE 'job sync_tita_agenda: timeout 120000 aplicado';

  -- ---------------------------------------------------------------------
  -- sync-grade-profissionais-hora  ('0 * * * 1-5')
  -- ---------------------------------------------------------------------
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync-grade-profissionais-hora';
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'job sync-grade-profissionais-hora nao encontrado';
  END IF;

  PERFORM cron.alter_job(v_jobid, command := $cmd$
    select net.http_post(
      url := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-terapeutas-tita',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
      ),
      timeout_milliseconds := 120000
    );
  $cmd$);
  RAISE NOTICE 'job sync-grade-profissionais-hora: timeout 120000 aplicado';
END
$do$;

-- ============================================================
-- Livro-caixa
-- ============================================================
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260814100300','cron_timeout_nos_dois_jobs')
on conflict (version) do nothing;

commit;

-- ============================================================
-- Conferencia  (rodar depois do commit)
-- ============================================================

-- 1. Nenhum job com net.http_post no comando ficou sem timeout.
--    Esperado: 0 linhas.
select jobname
  from cron.job
 where command like '%net.http_post%'
   and command not like '%timeout_milliseconds%';

-- 2. Nenhuma funcao com net.http_post ficou sem timeout.
--    Esperado: 0 linhas. (fn_alertas_* e sync_assim_results nao fazem http,
--    entao nao aparecem aqui.)
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc like '%net.http_post%'
   and p.prosrc not like '%timeout_milliseconds%';

-- 3. Os 2 jobs, com horario e estado intactos.
select jobname, schedule, active,
       command like '%timeout_milliseconds := 120000%' as tem_timeout,
       command like '%vault.decrypted_secrets%'        as le_do_vault
  from cron.job
 where jobname in ('sync_tita_agenda','sync-grade-profissionais-hora')
 order by jobname;

-- 4. Depois do proximo ciclo de hora cheia: acabaram os timed_out.
--    Esperado: nenhuma linha com timed_out = true.
select status_code, timed_out, count(*) as respostas, max(created) as mais_recente
  from net._http_response
 where created > now() - interval '90 minutes'
 group by 1, 2 order by 1 nulls last;
