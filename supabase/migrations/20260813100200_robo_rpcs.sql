-- Superfície mínima do robo-autorizador: 7 RPCs no lugar do acesso direto às
-- tabelas com service_role.
--
-- POR QUE RPC E NÃO EDGE FUNCTION
-- O worker consulta a fila em laço curto. Via Edge Function isso daria ordem de
-- milhões de invocações por mês por máquina — caro e sem ganho, já que a
-- validação cabe inteira no banco. RPC roda no mesmo PostgREST que o robô já
-- usa: mesma latência, mesma biblioteca (@supabase/supabase-js), custo zero por
-- chamada.
--
-- POR QUE `TO anon`
-- O robô manda a anon key no header `apikey` (pública por design, já está no
-- bundle do frontend). Quem autoriza de fato é o token da máquina, que viaja no
-- CORPO do POST — nunca na URL, portanto nunca em log de acesso. Todas as
-- funções são VOLATILE, o que obriga o PostgREST a usar POST.
-- Sem token válido, toda função aqui levanta exceção antes de tocar em dado.
--
-- SOBRE FORÇA BRUTA
-- O token tem 256 bits de entropia. Deliberadamente NÃO existe tabela de
-- tentativas falhas: seria uma escrita não autenticada e ilimitada num banco
-- que já tem aperto de Disk IO — o próprio remédio viraria o vetor. Falha de
-- autenticação vai para o log do Postgres via RAISE WARNING (visível no
-- dashboard, custo zero de I/O), e a plataforma já aplica rate limit de borda.

