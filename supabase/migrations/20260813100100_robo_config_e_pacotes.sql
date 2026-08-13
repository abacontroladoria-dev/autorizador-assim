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
