-- ============================================================
-- robo-autorizador: identidade por maquina + config no banco
--
-- Empacota as tres migrations 20260813100000/100100/100200 para
-- colar de uma vez no SQL Editor. Depois disto o robo deixa de
-- precisar da SUPABASE_SERVICE_ROLE_KEY no PC da recepcionista.
--
-- ORDEM IMPORTA. Antes de rodar isto, leia
-- supabase/snippets/robo_provisionar.sql: a senha da ASSIM
-- precisa estar no Vault, senao robo_obter_config_assim devolve
-- senha nula e o robo nao consegue logar no portal.
--
-- Tudo ou nada: se der erro, nada e aplicado.
-- ============================================================

begin;

-- ============================================================================
-- migration 20260813100000_robo_identidade_por_maquina
-- ============================================================================
-- Identidade por máquina para o robo-autorizador.
--
-- PROBLEMA QUE ISSO FECHA
-- Hoje cada PC de recepção tem no `robo-autorizador/.env` duas cópias da
-- SUPABASE_SERVICE_ROLE_KEY (as variáveis SUPABASE_KEY e
-- SUPABASE_SERVICE_ROLE_KEY decodificam ambas para role:service_role, exp 2036).
-- Ou seja: bypass total de RLS, em texto puro, num arquivo legível por qualquer
-- usuário local, e ainda embutido no .exe que circula por pendrive.
-- O robô também se auto-declara: `MACHINE_ID=admin` no .env, sem nada que prove
-- que aquela máquina é mesmo aquela.
--
-- Depois desta migration + das RPCs robo_* (migration seguinte), o PC passa a
-- carregar só um token aleatório de 256 bits, escopado a UMA máquina e a 6
-- operações, revogável com um UPDATE. O hash fica aqui; o token em claro só
-- existe no momento da geração (ver supabase/snippets/robo_gerar_token_maquina.sql).
--
-- ATENÇÃO — NÃO MEXER EM maquinas.user_id:
-- ele é lido pelo trigger fn_set_criado_por() (migration 20260730000000) para
-- preencher fila_autorizacoes.criado_por via machine_id -> maquinas.user_id ->
-- usuarios.nome. user_id é o HUMANO daquela estação, não a identidade do robô.
-- Reaproveitá-lo quebraria o "Solicitado por" de toda a central.

-- ---------------------------------------------------------------------------
-- 1. Credencial da máquina
-- ---------------------------------------------------------------------------

ALTER TABLE public.maquinas
  ADD COLUMN IF NOT EXISTS token_hash        text,
  ADD COLUMN IF NOT EXISTS token_criado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS token_revogado_em timestamptz;

COMMENT ON COLUMN public.maquinas.token_hash IS
  'SHA-256 (hex) do token da máquina. O token em claro NUNCA é armazenado.';
COMMENT ON COLUMN public.maquinas.token_revogado_em IS
  'Preenchido para revogar a máquina sem apagar o histórico. As RPCs robo_* recusam token revogado.';

-- Dois PCs não podem compartilhar credencial: senão a revogação de um derruba
-- o outro, e o rastro de quem fez o quê se perde.
CREATE UNIQUE INDEX IF NOT EXISTS maquinas_token_hash_key
  ON public.maquinas (token_hash)
  WHERE token_hash IS NOT NULL;

-- `token_maquina` existe desde o dump baseline (20260518131652_remote_schema.sql:461)
-- e nunca foi lida nem escrita por código nenhum — só aparece em types/supabase.ts,
-- gerado. Some para não virar o "outro campo de token" que confunde o próximo leitor.
ALTER TABLE public.maquinas DROP COLUMN IF EXISTS token_maquina;

-- ---------------------------------------------------------------------------
-- 2. Telemetria de versão (habilita o auto-update)
-- ---------------------------------------------------------------------------
-- Hoje a versão do robô é invisível do servidor: AppVersion está congelado em
-- 1.0.0 no .iss desde sempre, /health não reporta versão, e o payload do
-- instalador atual já está duas correções atrás do rpa.js do repo — sem que dê
-- para saber disso sem ir até o PC.

