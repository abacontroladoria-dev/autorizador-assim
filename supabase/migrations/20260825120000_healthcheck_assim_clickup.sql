-- =============================================================================
-- O aviso de "ASSIM fora do ar" volta a existir — agora no ClickUp e no sino
-- =============================================================================
-- O robô da geração anterior avisava quando o portal do Autorizador da ASSIM
-- caía, e avisava de novo quando voltava. Esse código nunca esteve neste
-- repositório: ele vive em `projeto_automacao/robo-assim/robo-v3.3.js`
-- (linhas 723-754) e nunca foi portado para o `robo-autorizador`. Como o destino
-- era um webhook do Slack, que saiu de uso, o aviso simplesmente parou de
-- existir. Hoje a queda da ASSIM é descoberta pela recepção tentando usar o
-- sistema.
--
-- O ORIGINAL, EM TRÊS PARTES
--   1. `page.goto` na tela de login, timeout 15s, 3 tentativas com 5s entre elas.
--   2. Estado anterior lido de um Google Apps Script, para o aviso ser disparado
--      por TRANSIÇÃO e não a cada checagem.
--   3. POST no incoming webhook do Slack.
--
-- POR QUE ISTO NÃO VAI PARA DENTRO DO WORKER
-- O robô antigo era UM processo disparado à mão. O `robo-autorizador` de hoje
-- roda em 11 máquinas ao mesmo tempo. A verificação dentro do worker significaria
-- 11 mensagens iguais por queda — ou um trava-dedup no banco, que é exatamente o
-- que esta migration constrói de qualquer forma. E significaria distribuir o
-- token do ClickUp para 11 PCs, por um instalador Inno, num repositório PÚBLICO.
--
-- Então a sonda é central: uma Edge Function agendada por pg_cron. Um aviso por
-- queda, o segredo só no Supabase, e funciona mesmo com todos os robôs
-- desligados. Que uma sonda na nuvem enxerga o portal já estava provado — o robô
-- antigo rodava em runner do GitHub Actions.
--
-- OS TRÊS BUGS DO ORIGINAL QUE MORREM AQUI
--   * FALSO "FORA DO AR". Quando o Apps Script não respondia, `obterStatusRemoto`
--     devolvia "desconhecido", e o teste `statusAnterior !== "offline"` anunciava
--     uma queda com o portal no ar. Aqui o estado é uma linha do Postgres, lida e
--     escrita na MESMA transação da decisão, com FOR UPDATE.
--   * URL MORTA. O original aponta para sirius.assim.com.br/assimcsp/... O portal
--     mudou. A URL passa a vir de `robo_config.assim_login_url`, que é a mesma que
--     o robô usa para logar — uma fonte só, e ela se mantém sozinha.
--   * COMPARAÇÃO ASSIMÉTRICA. A queda disparava com `!==` e a volta com `===`.
--     Agora as duas pontas são a mesma comparação de transição.
--
-- A DECISÃO DE DESENHO QUE IMPORTA: A TRANSIÇÃO É DECIDIDA EM SQL
-- Quem decide se houve queda ou volta é `fn_assim_healthcheck_registrar`, numa
-- transação só, com FOR UPDATE na linha única. Não é preciosismo: o pg_cron pode
-- sobrepor execuções se uma demorar, e a Edge Function também é invocável à mão.
-- Com a decisão no cliente, duas execuções concorrentes anunciariam a mesma queda
-- duas vezes. Com ela aqui, a segunda lê o estado já virado e não tem transição
-- nenhuma para anunciar.
--
-- E O TEXTO DA MENSAGEM NÃO ESTÁ AQUI
-- A RPC devolve o FATO (transicao, desde, duração, motivo); quem escreve a frase
-- é a Edge Function. É a mesma disciplina de 20260824050000: o SQL guarda o dado
-- cru e não sabe o que é um card. Guardar a frase montada faria a mensagem
-- pendente de uma execução anterior chegar com o texto de uma versão antiga do
-- código.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config e estado, na mesma linha única
-- ─────────────────────────────────────────────────────────────────────────────
-- Linha única no estilo de `public.robo_config` (20260813100100): tudo que se
-- calibra sem deploy fica em coluna, não em constante de código. Config e estado
-- convivem porque a sonda lê as duas coisas na mesma ida ao banco, e porque um
-- monitor com config numa tabela e estado noutra tem dois lugares para ficar
-- inconsistente.
CREATE TABLE IF NOT EXISTS public.assim_healthcheck (
  id                      int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- ── Config ────────────────────────────────────────────────────────────────
  ativo                   boolean NOT NULL DEFAULT true,

  -- NULL = usa robo_config.assim_login_url. O override existe para o teste:
  -- apontar para um host morto é como se simula uma queda sem esperar uma.
  url_override            text,

  -- O ganho sobre o `page.goto` do original: um 200 só prova que ALGO respondeu.
  -- Uma página de manutenção com 200 passaria batido. `entrar` é o
  -- form[name="entrar"] da tela de login da ASSIM. Se o portal mudar o nome do
  -- formulário outra vez, isto é um UPDATE, não um redeploy.
  marcador_html           text NOT NULL DEFAULT 'entrar',

  timeout_ms              int  NOT NULL DEFAULT 15000 CHECK (timeout_ms BETWEEN 1000 AND 60000),
  tentativas              int  NOT NULL DEFAULT 3     CHECK (tentativas BETWEEN 1 AND 10),
  intervalo_tentativa_ms  int  NOT NULL DEFAULT 5000  CHECK (intervalo_tentativa_ms BETWEEN 0 AND 30000),

  -- Não são segredo (o token é, e vive nos secrets da Edge Function). Ficam aqui
  -- porque descobrir o id de um canal exige duas chamadas autenticadas na API do
  -- ClickUp — ver supabase/snippets/20260825_clickup_ids_healthcheck.sql.
  clickup_workspace_id    text,
  clickup_channel_id      text,

  -- Janela de notificação, em hora de São Paulo. O cron já roda só na janela;
  -- estas colunas protegem a invocação manual e permitem, um dia, checar 24/7
  -- gravando histórico sem acordar ninguém às 3h por manutenção da ASSIM.
  janela_inicio           time NOT NULL DEFAULT '07:00',
  janela_fim              time NOT NULL DEFAULT '19:00',
  janela_dias             int[] NOT NULL DEFAULT '{1,2,3,4,5}',

  -- ── Estado ────────────────────────────────────────────────────────────────
  status                  text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  desde                   timestamptz NOT NULL DEFAULT now(),
  ultima_checagem         timestamptz,
  falhas_consecutivas     int  NOT NULL DEFAULT 0,
  ultimo_erro             text,
  alerta_id               uuid REFERENCES public.alertas(id) ON DELETE SET NULL,

  -- O furo que toda sonda por transição tem: o estado já virou, então se o envio
  -- falhar, o aviso daquela transição não nasce nunca mais. A RPC deposita o fato
  -- aqui e a Edge Function só limpa depois do 201 do ClickUp. A execução seguinte
  -- reenvia. Um 429 ou uma indisponibilidade do ClickUp atrasa o aviso, não o perde.
  notificacao_pendente    jsonb,

  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.assim_healthcheck IS
  'Config e estado da sonda de disponibilidade do portal da ASSIM. Linha única. Só a Edge Function assim-healthcheck escreve, em service_role.';
COMMENT ON COLUMN public.assim_healthcheck.desde IS
  'Desde quando o status atual vale. É o que dá a duração da queda na mensagem de volta, e entra na fingerprint do alerta para cada incidente ser um alerta próprio.';
COMMENT ON COLUMN public.assim_healthcheck.notificacao_pendente IS
  'Transição detectada e ainda não entregue no ClickUp: {transicao, em, duracao_minutos, motivo}. Guarda o FATO, não a frase — a frase é montada no envio, senão uma pendência antiga chegaria com o texto de uma versão antiga do código.';

INSERT INTO public.assim_healthcheck (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.assim_healthcheck ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assim_healthcheck FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O histórico
-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only e estreita. Existe para responder "quanto tempo a ASSIM ficou fora
-- este mês" — pergunta que o robô antigo nunca conseguiu responder, porque o
-- estado dele era um arquivo JSON sobrescrito a cada execução.
CREATE TABLE IF NOT EXISTS public.assim_healthcheck_log (
  id           bigserial PRIMARY KEY,
  checado_em   timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL CHECK (status IN ('online', 'offline')),
  http_status  int,
  latencia_ms  int,
  erro         text
);

COMMENT ON TABLE public.assim_healthcheck_log IS
  'Uma linha por checagem da ASSIM. Base para medir indisponibilidade acumulada.';

CREATE INDEX IF NOT EXISTS idx_assim_healthcheck_log_checado
  ON public.assim_healthcheck_log (checado_em DESC);

ALTER TABLE public.assim_healthcheck_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assim_healthcheck_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.assim_healthcheck_log_id_seq FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A regra do sino
-- ─────────────────────────────────────────────────────────────────────────────
-- `tolerancia_minutos = 0` porque não há nada a esperar: a sonda só chama a RPC
-- depois de esgotar as tentativas, então a queda já é um fato quando chega aqui.
-- Prioridade crítica: com a ASSIM fora, a recepção não autoriza NADA — é a única
-- condição neste sistema que para o atendimento inteiro de uma vez.
INSERT INTO public.alertas_regras
  (codigo, modulo, nome, setor_destino, prioridade, tolerancia_minutos)
VALUES
  ('assim_indisponivel', 'assim', 'Portal da ASSIM indisponível', 'recepcao', 'critica', 0)
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A RPC que decide a transição
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque escreve em `alertas`, cujas policies são de usuário.
-- NÃO usa fn_alerta_criar/fn_alerta_status: as duas exigem auth.uid() e role de
-- gestão, e aqui não há usuário nenhum. O caminho automático é o INSERT direto,
-- exatamente como fn_alertas_avaliar_assim faz (20260730100200).
CREATE OR REPLACE FUNCTION public.fn_assim_healthcheck_registrar(
  p_ok          boolean,
  p_http_status int  DEFAULT NULL,
  p_latencia_ms int  DEFAULT NULL,
  p_erro        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg          record;
  v_novo         text := CASE WHEN p_ok THEN 'online' ELSE 'offline' END;
  v_transicao    text;
  v_agora        timestamptz := now();
  v_local        timestamp;
  v_desde        timestamptz;
  v_duracao      int;
  v_notificar    boolean;
  v_alerta_id    uuid;
  v_pendente     jsonb;
  v_fingerprint  text;
  v_erro         text;
  v_erro_curto   text;
BEGIN
  -- Normaliza uma vez. O log guarda o erro inteiro, que é o registro forense;
  -- o que vai para tela e para mensagem é truncado, porque uma falha de rede do
  -- Deno traz três frases repetindo a mesma coisa e isso ocuparia a descrição
  -- toda do alerta.
  v_erro       := nullif(trim(coalesce(p_erro, '')), '');
  v_erro_curto := left(v_erro, 200);
  -- A trava. Duas execuções concorrentes viram fila aqui, e a segunda lê o estado
  -- já virado — então ela não encontra transição para anunciar.
  SELECT * INTO v_cfg FROM public.assim_healthcheck WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assim_healthcheck: linha de configuração ausente';
  END IF;

  INSERT INTO public.assim_healthcheck_log (status, http_status, latencia_ms, erro)
  VALUES (v_novo, p_http_status, p_latencia_ms, v_erro);

  IF v_novo IS DISTINCT FROM v_cfg.status THEN
    v_transicao := CASE WHEN p_ok THEN 'voltou' ELSE 'caiu' END;
    v_desde     := v_agora;
    -- Duração do estado que acabou de terminar. Só faz sentido na volta.
    v_duracao   := CASE
                     WHEN v_transicao = 'voltou'
                     THEN greatest(1, (extract(epoch FROM (v_agora - v_cfg.desde)) / 60)::int)
                   END;
  ELSE
    v_desde := v_cfg.desde;
  END IF;

  -- Janela de notificação, em hora de São Paulo. dow: 0=domingo .. 6=sábado, e o
  -- default {1..5} é seg-sex.
  v_local     := v_agora AT TIME ZONE 'America/Sao_Paulo';
  v_notificar := v_transicao IS NOT NULL
                 AND v_cfg.ativo
                 AND extract(dow FROM v_local)::int = ANY (v_cfg.janela_dias)
                 AND v_local::time BETWEEN v_cfg.janela_inicio AND v_cfg.janela_fim;

  -- ── O alerta do sino ──────────────────────────────────────────────────────
  IF v_transicao = 'caiu' THEN
    -- `desde` entra na fingerprint para cada incidente ser um alerta próprio: o
    -- unique parcial uq_alertas_fingerprint_aberto barraria um segundo alerta com
    -- a mesma chave, e a queda de amanhã ficaria sem registro.
    v_fingerprint := concat_ws('|', 'assim', 'assim_indisponivel', 'portal_assim',
                               to_char(v_desde, 'YYYY-MM-DD"T"HH24:MI:SS'));

    INSERT INTO public.alertas (
      modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
      titulo, descricao, prioridade, status, setor_destino, fingerprint
    ) VALUES (
      'assim', 'assim_indisponivel', 'sistema', 'sistema_externo', 'portal_assim',
      jsonb_build_object(
        'data',   to_char(v_local, 'YYYY-MM-DD'),
        'hora',   to_char(v_local, 'HH24:MI'),
        'motivo', v_erro_curto,
        'url',    coalesce(v_cfg.url_override, (SELECT assim_login_url FROM public.robo_config WHERE id = 1))
      ),
      'Portal da ASSIM indisponível',
      concat('O portal do Autorizador da ASSIM parou de responder às ',
             to_char(v_local, 'HH24:MI'), '. ',
             coalesce(v_erro_curto, 'Sem detalhe do erro.')),
      'critica', 'aberto', 'recepcao', v_fingerprint
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_alerta_id;

    IF v_alerta_id IS NOT NULL THEN
      INSERT INTO public.alertas_eventos (
        alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao, metadata
      ) VALUES (
        v_alerta_id, 'sistema_externo', 'portal_assim', 'deteccao', 'sistema', 'Sistema',
        'Sistema detectou que o portal da ASSIM parou de responder.',
        jsonb_build_object('erro', v_erro_curto,
                           'http_status', p_http_status)
      );
    END IF;

  ELSIF v_transicao = 'voltou' AND v_cfg.alerta_id IS NOT NULL THEN
    UPDATE public.alertas SET
      status        = 'resolvido',
      resolvido_em  = v_agora,
      resolucao     = 'automatico',
      atualizado_em = v_agora
    WHERE id = v_cfg.alerta_id
      AND status <> 'resolvido';

    IF FOUND THEN
      INSERT INTO public.alertas_eventos (
        alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao, metadata
      ) VALUES (
        v_cfg.alerta_id, 'sistema_externo', 'portal_assim', 'encerramento', 'sistema', 'Sistema',
        concat('Portal da ASSIM voltou a responder. Ficou fora por ', v_duracao, ' min.'),
        jsonb_build_object('duracao_minutos', v_duracao)
      );
    END IF;
  END IF;

  -- ── A pendência de envio ──────────────────────────────────────────────────
  -- Uma transição nova SUBSTITUI a pendência anterior: se caiu e voltou dentro do
  -- mesmo intervalo de envio, o que interessa é o estado final. Anunciar uma queda
  -- já resolvida é pior que não anunciar.
  IF v_notificar THEN
    v_pendente := jsonb_build_object(
      'transicao',       v_transicao,
      'em',              to_char(v_local, 'DD/MM/YYYY HH24:MI'),
      'duracao_minutos', v_duracao,
      'motivo',          v_erro_curto
    );
  ELSE
    v_pendente := v_cfg.notificacao_pendente;
  END IF;

  UPDATE public.assim_healthcheck SET
    status               = v_novo,
    desde                = v_desde,
    ultima_checagem      = v_agora,
    falhas_consecutivas  = CASE WHEN p_ok THEN 0 ELSE falhas_consecutivas + 1 END,
    ultimo_erro          = CASE WHEN p_ok THEN NULL ELSE v_erro_curto END,
    alerta_id            = CASE
                             WHEN v_transicao = 'caiu'   THEN coalesce(v_alerta_id, alerta_id)
                             WHEN v_transicao = 'voltou' THEN NULL
                             ELSE alerta_id
                           END,
    notificacao_pendente = v_pendente,
    updated_at           = v_agora
  WHERE id = 1;

  RETURN jsonb_build_object(
    'status',          v_novo,
    'transicao',       v_transicao,
    'desde',           v_desde,
    'duracao_minutos', v_duracao,
    'alerta_id',       v_alerta_id,
    'pendente',        v_pendente
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assim_healthcheck_registrar(boolean, int, int, text) FROM PUBLIC;

COMMENT ON FUNCTION public.fn_assim_healthcheck_registrar(boolean, int, int, text) IS
  'Registra uma checagem da ASSIM e decide, sob FOR UPDATE, se houve transição. Abre/encerra o alerta do sino e devolve o fato a anunciar. Chamada só pela Edge Function assim-healthcheck.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Confirmação de envio
-- ─────────────────────────────────────────────────────────────────────────────
-- Separada da RPC de registro de propósito: entre decidir a transição e o ClickUp
-- responder 201 existe uma chamada de rede que pode falhar. Só o 201 limpa.
CREATE OR REPLACE FUNCTION public.fn_assim_healthcheck_notificado()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assim_healthcheck
     SET notificacao_pendente = NULL, updated_at = now()
   WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.fn_assim_healthcheck_notificado() FROM PUBLIC;

COMMENT ON FUNCTION public.fn_assim_healthcheck_notificado() IS
  'Limpa a pendência de envio. Chamada pela Edge Function apenas depois do 201 do ClickUp.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O disparo
-- ─────────────────────────────────────────────────────────────────────────────
-- O guard de segredo ausente é o ponto principal, e é a lição de 20260814100000:
-- sem ele, 'Bearer ' || NULL vira NULL, o header sai null, a Edge Function
-- responde 401 e o pg_cron marca o job como SUCESSO. Um monitor que falha em
-- silêncio é pior que monitor nenhum, porque o silêncio passa a significar duas
-- coisas.
CREATE OR REPLACE FUNCTION public.fn_assim_healthcheck_disparar()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/assim-healthcheck';
  _token text;
BEGIN
  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_assim_healthcheck_disparar: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body                   := '{}'::jsonb,
    timeout_milliseconds   := 30000
  );
END;
$$;

COMMENT ON FUNCTION public.fn_assim_healthcheck_disparar() IS
  'Invoca a Edge Function assim-healthcheck com a chave do Vault. Agendada em healthcheck-assim.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Agendamento
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('healthcheck-assim');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Cron do Supabase roda em UTC. 10-21 UTC = 07:00-18:55 em São Paulo, e o Brasil
-- não tem mais horário de verão, então o offset é fixo em -3 e a janela não
-- escorrega duas vezes por ano. 1-5 = seg-sex.
-- A cada 5 min é o ritmo do original (que rodava a cada disparo do robô) e o que
-- a janela promete na mensagem: uma queda é anunciada em no máximo 5 minutos.
SELECT cron.schedule(
  'healthcheck-assim',
  '*/5 10-21 * * 1-5',
  $cron$SELECT public.fn_assim_healthcheck_disparar()$cron$
);
