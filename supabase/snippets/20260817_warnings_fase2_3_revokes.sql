-- Fases 2 e 3 dos WARNINGS do Advisor — fechar SECURITY DEFINER para anon
-- 2026-08-17 · contexto: docs/warnings-supabase/ANALISE.md
--
-- Zera ~74 warnings (#2 anon_security_definer + #3 authenticated_security_definer).
-- NÃO toca em search_path, RLS, nem move extensão.
--
-- ⚠️ RODE O ARQUIVO INTEIRO, DE UMA VEZ, NUNCA EM PEDAÇOS.
-- Em 2026-08-17 a fila_autorizacoes foi aplicada em partes: os DROPs saíram e o
-- CREATE da policy do `rp` ficou para trás, e a produção passou uma janela
-- calculando folha com falta virando presença. Aqui a ordem é a mesma classe de
-- risco: os GRANTs do bloco 0 e da FASE 3 PRECISAM sair junto com os REVOKEs.
-- Rodar só a metade de baixo tira acesso sem devolver.
--
-- O arquivo termina em `rollback;` de propósito: a primeira execução é um
-- ENSAIO — aplica tudo, roda as três conferências e desfaz. Leia o resultado,
-- depois troque `rollback;` por `commit;` e rode de novo, inteiro.
--
-- DEPOIS DE APLICAR, TESTAR NESTA ORDEM:
--   1. login no app  (mexe em custom_access_token_hook — primeira vez que o revoke vale)
--   2. abrir /solicitar, /central-pacientes, /auditoria-assim  (policies chamam is_admin etc.)
--   3. o robô pegar uma tarefa  (robo_* não é tocada aqui, mas confirma a fila)
--   4. o próximo ciclo dos crons de sync e do cco-conciliation-engine

-- ############################################################
-- PRÉ-VOO — rodar SOZINHO, antes de tudo, e ler o resultado
-- ############################################################
-- Só conferi funções-em-policy nas 5 tabelas do bloco 6 do diagnóstico. Esta
-- consulta varre TODAS as policies do banco atrás de chamada a qualquer função
-- SECURITY DEFINER. Cada linha que aparecer é uma tabela cuja policy depende de
-- EXECUTE: se o papel perder o EXECUTE, a tabela inteira passa a dar
-- "permission denied" para aquele papel.
--
-- COMPARE o resultado com a lista de GRANTs da FASE 3 mais abaixo. Se aparecer
-- função que este script revoga de `authenticated` e que NÃO está lá,
-- PARE e me avise antes de aplicar.
select distinct
  pol.schemaname || '.' || pol.tablename as tabela,
  pol.policyname,
  pol.cmd,
  pol.roles,
  n.nspname || '.' || p.proname          as funcao_citada
from pg_policies pol
join pg_proc      p on p.prosecdef
join pg_namespace n on n.oid = p.pronamespace
where n.nspname   in ('public', 'central')
  and pol.schemaname in ('public', 'central')
  and (
        coalesce(pol.qual, '')       ~ ('\m' || p.proname || '\s*\(')
     or coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\s*\(')
  )
order by 1, 2;

-- Bônus: toda policy com roles = {public}. `public` inclui `anon`, então a
-- expressão dela é avaliada também para visitante não logado — e aí o EXECUTE
-- de anon importa. As 6 conhecidas estão na FASE 3-PRÉ; qualquer outra que
-- apareça aqui e cite função revogada precisa entrar lá também.
select schemaname || '.' || tablename as tabela, policyname, cmd
from pg_policies
where schemaname in ('public', 'central')
  and roles::text[] @> array['public']
order by 1, 2;


-- ############################################################
-- COMO FALHA — a diferença que importa
-- ############################################################
-- Ao contrário da RLS (que filtra linha em silêncio), falta de EXECUTE em
-- função GRITA: "permission denied for function X", erro 42501, visível na
-- tela e no log. É a boa notícia deste lote — o que quebrar, quebra à vista.
-- A exceção é a função citada dentro de policy: ali o erro sobe como falha da
-- tabela toda, não da função, e o rastro fica confuso. Por isso o pré-voo.


begin;

-- ============================================================
-- BLOCO 0 — GRANTs que faltam (as 4 do bloco 1b do diagnóstico)
-- ============================================================
-- Sem isto, o REVOKE abaixo tira o único acesso que essas funções têm
-- e o worker do CRM quebra em silêncio.
grant execute on function central.ca_current_role()                                              to service_role;
grant execute on function central.current_organization_id()                                      to service_role;
grant execute on function central.claim_message_grouping_batch(uuid, integer, interval)          to service_role;
grant execute on function central.claim_send_queue_batch(uuid, integer, interval)                to service_role;

-- Helpers de sessão do CRM: são citados dentro de policies RLS do schema central,
-- então authenticated PRECISA continuar podendo executar.
grant execute on function central.ca_current_role()          to authenticated;
grant execute on function central.current_organization_id()  to authenticated;


-- ============================================================
-- FASE 2A — Grupo A: só service_role/cron deveria chamar
-- ============================================================
-- Todas já têm service_role explícito na ACL (medido). Fecha para todo o resto.
revoke all on function public.upsert_atendimentos(jsonb)                    from public, anon, authenticated;
revoke all on function public.upsert_occurrences(jsonb)                     from public, anon, authenticated;
revoke all on function public.update_dashboard_snapshot()                   from public, anon, authenticated;
revoke all on function public.refresh_dashboard_kpis()                      from public, anon, authenticated;
revoke all on function public.fn_sync_grade_csv_em_lotes()                  from public, anon, authenticated;
revoke all on function public.fn_sync_grade_execucao_em_lotes(integer)      from public, anon, authenticated;
revoke all on function public.detect_r1_autorizacao_pendente()              from public, anon, authenticated;
revoke all on function public.detect_r2_sessao_sem_autorizacao()            from public, anon, authenticated;
revoke all on function public.detect_r3_evolucao_atrasada()                 from public, anon, authenticated;
revoke all on function public.detect_r4_falta_terapeuta()                   from public, anon, authenticated;
revoke all on function public.detect_r5_substituicao()                      from public, anon, authenticated;
revoke all on function public.detect_r6_falta_paciente()                    from public, anon, authenticated;
revoke all on function public.detect_r7_glosa()                             from public, anon, authenticated;
revoke all on function public.detect_sessions_without_authorization()       from public, anon, authenticated;
revoke all on function public.count_test_data()                             from public, anon, authenticated;
revoke all on function public.test_occurrences_view()                       from public, anon, authenticated;

-- Estas duas têm GRANT deliberado a authenticated numa migration. Tira só anon.
revoke all on function public.fn_alertas_avaliar_assim(date)                from public, anon;
revoke all on function public.fn_orbita_sync_targets()                      from public, anon;


-- ============================================================
-- FASE 2B — Grupo B: schema central (CRM multi-tenant)
-- ============================================================
-- ATENÇÃO: fechar o acesso NÃO resolve sozinho o risco cross-tenant.
-- Estas seis recebem p_organization_id como ARGUMENTO sendo SECURITY DEFINER.
-- Enquanto não validarem o argumento contra central.current_organization_id()
-- por dentro, quem tiver acesso legítimo continua podendo passar QUALQUER org.
-- Ver §3 Grupo B da análise — é item separado, não coberto por este script.
--
-- Nenhum chamador das claim_* do Pulsar foi encontrado neste repo. O
-- whatsapp-sender do nina-api-oficial é pista falsa: outro projeto Supabase
-- (mlttucjfmqnzbctwysks), outra assinatura, schema public. Se existir um
-- worker do CRM usando a ANON key, ele quebra aqui — confirmar antes do commit.
revoke all on function central.claim_message_grouping_batch(uuid, integer, interval)              from public, anon, authenticated;
revoke all on function central.claim_send_queue_batch(uuid, integer, interval)                    from public, anon, authenticated;
revoke all on function central.cleanup_processed_queues(integer)                                  from public, anon, authenticated;
revoke all on function central.get_or_create_conversation_state(uuid, uuid)                       from public, anon, authenticated;
revoke all on function central.update_contact_ai_memory(uuid, uuid, jsonb)                        from public, anon, authenticated;
revoke all on function central.update_conversation_state(uuid, uuid, text, text, jsonb)           from public, anon, authenticated;

-- Helpers de sessão: authenticated foi re-concedido no bloco 0.
revoke all on function central.ca_current_role()                            from public, anon;
revoke all on function central.current_organization_id()                    from public, anon;


-- ============================================================
-- FASE 2C — Grupo D: funções de gatilho
-- ============================================================
-- O PostgREST não expõe função que retorna trigger, e o EXECUTE de gatilho é
-- conferido no CREATE TRIGGER, não a cada disparo. Some da lista sem efeito
-- prático — mas confira o teste 2 do cabeçalho mesmo assim.
revoke all on function public.handle_new_user()                             from public, anon, authenticated;
revoke all on function public.sync_user_activation()                        from public, anon, authenticated;
revoke all on function public.log_usuario_changes()                         from public, anon, authenticated;
revoke all on function public.log_usuario_permissao_changes()               from public, anon, authenticated;
revoke all on function public.log_authorization_access()                    from public, anon, authenticated;
revoke all on function public.audit_rls_access_attempt()                    from public, anon, authenticated;
revoke all on function public.fn_set_criado_por()                           from public, anon, authenticated;
revoke all on function public.rls_auto_enable()                             from public, anon, authenticated;
revoke all on function central.update_conversation_last_message_at()        from public, anon, authenticated;


-- ============================================================
-- FASE 2D — o hook de auth
-- ============================================================
-- Só supabase_auth_admin precisa. O revoke de 2026-07-01 nunca teve efeito
-- porque não incluiu PUBLIC. Esta é a primeira vez que ele vale de verdade:
-- TESTAR O LOGIN LOGO DEPOIS.
revoke all on function public.custom_access_token_hook(jsonb)               from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb)            to supabase_auth_admin;


-- ============================================================
-- FASE 3-PRÉ — retargetar policies de {public} para {authenticated}
-- ============================================================
-- Seis policies têm roles = {public}, que INCLUI anon. As três de usuarios
-- chamam is_admin()/is_diretoria() na expressão. Hoje uma consulta anônima
-- avalia essas funções e recebe false (zero linhas). Depois do revoke de anon
-- na Fase 3, receberia "permission denied for function is_admin".
--
-- Retargetar é neutro: o qual de cada uma já exclui anon
-- (auth.uid() IS NOT NULL, auth.role() = 'authenticated', is_admin()).
-- Antes: anon avalia e dá 0 linhas. Depois: policy não se aplica a anon,
-- 0 linhas. Mesmo resultado, sem o erro de permissão.
-- Pré-voo de 2026-08-17: das policies com roles={public} no banco, as ÚNICAS
-- que avaliam função SECURITY DEFINER são as duas de `usuarios` que chamam
-- is_admin(). Elas são obrigatórias aqui. As outras duas entram por higiene
-- (mesmo qual, sem função envolvida).
alter policy "Admin pode ver todos usuarios"              on public.usuarios            to authenticated;
alter policy "Admin pode atualizar usuarios"              on public.usuarios            to authenticated;
alter policy "Usuário pode ver próprio perfil"            on public.usuarios            to authenticated;
alter policy "Leitura agenda para usuarios autenticados"  on public.agenda_terapias     to authenticated;

-- As duas de fila_autorizacoes que estavam aqui foram REMOVIDAS: elas deixaram
-- de existir quando a Fase 7 derrubou as amplas em 2026-08-17. Um ALTER POLICY
-- em policy inexistente levanta erro e aborta a transação inteira.
--
-- ⚠️ NÃO retargetar estas outras, que também têm roles={public}:
--   public.maquinas, public.worker_tokens, public.sessions, public.logs_execucao
-- São o caminho do robô, que entra como `anon` com token próprio. Tirar `public`
-- delas é exatamente o tipo de mudança que derruba a frota — e nenhuma cita
-- função revogada, então não há motivo para tocá-las.


-- ============================================================
-- FASE 3 — Grupo C: tira anon, MANTÉM authenticated
-- ============================================================
-- is_admin, is_diretoria, fn_usuario_role, get_user_unit, remuneracao_has_role
-- e fn_alerta_pode_ver são citadas dentro de policies RLS. Se authenticated
-- perder EXECUTE, as tabelas que usam essas policies passam a dar
-- "permission denied" para todo usuário logado. Por isso o grant explícito.
--
-- Escala medida no pré-voo de 2026-08-17 — o grant abaixo NÃO é formalidade:
--   remuneracao_has_role  → 44 policies em 24 tabelas (todo o módulo de
--                           remuneração, cronograma, reboot_*, feriados,
--                           previsao_receitas_*). É a função mais carregada
--                           do banco; revogá-la de authenticated apaga o
--                           módulo inteiro.
--   is_diretoria          → usuarios, usuarios_permissoes
--   is_admin              → usuarios (as duas policies com roles={public})
--   fn_usuario_role       → alertas, alertas_eventos, alertas_regras
--   get_user_unit,
--   fn_alerta_pode_ver    → nenhuma policy hoje; o grant é preventivo.
revoke all on function public.get_dashboard_kpis()                          from public, anon;
revoke all on function public.get_cco_atendimentos(date, date)              from public, anon;
revoke all on function public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text) from public, anon;
revoke all on function public.fn_alerta_comentar(uuid, text)                from public, anon;
revoke all on function public.fn_alerta_status(uuid, text, text)            from public, anon;
revoke all on function public.fn_alerta_pode_ver(uuid)                      from public, anon;
revoke all on function public.fn_usuario_role()                             from public, anon;
revoke all on function public.get_user_unit()                               from public, anon;
revoke all on function public.is_admin()                                    from public, anon;
revoke all on function public.is_diretoria()                                from public, anon;
revoke all on function public.remuneracao_has_role(text[])                  from public, anon;

