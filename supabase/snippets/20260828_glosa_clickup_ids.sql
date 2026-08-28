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

-- PASSO 4 — A VIRADA PARA A EQUIPE, com as menções reais.
-- Decidida em 2026-08-28, depois de a menção provar que notifica.
--
-- ORDEM QUE IMPORTA — as menções dependem de código novo:
--   a) aplicar 20260828160000_glosa_aviso_mencoes_reais.sql (cria
--      `mencionar_usuarios` e já grava as três);
--   b) supabase functions deploy glosa-clickup;
--   c) só então este UPDATE.
-- Fora dessa ordem, a função lê uma coluna que não existe e cai no texto antigo
-- — a mensagem sai, mas sem notificar ninguém.
--
-- CUIDADO com o channel_id: há quatro nomes parecidos no workspace
-- (recepção-aberto, autorização-aberto, Solicitações Autorização).
--
-- E A ARMADILHA DAS MENÇÕES: **o id só resolve se a pessoa for membro do
-- canal**. Um id de fora vira link morto, e o app mostra "undefined não tem
-- acesso a este canal" ao passar o mouse. As três são members e followers do
-- `suporte-recepção-autorização`; se um dia o canal mudar, RECONFERIR OS IDS,
-- não só o channel_id.

UPDATE public.glosa_avisos_config
   SET clickup_channel_id = '8cj47gd-16891',   -- suporte-recepção-autorização
       mencionar_usuarios = jsonb_build_array(
         jsonb_build_object('nome', 'Victoria França', 'id', '87452697'),
         jsonb_build_object('nome', 'Aline Notes',     'id', '87395094'),
         jsonb_build_object('nome', 'Luana Calixto',   'id', '87452695')
       ),
       mencionar          = NULL,   -- coluna antiga (texto que não notificava)
       updated_at         = now()
 WHERE id = 1;

-- Confirme ANTES de esperar a próxima glosa real:
SELECT ativo,
       CASE clickup_channel_id
         WHEN '8cj47gd-16891' THEN 'OK — suporte-recepcao-autorizacao (EQUIPE)'
         WHEN '8cj47gd-16871' THEN 'ainda no tecnologia-dev (TESTE)'
         ELSE 'CANAL DESCONHECIDO — confira'
       END AS destino,
       jsonb_array_length(coalesce(mencionar_usuarios, '[]'::jsonb)) AS qtd_mencoes,
       mencionar_usuarios
  FROM public.glosa_avisos_config WHERE id = 1;

-- Como a menção vai sair na mensagem (confere a sintaxe sem precisar disparar).
-- O `#` FINAL é obrigatório: sem ele o ClickUp não resolve a menção.
SELECT string_agg(
         format('[@%s](#user_mention#%s)', u->>'nome', u->>'id'), ' '
       ) AS rodape_da_mensagem
  FROM public.glosa_avisos_config c,
       jsonb_array_elements(c.mencionar_usuarios) u
 WHERE c.id = 1;

-- =============================================================================
-- A MENÇÃO QUE FUNCIONA: [@Nome](#user_mention#{id})
-- =============================================================================
-- NÃO ESTÁ NA DOC DO CLICKUP. Descoberta por tentativa em 2026-08-28, e
-- confirmada duas vezes: o GET .../chat/messages/{id}/tagged_users passou a
-- devolver o usuário, E a pessoa mencionada recebeu a notificação. Ninguém vai
-- reencontrar isto lendo documentação — daí o registro.
--
-- Sete candidatos, cada um enviado e conferido em tagged_users:
--
--   @Nome (texto puro, o controle) ........ vazio
--   followers: [ids] (campo do POST) ...... 201, vazio
--   clickup://user/{id} ................... vazio
--   [@Nome](clickup://user/{id}) .......... vazio
--   [@Nome](user:{id}) .................... vazio
--   [@Nome](#user_mention{id}) ............ vazio   <- SEM o # final
--   [@Nome](#user_mention#{id}) ........... ✅ reconheceu E notificou
--   [Nome](#user_mention#{id}) ............ ✅ reconheceu
--
-- TRÊS REGRAS, nenhuma óbvia:
--   1. O `#` FINAL É OBRIGATÓRIO. Um caractere separa menção de link morto.
--   2. O `@` do rótulo é decorativo — o que resolve é o LINK.
--   3. O ALVO PRECISA SER MEMBRO DO CANAL. A 1ª rodada falhou com esta mesma
--      sintaxe porque o id era de alguém de fora; o app mostrava "undefined não
--      tem acesso a este canal". Trocar de canal exige RECONFERIR OS IDS.
--
-- Lição de método: **201 não prova que um campo FAZ algo** — prova só que o
-- request era válido. Foi o que enganou no `followers`.
--
-- Script do teste: supabase/snippets/testar_mention_clickup.mjs
-- Config: `mencionar_usuarios` (jsonb, pares nome+id). A coluna `mencionar`
-- ficou obsoleta — era o texto que não notificava.

-- =============================================================================
-- LIMPEZA DEPOIS DOS TESTES  (2026-08-28)
-- =============================================================================
-- 1. AS LINHAS FABRICADAS. O paciente fictício foi inventado para provocar aviso
--    sem esperar glosa real; ele não corresponde a atendimento nenhum e
--    poluiria qualquer consulta futura à outbox.
--
--    A FK é ON DELETE CASCADE (20260828120000:104), então apagar a linha da
--    fila já leva o aviso junto. O primeiro DELETE continua aqui porque cobre o
--    caso em que o aviso foi INSERIDO à mão (PASSO 2) sobre uma linha de fila
--    que se quer preservar.

DELETE FROM public.glosa_avisos
 WHERE paciente_nome ILIKE '%[TESTE]%'
    OR recepcionista = 'Teste Manual';

DELETE FROM public.fila_autorizacoes
 WHERE paciente_nome ILIKE '%[TESTE]%'
    OR id = 'deadbeef-0000-4000-8000-000000000001';

-- 2. AS GLOSAS REAIS REENVIADAS. Se você usou o PASSO 2 para reenviar um caso
--    de verdade, a linha ficou com enviado_em preenchido e está correta — NÃO
--    apague. Conferir antes de mexer:
--
--    SELECT id, paciente_nome, criado_em, enviado_em, tentativas
--      FROM public.glosa_avisos ORDER BY criado_em DESC LIMIT 10;

-- 3. AS MENSAGENS NO CANAL tecnologia-dev. Ficaram lá as sondas de menção
--    ([teste-mention 1..5]) e os avisos fabricados. Apagar é pela API — o SQL
--    não alcança o ClickUp:
--
--      $env:CLICKUP_TOKEN="pk_..."
--      node supabase/snippets/limpar_mensagens_teste_clickup.mjs            # simula
--      node supabase/snippets/limpar_mensagens_teste_clickup.mjs --apagar   # apaga
--
--    Ele só apaga o que casa com os padrões de teste, num canal só. Mensagem
--    apagada no ClickUp não volta.

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
