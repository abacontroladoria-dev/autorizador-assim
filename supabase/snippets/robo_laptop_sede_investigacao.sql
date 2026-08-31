-- ===========================================================================
-- Investigação da máquina `laptop_sede` — a última rodando o robô PRÉ-1.1.0.
--
-- O que já se sabe sem tocar no banco, lendo o artefato que foi instalado nela
-- (robo-autorizador/instalador-laptop_sede.zip, fora do git por .gitignore:58):
--
--   * worker.js de 19/06/2026, sem versão nenhuma no package.json — por isso
--     `maquinas.app_version` é NULL enquanto `last_seen` anda: o heartbeat dela
--     é um `UPDATE maquinas SET last_seen` cru (worker.js:169-177), não a RPC.
--   * `SUPABASE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no .env são a MESMA chave,
--     role=service_role, válida até 2036. Todo acesso dela ignora RLS.
--   * Pega tarefa com `select ... eq(status,'pendente').eq(machine_id,…)` e
--     trava com compare-and-swap — nunca passa por `robo_buscar_tarefa`, então
--     nenhum guarda de fila envenenada se aplica a ela.
--   * Ao concluir, o rpa.js dela grava só status/forma_autorizacao/
--     validacao_finalizada_em/numero_autorizacao. NÃO grava `completed_at`.
--     `robo_concluir_tarefa` grava (20260813100200_robo_rpcs.sql:292).
--     >>> Esse é o dedo-duro: concluído com completed_at NULL = código legado.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A linha inteira, com os dois relógios lado a lado.
--    `last_seen`/`created_at` são `timestamp without time zone` em UTC;
--    `updated_at` e as colunas de token são timestamptz. Comparar cru mente.
-- ---------------------------------------------------------------------------
SELECT
  m.id, m.nome, m.hostname, m.ip, m.sistema_operacional, m.navegador,
  m.ativa, m.restart_solicitado,
  m.app_version, m.ultima_atualizacao,
  (m.last_seen  AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS visto_em_sp,
  (m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS criada_em_sp,
  (m.updated_at AT TIME ZONE 'America/Sao_Paulo')                    AS atualizada_em_sp,
  (m.token_criado_em   AT TIME ZONE 'America/Sao_Paulo')             AS token_criado_sp,
  (m.token_revogado_em AT TIME ZONE 'America/Sao_Paulo')             AS token_revogado_sp,
  m.user_id, u.nome AS humano_da_estacao
  FROM public.maquinas m
  LEFT JOIN public.usuarios u ON u.id = m.user_id
 WHERE m.id = 'laptop_sede';


-- ---------------------------------------------------------------------------
-- 2. A pergunta que decide tudo: ela TRABALHA ou só bate o coração?
--    O heartbeat legado é um setInterval separado do laço (worker.js:169), logo
--    processo zumbi continua "vivo" no painel sem executar nada.
--    Zero linhas aqui = desligar a máquina não custa nada a ninguém.
-- ---------------------------------------------------------------------------
SELECT
  date_trunc('day', f.created_at)::date AS dia,
  f.status,
  count(*)                              AS tarefas,
  count(*) FILTER (WHERE f.completed_at IS NULL AND f.status = 'concluido') AS concluidas_por_codigo_legado
  FROM public.fila_autorizacoes f
 WHERE f.machine_id = 'laptop_sede'
   AND f.created_at > now() - interval '90 days'
 GROUP BY 1, 2
 ORDER BY 1 DESC, 2;


-- ---------------------------------------------------------------------------
-- 3. As últimas tarefas dela, cruas — quem pediu, o que saiu, por qual caminho.
--    `criado_por` vem do trigger machine_id -> maquinas.user_id -> usuarios.nome
--    e `laptop_sede` não tem user_id, então deve vir vazio (ver
--    [criado_por via maquinas], migration 20260730000000).
-- ---------------------------------------------------------------------------
SELECT
  f.id, f.paciente_nome, f.data_atendimento, f.horario, f.tuss,
  f.status, f.criado_por, f.completion_type,
  f.numero_autorizacao, f.forma_autorizacao,
  (f.created_at   AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS criada_sp,
  (f.completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS concluida_sp,
  f.completed_at IS NULL AND f.status = 'concluido' AS fechou_pelo_codigo_legado,
  f.error_message
  FROM public.fila_autorizacoes f
 WHERE f.machine_id = 'laptop_sede'
 ORDER BY f.created_at DESC
 LIMIT 50;


-- ---------------------------------------------------------------------------
-- 4. O rastro de execução. O worker legado escreve em `public.logs` com
--    origem='worker' — a MESMA tabela que `robo_registrar_log` usa, então a
--    tabela não distingue as duas gerações; o machine_id da fila é que sim.
-- ---------------------------------------------------------------------------
SELECT
  (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS quando_sp,
  l.nivel, l.origem, l.mensagem, l.fila_id
  FROM public.logs l
  JOIN public.fila_autorizacoes f ON f.id = l.fila_id
 WHERE f.machine_id = 'laptop_sede'
 ORDER BY l.created_at DESC
 LIMIT 100;


-- ---------------------------------------------------------------------------
-- 5. A tabela `autorizacoes` também carrega machine_id (FK do dump baseline).
--    É a geração anterior à fila; vale checar se ela ainda escreve ali.
-- ---------------------------------------------------------------------------
SELECT
  count(*) AS total,
  max(a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS ultima_sp
  FROM public.autorizacoes a
 WHERE a.machine_id = 'laptop_sede';


-- ---------------------------------------------------------------------------
-- 5b. QUEM É O USUÁRIO DA MÁQUINA.
--
-- O cadastro não responde: `maquinas.user_id` é NULL em laptop_sede (é por isso
-- que `humano_da_estacao` volta vazio). Quem responde é o comportamento.
--
-- O /solicitar descobre o machine_id perguntando ao worker LOCAL em
-- http://127.0.0.1:3010/machine-id (frontend/lib/machine.ts) e grava
-- `criado_por`/`usuario_id` com o usuário logado no navegador
-- (services/autorizacoes.service.ts:179). Logo: linha da fila com
-- machine_id='laptop_sede' = alguém sentado NAQUELE PC, logado com a própria conta.
--
-- E aqui o nome é confiável de verdade: o trigger `fn_set_criado_por` e o
-- backfill de 30/07 só preenchem quando `criado_por` está nulo E a máquina tem
-- `user_id` — que laptop_sede não tem. Nenhum nome nessa lista foi inferido.
-- ---------------------------------------------------------------------------
SELECT
  coalesce(f.criado_por, '(sem nome)')                                  AS pessoa,
  count(*)                                                              AS solicitacoes,
  min(f.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS primeira_sp,
  max(f.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS ultima_sp
  FROM public.fila_autorizacoes f
 WHERE f.machine_id = 'laptop_sede'
 GROUP BY 1
 ORDER BY solicitacoes DESC;

-- Confirmação por outra tabela, independente da fila: logs_execucao carrega
-- machine_id e user_id na mesma linha.
SELECT
  u.nome, u.email,
  count(*)                                                              AS eventos,
  max(l.created_at AT TIME ZONE 'America/Sao_Paulo')                    AS ultimo_sp
  FROM public.logs_execucao l
  LEFT JOIN public.usuarios u ON u.id = l.user_id
 WHERE l.machine_id = 'laptop_sede'
 GROUP BY u.nome, u.email
 ORDER BY eventos DESC;

-- Terceira via, geração antiga da tabela `autorizacoes` (tem usuario_id direto).
SELECT
  u.nome,
  count(*)                                                                AS registros,
  max(a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')   AS ultimo_sp
  FROM public.autorizacoes a
  LEFT JOIN public.usuarios u ON u.id = a.usuario_id
 WHERE a.machine_id = 'laptop_sede'
 GROUP BY u.nome
 ORDER BY registros DESC;


-- ---------------------------------------------------------------------------
-- 6. Varredura geral do dedo-duro: QUALQUER máquina que ainda feche tarefa por
--    código legado, mesmo que hoje reporte 1.1.6. Pega regressão de instalação
--    (alguém que reinstalou o pacote antigo por cima).
-- ---------------------------------------------------------------------------
SELECT
  f.machine_id,
  count(*)                                                             AS concluidas,
  count(*) FILTER (WHERE f.completed_at IS NULL)                       AS sem_completed_at,
  max(f.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS ultima_sp
  FROM public.fila_autorizacoes f
 WHERE f.status = 'concluido'
   AND f.created_at > timestamp '2026-08-14 00:00:00'   -- depois do runbook 1.1.x
 GROUP BY f.machine_id
 HAVING count(*) FILTER (WHERE f.completed_at IS NULL) > 0
 ORDER BY sem_completed_at DESC;
