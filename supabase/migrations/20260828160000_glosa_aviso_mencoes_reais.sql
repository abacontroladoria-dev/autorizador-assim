-- =============================================================================
-- O aviso de glosa passa a MENCIONAR de verdade no ClickUp
-- =============================================================================
-- O QUE MUDA
-- `mencionar` era texto solto ("@Victoria França @Aline Notes @Luana Calixto")
-- que renderizava e não avisava ninguém. Agora existe `mencionar_usuarios`
-- (jsonb): pares nome+id que a Edge Function monta como
-- `[@Nome](#user_mention#{id})` — a sintaxe que o ClickUp reconhece como menção.
--
-- COMO ESSA SINTAXE FOI DESCOBERTA (2026-08-28) — importa, porque ela NÃO está
-- na doc oficial e ninguém vai reencontrá-la por leitura:
--
-- Sete candidatos enviados pela API, cada um com o `message_id` colhido e
-- conferido em GET /v3/workspaces/{ws}/chat/messages/{id}/tagged_users:
--
--   @Nome (texto puro, o controle) ......... tagged_users vazio
--   followers: [ids] (campo do POST) ....... 201, tagged_users vazio
--   clickup://user/{id} .................... tagged_users vazio
--   [@Nome](clickup://user/{id}) ........... tagged_users vazio
--   [@Nome](user:{id}) ..................... tagged_users vazio
--   [@Nome](#user_mention{id}) ............. tagged_users vazio   <- sem o # final
--   [@Nome](#user_mention#{id}) ............ ✅ RECONHECEU
--   [Nome](#user_mention#{id}) ............. ✅ RECONHECEU        <- sem @ no rótulo
--
-- TRÊS COISAS QUE ISSO ENSINA, e que a próxima pessoa precisa saber:
--
--   1. O `#` FINAL É OBRIGATÓRIO. `#user_mention#{id}` marca;
--      `#user_mention{id}` não. Um caractere separa funcionar de não funcionar.
--   2. O `@` no rótulo é DECORATIVO. O que resolve a menção é o LINK; o texto do
--      rótulo é só o que se lê. Mantemos o `@` porque é o que a pessoa espera ver.
--   3. O ALVO PRECISA PERTENCER AO CANAL. Na primeira rodada a mesma sintaxe
--      falhou: o app mostrou "undefined não tem acesso a este canal" porque o id
--      testado era de alguém que não é membro daquele canal. Menção para quem não
--      está no canal vira link morto — e é por isso que trocar de canal exige
--      reconferir os ids, não só o channel_id.
--
-- O QUE NÃO ESTÁ PROVADO, e não se deve afirmar: que a menção NOTIFICA. Sabemos
-- que ela é RECONHECIDA (tagged_users) e que renderiza como menção. Notificar é o
-- comportamento normal do ClickUp para menção, mas nesta API já vimos 201 sem
-- efeito nenhum (`followers`). Não anunciar "as três serão notificadas" antes de
-- alguém ver o próprio aparelho apitar.
--
-- POR QUE jsonb, E NÃO TEXTO JÁ MONTADO
-- Guardar "[@Nome](#user_mention#123)" pronto em coluna repetiria o erro que a
-- outbox evita: congelaria no banco uma decisão de FORMATO. Se a ClickUp mudar a
-- sintaxe — e ela é experimental, "subject to change at any time" —, texto pronto
-- exigiria reescrever linha de config; par nome+id exige só redeploy da função.
-- Config guarda FATO (quem citar), a função decide COMO escrever.
-- =============================================================================

ALTER TABLE public.glosa_avisos_config
  ADD COLUMN IF NOT EXISTS mencionar_usuarios jsonb;

COMMENT ON COLUMN public.glosa_avisos_config.mencionar_usuarios IS
  'Quem mencionar, como [{"nome":"...","id":"..."}]. A Edge Function monta [@Nome](#user_mention#id) — sintaxe que o ClickUp reconhece (verificada em tagged_users, 2026-08-28). O id precisa ser de alguém que PERTENÇA ao canal de destino, senão a menção vira link morto ("undefined não tem acesso a este canal"). Substitui a coluna mencionar, que era texto decorativo.';

COMMENT ON COLUMN public.glosa_avisos_config.mencionar IS
  'OBSOLETA desde 2026-08-28. Era texto solto ("@Nome") que renderizava e NÃO notificava ninguém. Usar mencionar_usuarios. Mantida só para não quebrar quem leia a coluna; a Edge Function a ignora quando mencionar_usuarios está preenchida.';

-- Os três ids do canal `suporte-recepção-autorização`, colhidos em 2026-08-28.
-- Não são segredo (o token é, e vive nos secrets).
--
-- ATENÇÃO: estes ids valem para AQUELE canal. As três são members e followers de
-- lá; num canal onde não estejam, a menção não resolve. Ao trocar de canal,
-- reconferir — é a lição 3 do cabeçalho.
UPDATE public.glosa_avisos_config
   SET mencionar_usuarios = jsonb_build_array(
         jsonb_build_object('nome', 'Victoria França', 'id', '87452697'),
         jsonb_build_object('nome', 'Aline Notes',     'id', '87395094'),
         jsonb_build_object('nome', 'Luana Calixto',   'id', '87452695')
       ),
       updated_at = now()
 WHERE id = 1
   AND mencionar_usuarios IS NULL;   -- idempotente: não sobrescreve ajuste manual
