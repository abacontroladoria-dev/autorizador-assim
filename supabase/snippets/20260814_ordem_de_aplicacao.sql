-- =============================================================================
-- ORDEM DE APLICAÇÃO — 2026-08-14
-- glosa + correções do robô + "solicitado por" no card
-- =============================================================================
-- Passos de SQL rodam no SQL Editor. Passos de terminal estão como comentário,
-- marcados com >>>. Siga na ordem: há dependências reais entre as fases.
--
-- NÃO use `supabase db push`. Ele não escolhe arquivo: empurra as SETE migrations
-- pendentes, incluindo 20260814100000_cron_token_do_vault e
-- 20260814100100_cco_cron_aposentar, que são de outro assunto (rotação da
-- service_role e aposentadoria dos jobs cco-*). Se você quiser essas duas hoje,
-- ótimo — mas que seja decisão, não efeito colateral.
-- =============================================================================


-- ###########################################################################
-- FASE 0 — PARAR A FROTA (faça isto primeiro)
-- ###########################################################################
-- Ainda existem linhas em 'pendente' de DIAS PASSADOS, soltas pelo
-- "Liberar processos travados". Enquanto o robô estiver ativo ele pode pegar
-- uma delas a qualquer segundo — e autorizar sessão de outro dia não tem volta:
-- a ASSIM carimba data_execucao no instante da autorização.
--
-- Pausar não perde nada: robo_buscar_tarefa devolve NULL para máquina inativa.

UPDATE public.maquinas SET ativa = false;

SELECT id, nome, ativa FROM public.maquinas ORDER BY id;


-- ###########################################################################
-- FASE 1 — LIMPAR O ESTRAGO DO release-stuck
-- ###########################################################################
-- Rode supabase/snippets/20260814_release_stuck_estrago.sql:
--   Seção 1  (diagnóstico, read-only) — veja o tamanho
--   Seção 3a (as que já têm guia -> concluido)
--   Seção 3b (as de dias passados sem guia -> erro, com o motivo escrito)
-- Não faça a 3c ainda: religar as máquinas é a última fase daqui.


-- ###########################################################################
-- FASE 2 — MIGRATIONS, uma a uma, nesta ordem
-- ###########################################################################
-- Cole o conteúdo de cada arquivo no SQL Editor e execute. Depois registre no
-- livro-caixa (bloco no fim desta fase), senão a próxima vez que alguém rodar
-- `db push` a migration é reaplicada.
--
--   1. 20260813130000_robo_conclui_glosa.sql
--      TEM de vir antes de publicar o robô. Ela dropa a assinatura de 7 args e
--      cria a de 8 com DEFAULT; a frota 1.1.4 chama por nome com 7 e continua
--      resolvendo. Na ordem inversa, toda máquina do campo para de concluir
--      tarefa até o auto-update passar.
--
--   2. 20260813130100_solicitar_reconhece_glosa.sql
--   3. 20260813130200_alerta_glosa_no_aceite.sql
--   4. 20260814120000_sync_assim_conclui_pendente.sql
--
--   5. 20260814130000_central_autorizacoes_criado_por.sql
--      Contém a definição da 130100 mais o criado_por. Aplicar depois da 2 é
--      idempotente — a ordem numérica já resolve.

-- Livro-caixa: rode DEPOIS de aplicar cada uma (ou todas de uma vez no fim).
-- INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
--   ('20260813130000', 'robo_conclui_glosa'),
--   ('20260813130100', 'solicitar_reconhece_glosa'),
--   ('20260813130200', 'alerta_glosa_no_aceite'),
--   ('20260814120000', 'sync_assim_conclui_pendente'),
--   ('20260814130000', 'central_autorizacoes_criado_por')
-- ON CONFLICT (version) DO NOTHING;

-- Conferência da fase: as 5 assinaturas/funções no ar.
-- SELECT proname, pg_get_function_identity_arguments(oid)
-- FROM pg_proc WHERE proname IN ('robo_concluir_tarefa','sync_assim_results','listar_central_autorizacoes')
-- ORDER BY proname;


-- ###########################################################################
-- FASE 3 — DESENVENENAR A FILA
-- ###########################################################################
-- Com a 20260814120000 no ar, a própria função resolve: 'Liberado' com guia
-- conclui a partir de 'pendente'.

-- SELECT public.sync_assim_results();

-- Tem de voltar 0 (seção 3 de 20260814_fila_envenenada.sql):
-- SELECT count(*) AS ainda_envenenadas
-- FROM public.fila_autorizacoes
-- WHERE status IN ('pendente','processando') AND numero_autorizacao IS NOT NULL;


-- ###########################################################################
-- FASE 4 — EDGE FUNCTION
-- ###########################################################################
-- >>> supabase functions deploy automation-release-stuck
--
-- Sem isto, o botão continua sem filtro de data e de guia — e o incidente de
-- hoje pode se repetir no próximo clique.


-- ###########################################################################
-- FASE 5 — FRONTEND
-- ###########################################################################
-- >>> git add -A && git commit && git push
--     Push só funciona com o token gh de abacontroladoria-dev (SSH é recusado, e
--     `git fetch` falha CALADO — as refs mentem).
-- >>> Coolify: redeploy MANUAL. Não há webhook.
--
-- Ordem com a Fase 2 é indiferente: se o frontend subir antes da migration,
-- p.criado_por vem undefined e o selo só não mostra o nome. Não quebra.


-- ###########################################################################
-- FASE 6 — ROBÔ 1.1.6
-- ###########################################################################
-- >>> cd robo-autorizador
-- >>> node publicar.js publicar
--
-- Precisa da chave privada em %USERPROFILE%\.robo-autorizador\assinatura-privada.pem
-- (ou ROBO_CHAVE_PRIVADA=<caminho>). Sem ela este passo trava.
--
-- O comando gera pacote-1.1.6.json e IMPRIME o INSERT em robo_pacotes. O pacote
-- nasce com publicado = false — de propósito. Liberar para a frota é o bloco 6
-- de supabase/snippets/robo_provisionar.sql, um passo separado e consciente.
--
-- O que a 1.1.6 entrega: o reconhecimento de glosa (era a 1.1.5, nunca publicada)
-- e o heartbeat que não para durante a tarefa.

-- Confira o que a frota enxerga hoje antes de publicar:
-- SELECT versao, publicado, created_at FROM public.robo_pacotes ORDER BY created_at DESC LIMIT 5;


-- ###########################################################################
-- FASE 7 — RELIGAR
-- ###########################################################################
-- Só depois da Fase 1 concluída. Se religar antes, o robô pega as linhas de
-- dias passados que ainda não foram tratadas.

-- UPDATE public.maquinas SET ativa = true;

-- Acompanhe os primeiros minutos: last_seen tem de ficar abaixo de 90s mesmo com
-- tarefa em andamento — é exatamente o que a 1.1.6 conserta.
-- SELECT id, ativa, app_version, now() - last_seen AS silencio
-- FROM public.maquinas ORDER BY id;
