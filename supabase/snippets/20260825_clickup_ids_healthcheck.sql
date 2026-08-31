-- =============================================================================
-- Configurar o destino do aviso de "ASSIM fora do ar" no ClickUp
-- =============================================================================
-- A Edge Function `assim-healthcheck` posta no canal de Chat
-- #suporte-recepção-autorização. Ela precisa de duas coisas:
--
--   1. O TOKEN, que é segredo e NÃO entra neste arquivo nem em nenhum outro do
--      repositório (que é público). Vai por:
--
--          supabase secrets set CLICKUP_TOKEN=pk_...
--
--      Gerar o token a partir de uma CONTA DE SERVIÇO, não da conta de um admin:
--      no ClickUp o token pessoal carrega todas as permissões de quem o gerou, e
--      não existe escopo reduzido. Quem tiver o token age como aquela pessoa.
--
--   2. O workspace_id e o channel_id, que não são segredo e ficam na tabela.
--      Descobrir uma vez, com os dois comandos abaixo, e rodar o UPDATE no fim.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — o id do workspace
-- ─────────────────────────────────────────────────────────────────────────────
-- No ClickUp, "team" é o nome legado de workspace: o `id` que vem aqui é o
-- workspace_id que a API v3 pede.
--
--   curl -s https://api.clickup.com/api/v2/team \
--     -H "Authorization: pk_SEU_TOKEN"
--
-- (o token vai CRU no header, sem "Bearer" — isso vale só para token pessoal)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — o id do canal
-- ─────────────────────────────────────────────────────────────────────────────
-- Procurar "suporte-recepção-autorização" na resposta. Os ids de canal são
-- STRING, não número — copiar como texto, com aspas.
--
--   curl -s "https://api.clickup.com/api/v3/workspaces/SEU_WORKSPACE_ID/chat/channels?limit=100" \
--     -H "Authorization: pk_SEU_TOKEN"
--
-- Se a lista vier paginada, seguir o `next_cursor` da resposta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — gravar
-- ─────────────────────────────────────────────────────────────────────────────

-- Descobertos em 2026-08-25 pelos dois comandos acima. Não são segredo (o token
-- é, e vive nos secrets da Edge Function), então ficam registrados: sem eles,
-- reconfigurar exigiria refazer a descoberta com um token em mão.
--   workspace 9011600909    = "Grupo Universo ABA - Saúde e Inclusão"
--   canal     8cj47gd-16891 = "suporte-recepção-autorização"
-- Cuidado ao procurar o canal na mão: existem quatro nomes parecidos no mesmo
-- workspace (recepção-aberto, autorização-aberto, Solicitações Autorização).
UPDATE public.assim_healthcheck
   SET clickup_workspace_id = '9011600909',
       clickup_channel_id   = '8cj47gd-16891',
       updated_at           = now()
 WHERE id = 1;

-- Conferir o que ficou valendo, incluindo a URL herdada do robô:
SELECT h.ativo,
       coalesce(h.url_override, r.assim_login_url) AS url_sondada,
       h.marcador_html,
       h.tentativas,
       h.timeout_ms,
       h.janela_inicio,
       h.janela_fim,
       h.janela_dias,
       h.clickup_workspace_id,
       h.clickup_channel_id,
       h.status,
       h.desde,
       h.ultima_checagem,
       h.notificacao_pendente
  FROM public.assim_healthcheck h
  LEFT JOIN public.robo_config r ON r.id = 1
 WHERE h.id = 1;

-- =============================================================================
-- OPERAÇÃO DO DIA A DIA
-- =============================================================================

-- Quanto tempo a ASSIM ficou fora, por dia, no último mês.
-- Conta intervalos entre checagens, então a resolução é o passo do cron (5 min).
SELECT (checado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       count(*) FILTER (WHERE status = 'offline') * 5      AS minutos_fora_aprox,
       count(*)                                            AS checagens,
       round(100.0 * count(*) FILTER (WHERE status = 'online') / count(*), 2) AS pct_disponivel
  FROM public.assim_healthcheck_log
 WHERE checado_em >= now() - interval '30 days'
 GROUP BY 1
 ORDER BY 1 DESC;

-- As últimas falhas, com o motivo.
SELECT checado_em, status, http_status, latencia_ms, erro
  FROM public.assim_healthcheck_log
 WHERE status = 'offline'
 ORDER BY checado_em DESC
 LIMIT 30;

-- Silenciar a sonda (manutenção programada da ASSIM, por exemplo). Ela continua
-- registrando o histórico? NÃO — `ativo = false` para a sonda inteira, antes da
-- checagem. Para checar sem avisar, zerar a janela em vez disso:
--   UPDATE public.assim_healthcheck SET janela_dias = '{}' WHERE id = 1;
-- UPDATE public.assim_healthcheck SET ativo = false WHERE id = 1;
-- UPDATE public.assim_healthcheck SET ativo = true  WHERE id = 1;

-- O estado do agendamento e as últimas execuções.
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'healthcheck-assim';

SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'healthcheck-assim'
 ORDER BY d.start_time DESC
 LIMIT 10;
