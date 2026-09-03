-- =============================================================================
-- O aviso de glosa passa a sair como ClickBot, não como uma pessoa
-- =============================================================================
-- O aviso de glosa chega no ClickUp assinado pela conta pessoal cujo token está
-- em CLICKUP_TOKEN. Quem lê o canal responde a essa pessoa, que não escreveu
-- nada: quem escreveu foi o cron.
--
-- A API de Chat v3 do ClickUp não tem campo de autor no request, então não há
-- como trocar isso pelo caminho direto. O que existe é o conector oficial do
-- ClickUp no Zapier: a action `createChatMessage` aceita `send_as_bot`, e com ele
-- a mensagem sai como **ClickBot**. Comprovado em 2026-09-03 por HTTP puro, sem
-- SDK (supabase/snippets/zapier-clickbot-counterproof.mjs).
--
-- O NOME NÃO É ESCOLHÍVEL. "ClickBot" é a identidade genérica do próprio
-- ClickUp; o inventário dos 14 campos reais da action
-- (supabase/snippets/zapier-clickbot-campos.mjs) não tem nenhum de nome ou
-- avatar, e o pedido por bot nomeado segue aberto no feedback deles. Por isso o
-- carimbo "🤖 Robô de Avisos" continua no corpo da mensagem: é o cabeçalho que
-- diz QUAL robô, já que o autor só sabe dizer QUE é um robô.
--
-- ESTA MIGRATION NÃO LIGA NADA. `zapier_ativo` nasce FALSE de propósito: sem os
-- secrets ZAPIER_CLIENT_ID/ZAPIER_CLIENT_SECRET a função cairia no fallback a
-- cada aviso, trocando uma entrega direta que funciona por uma tentativa
-- inútil. Ligar é um UPDATE explícito, depois dos secrets configurados.
-- =============================================================================

ALTER TABLE public.glosa_avisos_config
  ADD COLUMN IF NOT EXISTS zapier_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zapier_connection_id text,
  ADD COLUMN IF NOT EXISTS zapier_selected_api text NOT NULL DEFAULT 'ClickUpCLIAPI@2.1.63';

COMMENT ON COLUMN public.glosa_avisos_config.zapier_ativo IS
  'Quando true, o aviso é publicado via Zapier e sai como ClickBot. Quando false '
  '(padrão), vai direto na api.clickup.com e sai como a pessoa dona do '
  'CLICKUP_TOKEN. Exige os secrets ZAPIER_CLIENT_ID e ZAPIER_CLIENT_SECRET.';

COMMENT ON COLUMN public.glosa_avisos_config.zapier_connection_id IS
  'A conexão ClickUp autorizada no Zapier (authentication_id no wire). É ela que '
  'carrega o OAuth; sem ela o Zapier não sabe em nome de quem falar.';

COMMENT ON COLUMN public.glosa_avisos_config.zapier_selected_api IS
  'Implementação e versão do conector, ex.: ClickUpCLIAPI@2.1.63. Fica em config '
  'porque a versão muda do lado do Zapier, sem aviso, e um deploy só para trocar '
  'uma string seria desnecessário.';

-- O canal e o workspace NÃO ganham coluna nova: o Zapier chama de `view_id` e
-- `team_id` exatamente os mesmos ids que já estão em `clickup_channel_id` e
-- `clickup_workspace_id`. Duplicá-los criaria duas fontes para o mesmo fato, e
-- um dia elas discordariam.

UPDATE public.glosa_avisos_config
   SET zapier_connection_id = COALESCE(zapier_connection_id, '02c96d4d-1deb-877a-892a-544525ce469f')
 WHERE id = 1;
