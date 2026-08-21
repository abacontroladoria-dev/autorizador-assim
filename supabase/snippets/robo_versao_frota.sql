-- Versão do robo-autorizador em cada máquina da frota.
--
-- Contexto:
--   * app_version é preenchido pelo heartbeat (robo_heartbeat, 1.1.x). Máquina
--     com last_seen recente e app_version NULL está rodando o robô LEGADO
--     (o que carrega service_role e fura os guardas da fila).
--   * maquinas.last_seen é `timestamp without time zone` gravado com now(),
--     ou seja, UTC. Aqui ele é convertido para hora de São Paulo.
--   * A versão "esperada" é o último pacote publicado em robo_pacotes.

WITH publicada AS (
  SELECT versao
    FROM public.robo_pacotes
   WHERE publicado
   ORDER BY created_at DESC
   LIMIT 1
)
SELECT
  m.id                                                            AS machine_id,
  m.nome,
  m.hostname,
  coalesce(m.app_version, '—')                                    AS versao_instalada,
  p.versao                                                        AS versao_publicada,
  CASE
    WHEN m.last_seen IS NULL                       THEN 'nunca conectou'
    WHEN m.token_revogado_em IS NOT NULL           THEN 'revogada'
    WHEN m.ativa IS NOT TRUE                       THEN 'inativa'
    WHEN m.app_version IS NULL                     THEN 'LEGADO (sem heartbeat)'
    WHEN m.app_version = p.versao                  THEN 'atualizada'
    ELSE                                                'atrasada'
  END                                                             AS situacao,
  (m.last_seen AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS visto_em_sp,
  date_trunc('second', now() - (m.last_seen AT TIME ZONE 'UTC'))   AS ha,
  (m.ultima_atualizacao AT TIME ZONE 'America/Sao_Paulo')          AS atualizou_em_sp,
  m.token_hash IS NOT NULL                                        AS tem_token,
  m.token_revogado_em IS NOT NULL                                 AS revogada,
  m.ativa,
  u.nome                                                          AS humano_da_estacao
  FROM public.maquinas m
  LEFT JOIN public.usuarios u ON u.id = m.user_id
  CROSS JOIN publicada p
 ORDER BY
   (m.last_seen IS NULL),                       -- quem nunca apareceu vai pro fim
   (m.app_version IS DISTINCT FROM p.versao) DESC,  -- problemas primeiro
   m.last_seen DESC;


-- ---------------------------------------------------------------------------
-- Segunda parte: o que uma máquina LEGADO está de fato executando.
--
-- Máquina com last_seen vivo e app_version NULL não passou por robo_heartbeat:
-- o worker 1.1.x sempre manda p_versao (worker.js:121 -> versaoAtual(), que lê
-- versao.json ou package.json e nunca devolve nulo). Logo, quem escreveu aquele
-- last_seen escreveu direto na tabela — código pré-1.1.0, com service_role.
-- Esta query mostra se esse processo ainda pega trabalho da fila.
-- ---------------------------------------------------------------------------

SELECT
  f.machine_id,
  f.status,
  count(*)                                        AS tarefas,
  min(f.created_at AT TIME ZONE 'America/Sao_Paulo') AS primeira,
  max(f.created_at AT TIME ZONE 'America/Sao_Paulo') AS ultima
  FROM public.fila_autorizacoes f
 WHERE f.machine_id IS NOT NULL
   AND f.created_at > now() - interval '7 days'
 GROUP BY f.machine_id, f.status
 ORDER BY f.machine_id, tarefas DESC;