ALTER TABLE public.maquinas
  ADD COLUMN IF NOT EXISTS app_version        text,
  ADD COLUMN IF NOT EXISTS ultima_atualizacao timestamptz;

COMMENT ON COLUMN public.maquinas.app_version IS
  'Versão do robô reportada no último heartbeat. Comparada com robo_pacotes para decidir atualização.';

-- ============================================================================
-- migration 20260813100100_robo_config_e_pacotes
-- ============================================================================
-- Tira a configuração do robo-autorizador do .env de cada PC e traz para o banco.
--
-- MOTIVAÇÃO IMEDIATA
-- A ASSIM colocou uma tela de login antes do formulário de autorização. Hoje,
-- ajustar qualquer coisa do formulário (URL, rótulo de um <select>, código do
-- executor) exige gerar .exe novo e ir de pendrive em cada PC de recepção.
-- Com a config aqui, isso vira um UPDATE.
--
-- A SENHA NÃO ENTRA NESTE ARQUIVO.
-- Ela vai para o Supabase Vault, executado à parte, exatamente como foi feito
-- com 'cron_service_role_key' em 20260724180000 — um arquivo versionado num
-- repositório PÚBLICO nunca deve carregar segredo. O comando está em
-- supabase/snippets/robo_provisionar_assim.sql. A RPC robo_obter_config_assim
-- junta esta tabela com vault.decrypted_secrets em tempo de execução.

