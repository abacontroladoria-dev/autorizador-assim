-- Fecha as funções SECURITY DEFINER que estavam executáveis por anon.
--
-- APLICADO EM PRODUÇÃO via SQL Editor em 2026-08-17. Este arquivo é o registro
-- no livro-caixa. Idempotente: revoke e grant podem repetir sem efeito.
--
-- Contexto: docs/warnings-supabase/ANALISE.md §2 e §3.
-- Zera os advisors 0028 (anon_security_definer_function_executable, 55) e
-- 0029 (authenticated_..., 48) — 47 das 55 caem por causa raiz única.
--
-- CAUSA RAIZ: no PostgreSQL toda função nasce com EXECUTE para PUBLIC, e anon e
-- authenticated são membros de PUBLIC. O repositório tinha 30+ linhas de
-- `GRANT EXECUTE ... TO service_role` e apenas 4 `REVOKE ... FROM PUBLIC` —
-- os grants nominais nunca tiraram nada de ninguém. Prova: o revoke de
-- custom_access_token_hook em 20260701000001 tirou de `authenticated, anon`
-- sem tirar de PUBLIC, e a função seguiu aberta aos dois por mais de um mês.
--
-- O QUE NÃO ENTRA AQUI (Grupo E, exposição intencional a anon):
--   public.email_por_username(text)  — login traduz username antes de haver sessão
--   as 7 public.robo_*               — autenticação por token próprio da máquina
-- Essas duas famílias são as ÚNICAS do banco que já tinham REVOKE ... FROM PUBLIC
-- escrito à mão, e são o padrão que este arquivo generaliza.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. GRANTs que precisam existir ANTES dos revokes
-- ─────────────────────────────────────────────────────────────────────────────
-- Estas 4 alcançavam service_role SOMENTE via PUBLIC. Sem o grant explícito, o
-- revoke abaixo tira o único acesso que elas têm e um worker do CRM quebraria
-- em silêncio.
grant execute on function central.ca_current_role()                                     to service_role;
grant execute on function central.current_organization_id()                             to service_role;
grant execute on function central.claim_message_grouping_batch(uuid, integer, interval) to service_role;
grant execute on function central.claim_send_queue_batch(uuid, integer, interval)       to service_role;

-- Helpers de sessão do CRM: citados dentro das policies de 28 tabelas do schema
-- `central`. Se authenticated perder EXECUTE, o CRM inteiro para de responder
-- para usuário logado — expressão de policy é avaliada com a permissão de quem
-- consulta.
grant execute on function central.ca_current_role()         to authenticated;
grant execute on function central.current_organization_id() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Grupo A — só service_role/cron chama
-- ─────────────────────────────────────────────────────────────────────────────
-- upsert_atendimentos e upsert_occurrences eram o pior caso do lote: escrita de
-- dado clínico com a anon key, que é pública por definição, sem login.
revoke all on function public.upsert_atendimentos(jsonb)               from public, anon, authenticated;
revoke all on function public.upsert_occurrences(jsonb)                from public, anon, authenticated;
revoke all on function public.update_dashboard_snapshot()              from public, anon, authenticated;
revoke all on function public.refresh_dashboard_kpis()                 from public, anon, authenticated;
revoke all on function public.fn_sync_grade_csv_em_lotes()             from public, anon, authenticated;
revoke all on function public.fn_sync_grade_execucao_em_lotes(integer) from public, anon, authenticated;
revoke all on function public.detect_r1_autorizacao_pendente()         from public, anon, authenticated;
revoke all on function public.detect_r2_sessao_sem_autorizacao()       from public, anon, authenticated;
revoke all on function public.detect_r3_evolucao_atrasada()            from public, anon, authenticated;
revoke all on function public.detect_r4_falta_terapeuta()              from public, anon, authenticated;
revoke all on function public.detect_r5_substituicao()                 from public, anon, authenticated;
revoke all on function public.detect_r6_falta_paciente()               from public, anon, authenticated;
revoke all on function public.detect_r7_glosa()                        from public, anon, authenticated;
revoke all on function public.detect_sessions_without_authorization()  from public, anon, authenticated;
revoke all on function public.count_test_data()                        from public, anon, authenticated;
revoke all on function public.test_occurrences_view()                  from public, anon, authenticated;

