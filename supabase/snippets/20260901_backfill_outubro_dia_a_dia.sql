-- ============================================================================
-- Backfill de OUTUBRO/2026 — UM DIA POR CHAMADA
-- ----------------------------------------------------------------------------
-- Terceira tentativa, e a mais leve possível. O histórico importa para entender
-- por que este formato:
--
--   1. Blocos de 7 dias, esperando resposta -> SQL Editor caiu (8-15 min de
--      comando). Antes disso, um bloco já tinha morrido com
--      546 WORKER_RESOURCE_LIMIT (id 3678): o servidor de Edge Functions ficou
--      sem compute com blocos grandes.
--   2. Blocos de 4 dias, esperando resposta -> SQL Editor caiu de novo.
--      Conferência confirmou: outubro em ZERO, nada tinha avançado.
--
-- Duas causas independentes, e este arquivo ataca as duas:
--
--   • COMANDO CURTO. `net.http_post` é assíncrono: enfileira e retorna na hora.
--     A espera com pg_sleep era conveniência, não necessidade — é ela que fazia
--     o comando durar minutos e o navegador desistir. Cada linha abaixo volta em
--     menos de 1 segundo. O trabalho acontece no servidor, em background.
--
--   • CARGA MÍNIMA POR CHAMADA. Um único dia por chamada (~700-950 sessões) em
--     vez de 4 ou 7 dias. É a menor unidade que a Edge Function aceita, e a que
--     tem menos chance de esbarrar no limite de compute.
--
-- Fim de semana não entra: a clínica não atende, e setembro confirma (nenhum
-- sábado ou domingo tem linha). São 22 dias úteis, não 31.
--
-- A ORDEM não é cronológica de propósito: 05 a 09/10 — a semana que a diretoria
-- precisa ver — vem primeiro. Depois de 5 chamadas a página já responde; o
-- resto de outubro completa em seguida.
--
-- ─── Como usar ──────────────────────────────────────────────────────────────
--
--   • Rode de 3 a 5 linhas por vez (selecione e execute). Espere ~1 min entre
--     as levas: é o que evita o 546 que derrubou a primeira tentativa.
--   • Depois das 5 primeiras, rode a CONFERÊNCIA lá no fim e já abra a página.
--   • Se algum dia não entrar, rode aquela linha de novo. É idempotente: o sync
--     não faz DELETE e linha inalterada não gera escrita.
--   • Para conferir o que cada chamada respondeu, use a query "O QUE AS CHAMADAS
--     RESPONDERAM" no fim (2-3 min depois de disparar).
-- ============================================================================


-- 1/22  2026-10-05 (seg)  <-- semana da diretoria
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-05', 'data_fim', '2026-10-05'),
  timeout_milliseconds := 150000);

-- 2/22  2026-10-06 (ter)  <-- semana da diretoria
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-06', 'data_fim', '2026-10-06'),
  timeout_milliseconds := 150000);

-- 3/22  2026-10-07 (qua)  <-- semana da diretoria
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-07', 'data_fim', '2026-10-07'),
  timeout_milliseconds := 150000);

-- 4/22  2026-10-08 (qui)  <-- semana da diretoria
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-08', 'data_fim', '2026-10-08'),
  timeout_milliseconds := 150000);

-- 5/22  2026-10-09 (sex)  <-- semana da diretoria
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-09', 'data_fim', '2026-10-09'),
  timeout_milliseconds := 150000);

-- 6/22  2026-10-01 (qui)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-01', 'data_fim', '2026-10-01'),
  timeout_milliseconds := 150000);

-- 7/22  2026-10-02 (sex)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-02', 'data_fim', '2026-10-02'),
  timeout_milliseconds := 150000);

-- 8/22  2026-10-12 (seg)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-12', 'data_fim', '2026-10-12'),
  timeout_milliseconds := 150000);

-- 9/22  2026-10-13 (ter)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-13', 'data_fim', '2026-10-13'),
  timeout_milliseconds := 150000);

-- 10/22  2026-10-14 (qua)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-14', 'data_fim', '2026-10-14'),
  timeout_milliseconds := 150000);

-- 11/22  2026-10-15 (qui)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-15', 'data_fim', '2026-10-15'),
  timeout_milliseconds := 150000);

-- 12/22  2026-10-16 (sex)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-16', 'data_fim', '2026-10-16'),
  timeout_milliseconds := 150000);

-- 13/22  2026-10-19 (seg)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-19', 'data_fim', '2026-10-19'),
  timeout_milliseconds := 150000);

-- 14/22  2026-10-20 (ter)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-20', 'data_fim', '2026-10-20'),
  timeout_milliseconds := 150000);

-- 15/22  2026-10-21 (qua)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-21', 'data_fim', '2026-10-21'),
  timeout_milliseconds := 150000);

-- 16/22  2026-10-22 (qui)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-22', 'data_fim', '2026-10-22'),
  timeout_milliseconds := 150000);

-- 17/22  2026-10-23 (sex)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-23', 'data_fim', '2026-10-23'),
  timeout_milliseconds := 150000);

-- 18/22  2026-10-26 (seg)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-26', 'data_fim', '2026-10-26'),
  timeout_milliseconds := 150000);

-- 19/22  2026-10-27 (ter)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-27', 'data_fim', '2026-10-27'),
  timeout_milliseconds := 150000);

-- 20/22  2026-10-28 (qua)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-28', 'data_fim', '2026-10-28'),
  timeout_milliseconds := 150000);

-- 21/22  2026-10-29 (qui)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-29', 'data_fim', '2026-10-29'),
  timeout_milliseconds := 150000);

-- 22/22  2026-10-30 (sex)
select net.http_post(
  url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
    'Content-Type',  'application/json'),
  body    := jsonb_build_object('data_inicio', '2026-10-30', 'data_fim', '2026-10-30'),
  timeout_milliseconds := 150000);


-- ─── O QUE AS CHAMADAS RESPONDERAM ──────────────────────────────────────────
-- Rode 2-3 min depois de disparar uma leva. Espere status_code 200 com corpo
-- {"ok":true,...,"inseridos":N}. Se vier 546 (WORKER_RESOURCE_LIMIT), espere
-- alguns minutos e repita as linhas daqueles dias.
select id, status_code, left(coalesce(content,''), 300) as corpo, error_msg, created
from net._http_response
where created > now() - interval '30 minutes'
order by id desc
limit 30;


-- ─── CONFERÊNCIA ────────────────────────────────────────────────────────────
-- A fonte da verdade, independente do que a tela mostrou.
-- Ao fim de tudo: 22 dias, ~15 a 20 mil sessões.
select
  count(distinct data)          as dias_com_grade,
  count(*) filter (where ativo) as sessoes_ativas,
  min(data)                     as primeiro_dia,
  max(data)                     as ultimo_dia
from public.csv_grades_profissionais
where data >= date '2026-10-01' and data <= date '2026-10-31';


-- A semana da diretoria, isolada. É esta que precisa responder primeiro.
select data, count(*) filter (where ativo) as ativas, max(visto_em) as ultimo_visto
from public.csv_grades_profissionais
where data between date '2026-10-05' and date '2026-10-09'
group by data order by data;


-- Detalhe dia a dia: mostra exatamente QUAIS dias faltam, se faltarem.
select data, count(*) filter (where ativo) as ativas, max(visto_em) as ultimo_visto
from public.csv_grades_profissionais
where data >= date '2026-10-01' and data <= date '2026-10-31'
group by data order by data;
