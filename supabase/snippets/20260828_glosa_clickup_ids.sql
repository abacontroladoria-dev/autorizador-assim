-- =============================================================================
-- Configurar e operar o aviso automático de glosa no ClickUp
-- =============================================================================
-- ORDEM DAS MIGRATIONS (importa)
--   20260828120000_glosa_avisa_clickup.sql              <- base. APLICADA em prod
--                                                          (cron ativo em 28/08)
--   20260828140000_glosa_aviso_nome_exibicao_terapia.sql <- pendente: coluna
--       terapia_exibicao_id + trigger que a preenche, para a mensagem mostrar
--       "Psicologia ABA (Aplicador ABA (PS))" em vez do jargão do TiTa.
--
-- A segunda existe como ALTER avulso porque a primeira já rodou: reaplicar o
-- arquivo dela NÃO acrescentaria a coluna (`CREATE TABLE IF NOT EXISTS` não
-- altera tabela existente) e a coluna faltaria em silêncio. Depois de aplicar a
-- 140000, redeploy da Edge Function:  supabase functions deploy glosa-clickup
-- =============================================================================
-- A Edge Function `glosa-clickup` posta a recusa da ASSIM num canal de Chat do
-- ClickUp. Ela precisa de duas coisas:
--
--   1. O TOKEN, que é segredo e NÃO entra neste arquivo nem em nenhum outro do
--      repositório (que é público). JÁ EXISTE em produção, posto para o
--      healthcheck da ASSIM em 2026-08-25:
--
--          supabase secrets set CLICKUP_TOKEN=pk_...
--
--      Conferir se ainda está lá com `supabase secrets list`. Se estiver, NÃO
--      precisa fazer nada: as duas funções leem o mesmo secret.
--
--   2. O workspace_id e o channel_id, que não são segredo e ficam na tabela.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTREIA NO CANAL DE TESTE, DEPOIS NO DA EQUIPE  (decisão do usuário, 2026-08-28)
-- ─────────────────────────────────────────────────────────────────────────────
-- O destino é config, não código — então a primeira mensagem vai para o canal de
-- teste e a virada para o da equipe é um UPDATE, sem redeploy. Isso existe porque
-- mensagem no canal errado é pior que mensagem nenhuma: há QUATRO canais de nome
-- parecido neste workspace (suporte-recepção-autorização, autorização-aberto,
-- recepção-aberto, Solicitações Autorização).
--
-- Canal de teste escolhido: `tecnologia-dev`. Preferido a um DM por três razões —
-- o id é estável e já conhecido (DM na API v3 vem SEM `name`, só `"type":"DM"`, e
-- descobrir qual é o seu exigiria uma chamada de members por DM), não precisa de
-- mais nenhuma ida à API, e a mensagem chega assinada como chegará para a equipe.
--
-- Ids descobertos em 2026-08-28 (não são segredo; o token é, e vive nos secrets):
--   workspace 9011600909    = "Grupo Universo ABA - Saúde e Inclusão"
--   canal     8cj47gd-16871 = "tecnologia-dev"                 <- teste
--   canal     8cj47gd-16891 = "suporte-recepção-autorização"   <- produção
--
-- PASSO 1 — gravar o destino de teste e ligar:

UPDATE public.glosa_avisos_config
   SET clickup_workspace_id = '9011600909',      -- Grupo Universo ABA - Saúde e Inclusão
       clickup_channel_id   = '8cj47gd-16871',   -- tecnologia-dev (canal de teste)
       mencionar            = '@Victoria França @Aline Notes @Luana Calixto',
       ativo                = true,
       updated_at           = now()
 WHERE id = 1;

-- PASSO 2 — provocar um aviso de teste, SEM esperar uma glosa real.
-- Escolhe a glosa mais recente que já existe e a recoloca na outbox.
-- (Se preferir esperar uma glosa de verdade, pule este bloco.)
/*
INSERT INTO public.glosa_avisos (
  fila_id, paciente_nome, motivo, guia, horario_autorizacao, data_atendimento,
  terapia, tuss, matricula, recepcionista
)
SELECT f.id, f.paciente_nome, f.status_assim, f.numero_autorizacao,
       f.horario_autorizacao, f.data_atendimento, f.terapia_nome, f.tuss,
       nullif(concat_ws('.', f.empresa, f.matricula, f.dep), ''), f.criado_por
  FROM public.fila_autorizacoes f
 WHERE f.status = 'glosa'
 ORDER BY f.completed_at DESC NULLS LAST
 LIMIT 1
ON CONFLICT (fila_id) DO UPDATE
   SET enviado_em = NULL, ultimo_erro = NULL;   -- reenvia mesmo se já foi
*/