-- Estas duas têm GRANT deliberado a authenticated em migration anterior.
revoke all on function public.fn_alertas_avaliar_assim(date)           from public, anon;
revoke all on function public.fn_orbita_sync_targets()                 from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grupo B — schema central (CRM multi-tenant)
-- ─────────────────────────────────────────────────────────────────────────────
-- PENDENTE, não coberto aqui: seis destas recebem p_organization_id como
-- ARGUMENTO sendo SECURITY DEFINER. Fechar o acesso reduz quem pode chamar, mas
-- enquanto elas não validarem o argumento contra central.current_organization_id()
-- por dentro, quem tem acesso legítimo segue podendo passar QUALQUER org.
revoke all on function central.claim_message_grouping_batch(uuid, integer, interval)    from public, anon, authenticated;
revoke all on function central.claim_send_queue_batch(uuid, integer, interval)          from public, anon, authenticated;
revoke all on function central.cleanup_processed_queues(integer)                        from public, anon, authenticated;
revoke all on function central.get_or_create_conversation_state(uuid, uuid)             from public, anon, authenticated;
revoke all on function central.update_contact_ai_memory(uuid, uuid, jsonb)              from public, anon, authenticated;
revoke all on function central.update_conversation_state(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

revoke all on function central.ca_current_role()         from public, anon;
revoke all on function central.current_organization_id() from public, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grupo D — funções de gatilho
-- ─────────────────────────────────────────────────────────────────────────────
-- O PostgREST não publica função que retorna trigger, então não havia rota
-- /rest/v1/rpc para nenhuma delas — eram ruído do advisor. O EXECUTE de gatilho
-- é conferido no CREATE TRIGGER, não a cada disparo, então revogar não afeta o
-- disparo.
revoke all on function public.handle_new_user()                      from public, anon, authenticated;
revoke all on function public.sync_user_activation()                 from public, anon, authenticated;
revoke all on function public.log_usuario_changes()                  from public, anon, authenticated;
revoke all on function public.log_usuario_permissao_changes()        from public, anon, authenticated;
revoke all on function public.log_authorization_access()             from public, anon, authenticated;
revoke all on function public.audit_rls_access_attempt()             from public, anon, authenticated;
revoke all on function public.fn_set_criado_por()                    from public, anon, authenticated;
revoke all on function public.rls_auto_enable()                      from public, anon, authenticated;
revoke all on function central.update_conversation_last_message_at() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O hook de auth
-- ─────────────────────────────────────────────────────────────────────────────
-- Só supabase_auth_admin precisa. O revoke de 20260701000001 nunca teve efeito
-- por não incluir PUBLIC; este é o primeiro que vale.
revoke all on function public.custom_access_token_hook(jsonb)    from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grupo C — tira anon, MANTÉM authenticated
-- ─────────────────────────────────────────────────────────────────────────────
-- get_dashboard_kpis tinha GRANT ... TO anon deliberado: KPI operacional
-- legível sem login, resíduo de quando a /tv lia direto, antes de passar por
-- /api/tv/* com service_role. Por isso o revoke precisa nomear `anon`.
revoke all on function public.get_dashboard_kpis()                     from public, anon;
revoke all on function public.get_cco_atendimentos(date, date)         from public, anon;
revoke all on function public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.fn_alerta_comentar(uuid, text)           from public, anon;
revoke all on function public.fn_alerta_status(uuid, text, text)       from public, anon;
revoke all on function public.fn_alerta_pode_ver(uuid)                 from public, anon;
revoke all on function public.fn_usuario_role()                        from public, anon;
revoke all on function public.get_user_unit()                          from public, anon;
revoke all on function public.is_admin()                               from public, anon;
revoke all on function public.is_diretoria()                           from public, anon;
revoke all on function public.remuneracao_has_role(text[])             from public, anon;

-- Grants explícitos: estas funções são citadas DENTRO de policies RLS. Medido em
-- 2026-08-17 varrendo pg_policies:
--   remuneracao_has_role → 44 policies em 24 tabelas (remuneração, cronograma,
--                          reboot_*, feriados, previsao_receitas_*)
--   fn_usuario_role      → alertas, alertas_eventos, alertas_regras
--   is_diretoria         → usuarios, usuarios_permissoes
--   is_admin             → usuarios
--   get_user_unit, fn_alerta_pode_ver → nenhuma policy hoje; preventivo
grant execute on function public.get_dashboard_kpis()                  to authenticated;
grant execute on function public.get_cco_atendimentos(date, date)      to authenticated;
grant execute on function public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.fn_alerta_comentar(uuid, text)        to authenticated;
grant execute on function public.fn_alerta_status(uuid, text, text)    to authenticated;
grant execute on function public.fn_alerta_pode_ver(uuid)              to authenticated;
grant execute on function public.fn_usuario_role()                     to authenticated;
grant execute on function public.get_user_unit()                       to authenticated;
grant execute on function public.is_admin()                            to authenticated;
grant execute on function public.is_diretoria()                        to authenticated;
grant execute on function public.remuneracao_has_role(text[])          to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Policies de {public} para {authenticated}
-- ─────────────────────────────────────────────────────────────────────────────
-- `public` inclui anon, então a expressão era avaliada também para visitante não
-- logado — e as duas de `usuarios` chamam is_admin(). Depois do revoke acima,
-- anon receberia "permission denied for function is_admin" em vez de 0 linhas.
-- Retargetar é neutro: o qual de cada uma já excluía anon.
--
-- NÃO retargetar public.maquinas, worker_tokens, sessions e logs_execucao, que
-- também são {public}: são o caminho do robô, que entra como anon com token.
alter policy "Admin pode ver todos usuarios"             on public.usuarios        to authenticated;
alter policy "Admin pode atualizar usuarios"             on public.usuarios        to authenticated;
alter policy "Usuário pode ver próprio perfil"           on public.usuarios        to authenticated;
alter policy "Leitura agenda para usuarios autenticados" on public.agenda_terapias to authenticated;
