-- ITEM 1 — Reativa a sincronização Órbita → agenda_orbita (versionada).
--
-- Contexto: a sincronização do Órbita rodava por um cron+função `sync-agenda-v2`
-- criados MANUALMENTE no banco (fora do repositório). A função foi removida por
-- volta de 08/05/2026 (passou a responder 404), congelando `agenda_orbita` e, com
-- ela, a resolução de CRM/nome_medico. Resultado: o robô trava no campo do CRM
-- (item 1) para pacientes novos/alterados depois de 08/05, exigindo conclusão
-- manual. Confirmado: o desligamento foi acidental e a API do Órbita segue no ar.
--
-- Correção: a função `sync` do repo (mesma origem Órbita, endpoints `pacientes` e
-- `agenda/detalhe`) foi adaptada para aceitar chamada com role `service_role`
-- (além do JWT de usuário do frontend). Aqui removemos o cron morto e agendamos a
-- chamada versionada a /functions/v1/sync usando o secret do Vault
-- (`cron_service_role_key`, mesmo padrão do cron sync-reposicao-faltas) — sem JWT
-- hardcoded em texto puro.

-- 1) Remove o cron morto sync-agenda-v2 (se existir)
do $$
begin
  perform cron.unschedule('sync-agenda-v2');
exception when others then
  raise notice 'cron sync-agenda-v2 inexistente ou já removido';
end $$;

-- 2) Idempotência: remove agendamento anterior com o novo nome, se houver
do $$
begin
  perform cron.unschedule('sync-orbita-agenda');
exception when others then
  null;
end $$;

-- 3) Agenda a sincronização do Órbita 2x/dia em dias úteis
--    (11:00 e 17:00 UTC = 08:00 e 14:00 BRT). Ajustar a cadência se necessário.
-- timeout_milliseconds = 60000: a sync varre todos os pacientes (~14s hoje) e o
-- padrão do pg_net (5s) marcaria "timeout" mesmo com a função concluindo. 60s dá
-- margem e faz o net._http_response registrar o 200 real.
select cron.schedule(
  'sync-orbita-agenda',
  '0 11,17 * * 1-5',
  $cron$
    select net.http_post(
      url                  := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync',
      headers              := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
        'Content-Type',  'application/json'
      ),
      body                 := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
