-- ============================================================================
-- Segredo do tique dos workers no Vault
--
-- RODAR ANTES da migration 20260901180000_central_worker_tick_cron.sql.
--
-- A função fn_central_worker_tick() lê este segredo para chamar
-- POST /api/central/workers/tick no Coolify. Sem ele, ela levanta exceção a
-- cada minuto e o cron acumula falha (visível em cron.job_run_details).
--
-- O VALOR TEM QUE SER IDÊNTICO ao CENTRAL_WORKER_SECRET configurado no Coolify
-- (Environment Variables, "Available at Runtime"). A rota compara os dois com
-- timingSafeEqual; um espaço a mais de um lado e todo tique responde 401 — sem
-- corpo e sem pista, de propósito.
--
-- Por que no Vault e não numa coluna: a mesma decisão já tomada para
-- cron_service_role_key. Credencial em texto puro numa tabela é legível por
-- quem tem acesso ao banco, e esta credencial faz a atendente falar com
-- pacientes.
-- ============================================================================

-- 1. Criar o segredo. Substitua o primeiro argumento pelo valor real.
select vault.create_secret(
  'COLE_AQUI_O_MESMO_VALOR_DE_CENTRAL_WORKER_SECRET',
  'central_worker_secret',
  'Segredo do tique dos workers da Central de Atendimento'
);

-- 2. Conferir que gravou (mostra só o nome, nunca o valor).
select name, description, created_at
  from vault.secrets
 where name = 'central_worker_secret';

-- ----------------------------------------------------------------------------
-- SE PRECISAR TROCAR o valor depois (rotação, ou erro de digitação):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'central_worker_secret'),
--     'NOVO_VALOR'
--   );
--
-- Trocar aqui exige trocar no Coolify no mesmo movimento — os dois lados são
-- comparados byte a byte.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- DEPOIS de aplicar a migration, conferir que o cron está de pé:
--
--   select jobname, schedule, active from cron.job
--    where jobname = 'central-worker-tick';
--
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'central-worker-tick')
--    order by start_time desc limit 5;
--
-- E o que o Coolify respondeu (o cron é fire-and-forget e não enxerga isto):
--
--   select status_code, content, created
--     from net._http_response order by created desc limit 5;
--
-- 200 com {"ok":true,...} = funcionando.
-- 401 = o valor daqui e o do Coolify não batem.
-- Nada em net._http_response = a função nem chegou a disparar (provavelmente o
-- guard de fila vazia, que é o comportamento normal quando não há pendência).
-- ----------------------------------------------------------------------------