grant execute on function public.get_dashboard_kpis()                       to authenticated;
grant execute on function public.get_cco_atendimentos(date, date)           to authenticated;
grant execute on function public.fn_alerta_criar(text, text, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.fn_alerta_comentar(uuid, text)             to authenticated;
grant execute on function public.fn_alerta_status(uuid, text, text)         to authenticated;
grant execute on function public.fn_alerta_pode_ver(uuid)                   to authenticated;
grant execute on function public.fn_usuario_role()                          to authenticated;
grant execute on function public.get_user_unit()                            to authenticated;
grant execute on function public.is_admin()                                 to authenticated;
grant execute on function public.is_diretoria()                             to authenticated;
grant execute on function public.remuneracao_has_role(text[])               to authenticated;


-- ============================================================
-- CONFERÊNCIA — rodar ANTES do commit
-- ============================================================
-- As três checagens vêm numa consulta só, de propósito: o SQL Editor do
-- Supabase devolve apenas o resultado do ÚLTIMO select quando se roda várias
-- de uma vez, e as outras duas se perderiam em silêncio.
--
-- ESPERADO — exatamente 8 linhas, todas com checagem = '1. aberta_para_anon':
--   public.email_por_username  +  as 7 public.robo_*   (Grupo E, intencional)
-- Qualquer linha '2.' ou '3.' é motivo para ROLLBACK.
select '1. aberta_para_anon (esperado: só o Grupo E)' as checagem,
       n.nspname || '.' || p.proname                  as objeto
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')

union all

-- Se aparecer, o app quebra para TODO usuário logado nas tabelas que usam
-- essas funções em policy — remuneracao_has_role sozinha vale 24 tabelas.
select '2. helper de policy SEM authenticated (esperado: ZERO)',
       n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
        ('public','is_admin'), ('public','is_diretoria'), ('public','fn_usuario_role'),
        ('public','get_user_unit'), ('public','remuneracao_has_role'),
        ('public','fn_alerta_pode_ver'),
        ('central','ca_current_role'), ('central','current_organization_id')
      )
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')

union all

-- Se aparecer, Edge Function ou cron perde acesso — e esse é o modo de falha
-- que só se descobre no próximo ciclo do job.
select '3. service_role PERDEU acesso (esperado: ZERO)',
       n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prosecdef
  and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger')
  and not has_function_privilege('service_role', p.oid, 'EXECUTE')

order by 1, 2;


-- Conferido? Troque por COMMIT.
rollback;
-- commit;