-- ---------------------------------------------------------------------------
-- 0. Autenticador interno — SEM GRANT. Só as funções abaixo o chamam.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.robo_autenticar(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'token invalido' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_machine_id
    FROM public.maquinas
   WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     AND token_revogado_em IS NULL;

  IF v_machine_id IS NULL THEN
    -- Mensagem idêntica para token inexistente, revogado ou malformado:
    -- não entregar ao chamador a informação de "quase acertou".
    RAISE WARNING 'robo: autenticacao recusada (ip=%)',
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', '?');
    RAISE EXCEPTION 'token invalido' USING ERRCODE = '28000';
  END IF;

  RETURN v_machine_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.robo_autenticar(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Heartbeat — identidade, estado, config de ritmo e aviso de versão
-- ---------------------------------------------------------------------------
-- Substitui três acessos diretos de hoje: o upsert de auto-registro
-- (worker.js:144-164), o heartbeat de 30s (:169-177) e a leitura de
-- ativa/restart_solicitado a cada volta do laço (:204-215).
--
-- Diferença importante: NÃO cria linha nova. Antes, qualquer processo com a
-- service_role inventava uma máquina só de subir. Agora a máquina é provisionada
-- por um humano (supabase/snippets/robo_gerar_token_maquina.sql) e o robô só
-- pode se apresentar como uma que já existe.

CREATE OR REPLACE FUNCTION public.robo_heartbeat(
  p_token    text,
  p_hostname text DEFAULT NULL,
  p_so       text DEFAULT NULL,
  p_versao   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_ativa      boolean;
  v_restart    boolean;
  v_cfg        record;
  v_disponivel text;
BEGIN
  -- Trava a linha e lê o estado ANTES de limpar o pedido de reinício. A função
  -- inteira roda numa transação, então ler-e-limpar aqui é atômico: o restart é
  -- entregue exatamente uma vez, sem janela para duas leituras verem o mesmo
  -- pedido.
  SELECT ativa, coalesce(restart_solicitado, false)
    INTO v_ativa, v_restart
    FROM public.maquinas
   WHERE id = v_machine_id
     FOR UPDATE;

  UPDATE public.maquinas
     SET last_seen           = now(),
         updated_at          = now(),
         hostname            = coalesce(p_hostname, hostname),
         sistema_operacional = coalesce(p_so, sistema_operacional),
         ultima_atualizacao  = CASE
                                 WHEN p_versao IS NOT NULL AND p_versao IS DISTINCT FROM app_version
                                 THEN now() ELSE ultima_atualizacao
                               END,
         app_version         = coalesce(p_versao, app_version),
         restart_solicitado  = false
   WHERE id = v_machine_id;

  SELECT * INTO v_cfg FROM public.robo_config WHERE id = 1;

  SELECT versao INTO v_disponivel
    FROM public.robo_pacotes
   WHERE publicado
   ORDER BY created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'machine_id',         v_machine_id,
    'ativa',              coalesce(v_ativa, true),
    'restart_solicitado', v_restart,
    'versao_disponivel',  v_disponivel,
    'poll_ms_ativo',      v_cfg.poll_ms_ativo,
    'poll_ms_ocioso',     v_cfg.poll_ms_ocioso,
    'ocioso_apos_ms',     v_cfg.ocioso_apos_ms,
    'max_abas_abertas',   v_cfg.max_abas_abertas,
    'aba_ttl_minutos',    v_cfg.aba_ttl_minutos,
    'modal_timeout_ms',   v_cfg.modal_timeout_ms,
    'envio_timeout_ms',   v_cfg.envio_timeout_ms
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Buscar e travar tarefa — atômico
-- ---------------------------------------------------------------------------
-- Hoje são dois passos (SELECT em worker.js:69-84, depois UPDATE ... match em
-- :236-256) com uma fresta entre eles onde duas máquinas podem pegar a mesma
-- linha. `FOR UPDATE SKIP LOCKED` fecha isso no banco.
--
-- Também corrige a ordenação: worker.js:75 ordena por `id`, que é uuid — ou
-- seja, ordem aleatória, não a de chegada. Passa a ser FIFO por created_at.

CREATE OR REPLACE FUNCTION public.robo_buscar_tarefa(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_tarefa     jsonb;
BEGIN
  -- Máquina pausada pelo painel não recebe trabalho.
  IF NOT EXISTS (SELECT 1 FROM public.maquinas WHERE id = v_machine_id AND ativa) THEN
    RETURN NULL;
  END IF;

  UPDATE public.fila_autorizacoes f
     SET status     = 'processando',
         started_at = now(),
         updated_at = now()
   WHERE f.id = (
           SELECT c.id
             FROM public.fila_autorizacoes c
            WHERE c.status = 'pendente'
              AND c.machine_id = v_machine_id
            ORDER BY c.created_at ASC NULLS LAST, c.id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
  RETURNING jsonb_build_object(
    'id',               f.id,
    'paciente_nome',    f.paciente_nome,
    'data_atendimento', f.data_atendimento,
    'horario',          f.horario,
    'empresa',          f.empresa,
    'matricula',        f.matricula,
    'dep',              f.dep,
    'crm',              f.crm,
    'crm_uf',           f.crm_uf,
    'nome_medico',      f.nome_medico,
    'tuss',             f.tuss
  ) INTO v_tarefa;

  RETURN v_tarefa;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Status da tarefa (detecção de cancelamento durante a execução)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.robo_status_tarefa(p_token text, p_fila_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_status     text;
BEGIN
  SELECT status INTO v_status
    FROM public.fila_autorizacoes
   WHERE id = p_fila_id
     AND machine_id = v_machine_id;

  -- Linha de outra máquina responde igual a linha inexistente.
  RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Log de execução
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.robo_registrar_log(
  p_token    text,
  p_fila_id  uuid,
  p_mensagem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fila_autorizacoes
     WHERE id = p_fila_id AND machine_id = v_machine_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.logs (fila_id, mensagem, origem, nivel)
  VALUES (p_fila_id, left(coalesce(p_mensagem, ''), 2000), 'worker', 'info');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Conclusão da tarefa
-- ---------------------------------------------------------------------------
-- O robô só pode gravar os três desfechos que ele mesmo produz. 'cancelado',
-- 'falta' e 'glosa' são decisões humanas e continuam fora do alcance dele,
-- mesmo com token válido.

CREATE OR REPLACE FUNCTION public.robo_concluir_tarefa(
  p_token               text,
  p_fila_id             uuid,
  p_status              text,
  p_numero_autorizacao  text      DEFAULT NULL,
  p_forma_autorizacao   text      DEFAULT NULL,
  p_horario_autorizacao timestamp DEFAULT NULL,
  p_error_message       text      DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_afetadas   int;
BEGIN
  IF p_status NOT IN ('concluido', 'concluido_sem_guia', 'erro') THEN
    RAISE EXCEPTION 'status nao permitido ao robo: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.fila_autorizacoes
     SET status              = p_status,
         numero_autorizacao  = coalesce(p_numero_autorizacao, numero_autorizacao),
         horario_autorizacao = coalesce(p_horario_autorizacao, horario_autorizacao),
         forma_autorizacao   = coalesce(p_forma_autorizacao, forma_autorizacao),
         -- Sem forma escolhida, validacao_finalizada_em fica nula de propósito:
         -- é o que deixa a pendência visível e preenchível depois pela rota
         -- /api/fila-autorizacoes/validacao, em vez de fingir que foi resolvida.
         validacao_finalizada_em = CASE
                                     WHEN p_forma_autorizacao IS NOT NULL THEN now()
                                     ELSE validacao_finalizada_em
                                   END,
         error_message       = CASE
                                 WHEN p_status = 'concluido' AND p_error_message IS NULL
                                 THEN NULL ELSE coalesce(p_error_message, error_message)
                               END,
         completed_at        = now(),
         updated_at          = now()
   WHERE id = p_fila_id
     AND machine_id = v_machine_id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Configuração da ASSIM (inclui a senha, vinda do Vault)
-- ---------------------------------------------------------------------------
-- A senha nunca é gravada no disco do PC: o robô a recebe aqui e a mantém só em
-- memória. Trocar a senha do portal passa a ser um comando no Vault, sem visitar
-- máquina nenhuma.

CREATE OR REPLACE FUNCTION public.robo_obter_config_assim(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_cfg        record;
  v_senha      text;
BEGIN
  SELECT * INTO v_cfg FROM public.robo_config WHERE id = 1;

  IF v_cfg IS NULL THEN
    RAISE EXCEPTION 'robo_config nao inicializada' USING ERRCODE = 'P0002';
  END IF;

  SELECT decrypted_secret INTO v_senha
    FROM vault.decrypted_secrets
   WHERE name = 'assim_senha';

  RETURN jsonb_build_object(
    'login_url',       v_cfg.assim_login_url,
    'url',             v_cfg.assim_url,
    'id_hospital',     v_cfg.assim_id_hospital,
    'senha',           v_senha,
    'tipo_operacao',   v_cfg.assim_tipo_operacao,
    'natureza',        v_cfg.assim_natureza,
    'tipo_servico',    v_cfg.assim_tipo_servico,
    'executor',        v_cfg.assim_executor,
    'executor_label',  v_cfg.assim_executor_label,
    'solicitante',     v_cfg.assim_solicitante,
    'tipo_consulta',   v_cfg.assim_tipo_consulta,
    'tipo_saida',      v_cfg.assim_tipo_saida
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Pacote de atualização
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.robo_obter_pacote(p_token text, p_versao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_pacote     jsonb;
BEGIN
  SELECT jsonb_build_object(
           'versao',     versao,
           'arquivos',   arquivos,
           'assinatura', assinatura
         )
    INTO v_pacote
    FROM public.robo_pacotes
   WHERE versao = p_versao
     AND publicado;

  RETURN v_pacote;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants — revoke-then-grant, como em 20260610000012
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.robo_heartbeat(text, text, text, text)            FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_buscar_tarefa(text)                           FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_status_tarefa(text, uuid)                     FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_registrar_log(text, uuid, text)               FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_obter_config_assim(text)                      FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.robo_obter_pacote(text, text)                      FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.robo_heartbeat(text, text, text, text)             TO anon;
GRANT EXECUTE ON FUNCTION public.robo_buscar_tarefa(text)                            TO anon;
GRANT EXECUTE ON FUNCTION public.robo_status_tarefa(text, uuid)                      TO anon;
GRANT EXECUTE ON FUNCTION public.robo_registrar_log(text, uuid, text)                TO anon;
GRANT EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text) TO anon;
GRANT EXECUTE ON FUNCTION public.robo_obter_config_assim(text)                       TO anon;
GRANT EXECUTE ON FUNCTION public.robo_obter_pacote(text, text)                        TO anon;