-- PASSO 3 — disparar à mão e ver o resultado (não espera o cron):
--   SELECT public.fn_glosa_avisos_disparar();
--
-- Ou invocando a função direto, que devolve o resumo em JSON — melhor para o
-- primeiro teste, porque o corpo da resposta diz o que aconteceu com cada aviso
-- (`enviados`, `falhas`), enquanto o net.http_post é assíncrono e não devolve nada:
--   curl -i -X POST "https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/glosa-clickup" \
--     -H "Authorization: Bearer SUA_SERVICE_ROLE_KEY"
--
-- Conferir a mensagem em https://app.clickup.com/9011600909/chat/r/8cj47gd-16871

-- PASSO 4 — depois de conferir o formato no tecnologia-dev, virar para a equipe.
-- É onde o healthcheck da ASSIM já posta, então o canal já está provado.
-- CUIDADO ao trocar este id na mão: existem quatro nomes parecidos no workspace
-- (recepção-aberto, autorização-aberto, Solicitações Autorização).
/*
UPDATE public.glosa_avisos_config
   SET clickup_channel_id = '8cj47gd-16891',   -- suporte-recepção-autorização
       updated_at         = now()
 WHERE id = 1;
*/

-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- O que está valendo agora.
SELECT ativo, clickup_workspace_id, clickup_channel_id, mencionar, janela_horas
  FROM public.glosa_avisos_config WHERE id = 1;

-- A fila de envio. `enviado_em` nulo = ainda vai sair na próxima passada do cron.
SELECT id, paciente_nome, motivo, guia, matricula, terapia, recepcionista,
       criado_em, enviado_em, tentativas, ultimo_erro
  FROM public.glosa_avisos
 ORDER BY criado_em DESC
 LIMIT 20;

-- Avisos presos: saíram várias vezes e nunca foram entregues. `ultimo_erro` diz
-- por quê (401 = token; 404 = canal errado; 4xx do ClickUp não melhora sozinho).
SELECT paciente_nome, tentativas, ultimo_erro, criado_em
  FROM public.glosa_avisos
 WHERE enviado_em IS NULL AND tentativas >= 3
 ORDER BY criado_em;

-- O estado do agendamento e as últimas execuções.
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'glosa-avisa-clickup';

SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'glosa-avisa-clickup'
 ORDER BY d.start_time DESC
 LIMIT 10;

-- Glosa que virou aviso x glosa que não virou. Serve para responder "por que
-- aquela recusa não apareceu no canal?" — a causa quase sempre é a janela de
-- retroatividade (o sync do relatório carimbando uma glosa antiga).
SELECT f.paciente_nome,
       f.data_atendimento,
       f.status_assim,
       (f.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS concluido_local,
       a.id IS NOT NULL   AS virou_aviso,
       a.enviado_em
  FROM public.fila_autorizacoes f
  LEFT JOIN public.glosa_avisos a ON a.fila_id = f.id
 WHERE f.status = 'glosa'
 ORDER BY f.completed_at DESC NULLS LAST
 LIMIT 30;

-- =============================================================================
-- OPERAÇÃO DO DIA A DIA
-- =============================================================================

-- Silenciar (manutenção, mudança de canal, ClickUp fora do ar). O trigger para de
-- enfileirar na hora; o que já está na outbox continua lá e sai quando religar.
-- UPDATE public.glosa_avisos_config SET ativo = false WHERE id = 1;
-- UPDATE public.glosa_avisos_config SET ativo = true  WHERE id = 1;

-- Trocar quem é citado (o @ é decorativo: a API de chat v3 do ClickUp NÃO
-- notifica por menção — quem acompanha o canal vê).
-- UPDATE public.glosa_avisos_config
--    SET mencionar = '@Nome Um @Nome Dois', updated_at = now()
--  WHERE id = 1;

-- Desistir de um aviso preso, sem apagar o histórico.
-- UPDATE public.glosa_avisos SET enviado_em = now(), ultimo_erro = 'descartado a mao'
--  WHERE id = <id>;

-- Reenviar um aviso já entregue (confirmar que a mensagem some/reaparece).
-- UPDATE public.glosa_avisos SET enviado_em = NULL WHERE id = <id>;
