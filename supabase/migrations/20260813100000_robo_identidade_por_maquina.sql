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