-- ---------------------------------------------------------------------------
-- 1. Configuração do formulário da ASSIM + comportamento do robô
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.robo_config (
  id                    int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Tela de login (nova) e deep link do formulário
  assim_login_url       text NOT NULL DEFAULT 'https://autorizador.assim.com.br/',
  assim_url             text NOT NULL,
  assim_id_hospital     text NOT NULL,

  -- Valores fixos do formulário de autorização
  assim_tipo_operacao   text NOT NULL,
  assim_natureza        text NOT NULL,
  assim_tipo_servico    text NOT NULL,
  assim_executor        text NOT NULL,
  assim_executor_label  text NOT NULL,
  assim_solicitante     text NOT NULL,
  assim_tipo_consulta   text NOT NULL,
  assim_tipo_saida      text NOT NULL,

  -- Comportamento do robô, ajustável sem reinstalar
  max_abas_abertas      int  NOT NULL DEFAULT 3   CHECK (max_abas_abertas BETWEEN 1 AND 20),
  aba_ttl_minutos       int  NOT NULL DEFAULT 30  CHECK (aba_ttl_minutos BETWEEN 1 AND 720),
  poll_ms_ativo         int  NOT NULL DEFAULT 1000 CHECK (poll_ms_ativo BETWEEN 250 AND 60000),
  poll_ms_ocioso        int  NOT NULL DEFAULT 5000 CHECK (poll_ms_ocioso BETWEEN 250 AND 300000),
  ocioso_apos_ms        int  NOT NULL DEFAULT 120000,
  modal_timeout_ms      int  NOT NULL DEFAULT 600000,
  envio_timeout_ms      int  NOT NULL DEFAULT 120000,

  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.robo_config IS
  'Linha única. Configuração do robo-autorizador servida pela RPC robo_obter_config_assim. Sem segredos — a senha da ASSIM vive no Vault.';
COMMENT ON COLUMN public.robo_config.poll_ms_ocioso IS
  'Intervalo de poll quando não há tarefa há ocioso_apos_ms. Hoje o robô consulta a cada 500ms, 24h/dia, o que pesa no Disk IO sem necessidade.';
COMMENT ON COLUMN public.robo_config.modal_timeout_ms IS
  'Prazo do modal de forma de validação. Esgotado, a tarefa é encerrada sem forma e o worker volta a atender — hoje ele trava para sempre.';

-- RLS ligado e SEM policy: nega tudo para anon/authenticated. O acesso legítimo
-- é via RPC SECURITY DEFINER e via service_role. Mesmo idioma de
-- public.edge_rate_limits (20260724150000), e é o que satisfaz o check-rls.yml.
ALTER TABLE public.robo_config ENABLE ROW LEVEL SECURITY;

-- Semente com os valores que hoje estão no .env (nenhum é segredo).
INSERT INTO public.robo_config (
  id, assim_url, assim_id_hospital,
  assim_tipo_operacao, assim_natureza, assim_tipo_servico,
  assim_executor, assim_executor_label, assim_solicitante,
  assim_tipo_consulta, assim_tipo_saida
) VALUES (
  1,
  'https://autorizador.assim.com.br/formularionChoiceCard.php?id_hospital=52345&servico=&natureza=&operacao=&associado=&exec=&id_solicitante=&numamb1=&numamb2=&numamb3=&numamb4=&numamb5=&numamb6=&numamb7=&numamb8=&numamb9=&numamb10=&nome_esp=&tipoDeConsulta=&tipoDeSaida=&trans=1',
  '52345',
  'Atendimento', 'Eletivo', 'Terapia',
  '52345', '52345 - UNIVERSO ABA CLINICA TERA', '8888',
  'Seguimento', 'Alta'
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Pacotes de atualização assinados
-- ---------------------------------------------------------------------------
-- O robô roda em máquina que ninguém administra remotamente hoje: atualizar é
-- ir de pendrive. Um canal de atualização é, por natureza, um canal de execução
-- de código em todos os PCs da clínica — por isso o pacote é ASSINADO
-- (Ed25519), e a chave privada fica fora do repositório. Quem tiver escrita
-- neste banco ainda assim não consegue publicar código executável.

CREATE TABLE IF NOT EXISTS public.robo_pacotes (
  versao      text PRIMARY KEY,
  -- [{ nome, sha256, conteudo_b64 }] — só arquivos .js do robô.
  arquivos    jsonb       NOT NULL,
  -- Assinatura Ed25519 (base64) sobre o manifesto canônico {versao, arquivos:[{nome,sha256}]}.
  assinatura  text        NOT NULL,
  publicado   boolean     NOT NULL DEFAULT false,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.robo_pacotes IS
  'Pacotes de auto-update do robô. Só worker.js/rpa.js/updater.js e afins — Node, Chromium e node_modules continuam vindo pelo instalador.';
COMMENT ON COLUMN public.robo_pacotes.publicado IS
  'Só a versão publicada mais recente é oferecida no heartbeat. Permite subir o pacote e liberar depois.';

ALTER TABLE public.robo_pacotes ENABLE ROW LEVEL SECURITY;

-- Índice para "qual é a última versão publicada" (consulta de todo heartbeat).
CREATE INDEX IF NOT EXISTS idx_robo_pacotes_publicado
  ON public.robo_pacotes (created_at DESC)
  WHERE publicado;

-- ---------------------------------------------------------------------------
-- 3. Chave pública de verificação
-- ---------------------------------------------------------------------------
-- Guardada aqui só por conveniência de auditoria (conferir qual chave a frota
-- deveria estar usando). A chave que o robô REALMENTE usa é a embutida no
-- payload do instalador — se ela viesse do banco, a assinatura não protegeria
-- nada, porque quem trocasse o pacote trocaria a chave junto.

ALTER TABLE public.robo_config
  ADD COLUMN IF NOT EXISTS update_pubkey_b64 text;

COMMENT ON COLUMN public.robo_config.update_pubkey_b64 IS
  'Referência/auditoria apenas. O robô valida com a chave pública embutida no seu próprio binário, nunca com esta.';

-- ============================================================================
-- migration 20260813100200_robo_rpcs
-- ============================================================================
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

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260813100000','robo_identidade_por_maquina'),
  ('20260813100100','robo_config_e_pacotes'),
  ('20260813100200','robo_rpcs')
on conflict (version) do nothing;

commit;

-- ============================================================
-- Conferencia
-- ============================================================

-- 1. As 7 RPCs devem estar em anon e NAO em authenticated.
--    robo_autenticar nao pode estar em nenhum dos dois.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'robo\_%'
 order by 1;

-- 2. RLS ligado e sem policy nas duas tabelas novas.
select c.relname, c.relrowsecurity as rls,
       (select count(*) from pg_policies where schemaname='public' and tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relname in ('robo_config','robo_pacotes')
 order by 1;

-- 3. A config semeada.
select assim_login_url, assim_id_hospital, max_abas_abertas, poll_ms_ativo, poll_ms_ocioso
  from public.robo_config where id = 1;
