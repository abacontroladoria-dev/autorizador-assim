-- Limpa as tabelas mortas com RLS ligada e sem policy (advisor 0008).
--
-- APLICADO EM PRODUÇÃO via SQL Editor em 2026-08-17. Este arquivo é o registro
-- no livro-caixa. Idempotente: `drop ... if exists` e `comment` repetem sem efeito.
--
-- Contexto: docs/warnings-supabase/ANALISE.md §9.
-- Fecha 9 dos 18 INFO `rls_enabled_no_policy`. Estado conferido depois de
-- aplicar, em consulta FORA da transação: as 9 não existem mais.
--
-- POR QUE ESSAS TABELAS ESTAVAM ASSIM: o event trigger `rls_auto_enable()`
-- (20260518131652_remote_schema.sql:1322) liga RLS em todo CREATE TABLE do
-- schema public, inclusive CREATE TABLE AS — que é como os backups nasceram.
-- Ninguém esqueceu a policy: o banco fecha sozinho e a policy é o ato
-- deliberado. O INFO 0008 é efeito colateral desse default, e o default é bom.
--
-- NENHUMA POLICY FOI CRIADA. Fechar os 18 com policy trocaria 18 avisos por 18
-- superfícies novas de acesso.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backups sem consumidor
-- ─────────────────────────────────────────────────────────────────────────────
-- 6.910 linhas de dado clínico congelado entre 07/05 e 03/07, ~2,4 MB, zero
-- dependentes (nenhuma view, FK ou função citava qualquer uma delas). O dado
-- vivo segue nas tabelas de origem; estas eram cópias de migrações antigas.
-- Decisão do usuário em 2026-08-17: dropar direto, sem exportar.
--
-- `vw_central_pacientes_backup_20260508` era TABELA, apesar do prefixo vw_ —
-- um snapshot congelado da view, não a view.
drop table if exists public.agenda_tita_autorizacao_backup_20260508;
drop table if exists public.backup_fila_null_terapia;
drop table if exists public.fila_autorizacoes_backup_titaid;
drop table if exists public.fila_bkp_titaid_faltas_jun;
drop table if exists public.vw_central_pacientes_backup_20260508;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabelas que nunca receberam uma linha
-- ─────────────────────────────────────────────────────────────────────────────
-- 0 linhas e 0 inserts na vida inteira da tabela. Sabemos que é a vida inteira
-- porque as criadas em 08/05 ainda exibiam seus contadores em
-- pg_stat_user_tables — logo não houve pg_stat_reset desde então.
-- Só apareciam no dump inicial 20260518131652_remote_schema.sql.
drop table if exists public.controle_disponibilidade_terapeutas;
drop table if exists public.terapeuta_eventos;
drop table if exists public.tita_grade_profissionais;
drop table if exists public.pre_auditoria_snapshot;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As 6 que ficam fechadas de propósito
-- ─────────────────────────────────────────────────────────────────────────────
-- Aqui a AUSÊNCIA de policy é a proteção: só service_role e SECURITY DEFINER
-- tocam nestas tabelas, e todas estão vivas (dashboard_kpis_cache tinha 4.784
-- updates, o último no próprio dia). Criar policy abriria acesso que hoje não
-- existe. O COMMENT é para o próximo que olhar o advisor não "consertar" isso.
--
-- Estas 6 seguem contando como INFO 0008 no Advisor, e devem seguir.
comment on table public.robo_config is
  'Sem policy de propósito: lida só de dentro das robo_* SECURITY DEFINER. RLS fechada é a proteção. Advisor 0008 fica aberto de propósito.';
comment on table public.robo_pacotes is
  'Sem policy de propósito: lida só de dentro das robo_* SECURITY DEFINER. RLS fechada é a proteção. Advisor 0008 fica aberto de propósito.';
comment on table public.edge_rate_limits is
  'Sem policy de propósito: só a Edge Function auth-lookup-username escreve, com service_role. Advisor 0008 fica aberto de propósito.';
comment on table public.sync_status is
  'Sem policy de propósito: só as Edge Functions de sync escrevem, com service_role. Advisor 0008 fica aberto de propósito.';
comment on table public.dashboard_kpis_cache is
  'Sem policy de propósito: leitura via get_dashboard_kpis() SECURITY DEFINER. Advisor 0008 fica aberto de propósito.';

-- crm_inconsistencias: 79 linhas escritas em 20/05 00:18 e nada desde. Medido em
-- 2026-08-17: NÃO existe job em cron.job para ela, e a função
-- executar_relatorio_crm_inconsistente está exposta como RPC (types/supabase.ts:5346)
-- mas ninguém a chama. É relatório manual de qualidade do CRM do médico. Fica por
-- ser o único artefato de auditoria do pipeline de canonização de CRM
-- (fn_set_crm_uf, trg_canonizar_crm_agenda_orbita, ajustar_crm_fila), que segue
-- vivo — 32 kB não valem perder isso para fechar um INFO.
comment on table public.crm_inconsistencias is
  'Sem policy de propósito: saída do relatório manual executar_relatorio_crm_inconsistente, que não tem cron nem chamador. Advisor 0008 fica aberto de propósito.';

-- ─────────────────────────────────────────────────────────────────────────────
-- NÃO ENTRA AQUI
-- ─────────────────────────────────────────────────────────────────────────────
-- guia_terapias, terapeutas, guias_processadas — decisão de produto. As duas
--   primeiras têm 0 linhas e 0 inserts na vida inteira; a terceira parou em
--   13/05. A tela /guias-digitais rodou em maio já com as origens vazias: o
--   carimbo do terapeuta nunca existiu. Ver ANALISE.md §9 para as duas saídas
--   possíveis — nenhuma delas é criar policy.
