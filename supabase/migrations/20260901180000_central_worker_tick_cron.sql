-- ============================================================================
-- Rede de segurança do worker da Central de Atendimento
--
-- O QUE ESTA MIGRATION É, E O QUE ELA NÃO É
--
-- Ela NÃO é o gatilho principal da atendente. Quem acorda o worker no caminho
-- normal é o próprio webhook: depois de enfileirar a mensagem, a rota agenda o
-- despacho para quando a janela de debounce fechar (~16s) — ver
-- frontend/lib/central/despachar-worker.ts.
--
-- Esta migration cobre o que aquele caminho não cobre:
--
--   • o container reiniciou entre a entrega da Meta e o despacho (o timer vive
--     na memória do processo Node e morre com ele);
--   • o despacho falhou por erro transitório e engoliu a exceção de propósito;
--   • um item voltou para a fila com `process_after` no futuro (rate limit da
--     OpenAI, por exemplo) e não há entrega nova da Meta para acordá-lo.
--
-- Sem ela, nesses três casos a mensagem do responsável fica na fila para sempre,
-- em silêncio. É exatamente o tipo de falha que ninguém percebe até alguém
-- reclamar que "mandei mensagem e não responderam".
--
-- POR QUE 1 MINUTO E NÃO 10 SEGUNDOS
--
-- O plano original previa 10s, quando o cron era o ÚNICO gatilho e sua latência
-- entrava na frente de cada resposta. Com o despacho pós-webhook, o cron deixa
-- de estar no caminho comum: ele só pega o que escapou. A 10s seriam 8.640
-- chamadas por dia, quase todas para descobrir que a fila está vazia; a 1 min
-- são 1.440, e o pior caso vira "um minuto de atraso numa mensagem que já tinha
-- caído num buraco" — não "todo mundo espera 5 segundos a mais".
--
-- Trocar isso por 10s de novo é uma linha, se algum dia o despacho pós-webhook
-- deixar de existir.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensões
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Configuração — linha única
--
-- No estilo de glosa_avisos_config: a URL do Coolify e o liga/desliga vivem em
-- tabela, não no corpo da função. Trocar o endereço (ou pausar a atendente numa
-- emergência) passa a ser um UPDATE, não uma migration nova.
--
-- O SEGREDO DO WORKER NÃO ENTRA AQUI. Ele fica no Vault, pela mesma decisão já
-- tomada para a service_role do cron: credencial em texto puro numa tabela é
-- legível por quem tem acesso ao banco.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS central.worker_tick_config (
  id          boolean     PRIMARY KEY DEFAULT true CHECK (id),
  url         text        NOT NULL,
  ativo       boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  central.worker_tick_config IS
  'Configuração do tique de segurança dos workers. Linha única (id=true).';
COMMENT ON COLUMN central.worker_tick_config.url IS
  'URL absoluta de POST /api/central/workers/tick no Coolify. COM barra final: sem ela o Next responde 308 e o pg_net não segue redirect.';
COMMENT ON COLUMN central.worker_tick_config.ativo IS
  'Interruptor. false pausa a rede de segurança sem desagendar o cron — o caminho normal (despacho pós-webhook) continua funcionando.';

INSERT INTO central.worker_tick_config (id, url)
VALUES (true, 'https://orbitaautomacao.com.br/api/central/workers/tick/')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Disparador
--
-- `SET search_path` declarado DENTRO da função, não por ALTER FUNCTION: um
-- CREATE OR REPLACE posterior descarta proconfig posto por fora, e o efeito
-- morre calado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_central_worker_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, central, vault
AS $$
DECLARE
  _url      text;
  _segredo  text;
  _pendente integer;
BEGIN
  SELECT url INTO _url
    FROM central.worker_tick_config
   WHERE id = true AND ativo = true;

  IF _url IS NULL THEN
    RETURN;   -- desligado de propósito, ou nunca configurado
  END IF;

  -- Guard de fila vazia: no caminho feliz o despacho pós-webhook já drenou
  -- tudo, e a rede de segurança não tem nada a fazer. Contar é barato (índice
  -- idx_grouping_org_process_after); acordar o Coolify à toa, não.
  SELECT count(*) INTO _pendente
    FROM central.message_grouping_queue
   WHERE status = 'pending' AND process_after <= now();

  IF _pendente = 0 THEN
    SELECT count(*) INTO _pendente
      FROM central.send_queue
     WHERE status = 'pending' AND scheduled_at <= now();
  END IF;

  IF _pendente = 0 THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _segredo
    FROM vault.decrypted_secrets WHERE name = 'central_worker_secret';

  IF _segredo IS NULL THEN
    RAISE EXCEPTION 'fn_central_worker_tick: segredo central_worker_secret ausente no Vault';
  END IF;

  -- net.http_post é ASSÍNCRONO e fire-and-forget: enfileira em
  -- net.http_request_queue e volta na hora. Ninguém lê esta resposta — se o
  -- Coolify estiver fora do ar, o sintoma aparece em net._http_response, não
  -- aqui. Por isso não há tratamento de retorno.
  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'x-worker-secret', _segredo,
      'Content-Type',    'application/json'
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 55000   -- abaixo do maxDuration=60 da rota
  );
END;
$$;

COMMENT ON FUNCTION public.fn_central_worker_tick() IS
  'Rede de segurança: chama POST /api/central/workers/tick quando há item pendente. O gatilho normal é o despacho pós-webhook. Agendada em central-worker-tick.';

-- Revoga o EXECUTE que o PostgreSQL concede a PUBLIC por padrão: esta função é
-- SECURITY DEFINER e lê o Vault.
REVOKE EXECUTE ON FUNCTION public.fn_central_worker_tick() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Agendamento
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('central-worker-tick');
EXCEPTION WHEN OTHERS THEN
  NULL;   -- não existia; primeira aplicação
END $$;

-- Todo minuto, o dia inteiro. Diferente do aviso de glosa (que respeita horário
-- comercial), aqui não há janela: se um responsável escreve às 22h e a mensagem
-- cai num buraco, ela precisa ser recuperada — mesmo que a resposta só saia
-- quando alguém ler.
SELECT cron.schedule(
  'central-worker-tick',
  '* * * * *',
  $cron$SELECT public.fn_central_worker_tick()$cron$
);

-- ============================================================================
-- ANTES DE APLICAR: o segredo precisa existir no Vault, com o MESMO valor de
-- CENTRAL_WORKER_SECRET no Coolify. Sem isso a função levanta exceção a cada
-- minuto e o cron acumula falha.
--
--   SELECT vault.create_secret(
--     '<mesmo valor de CENTRAL_WORKER_SECRET>',
--     'central_worker_secret',
--     'Segredo do tique dos workers da Central'
--   );
--
-- CONFERÊNCIA depois de aplicar:
--
--   SELECT * FROM cron.job WHERE jobname = 'central-worker-tick';
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'central-worker-tick')
--    ORDER BY start_time DESC LIMIT 5;
--
-- E o que o Coolify respondeu de fato (o cron não enxerga isto):
--
--   SELECT status_code, content, created FROM net._http_response
--    ORDER BY created DESC LIMIT 5;
-- ============================================================================
