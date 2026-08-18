-- INFO `rls_enabled_no_policy` — limpeza (advisor 0008)
-- 2026-08-17 · contexto: docs/warnings-supabase/ANALISE.md §9
-- Diagnóstico que originou isto: 20260817_diagnostico_info_rls_sem_policy.sql
--
-- ⚠️  RODE O ARQUIVO INTEIRO, NUNCA EM PEDAÇOS.
--     Duas vezes neste dia o SQL Editor aplicou só a parte de baixo de um
--     arquivo, sem erro nenhum. "Rodou sem erro" não prova que rodou inteiro.
--     Confira que não há seleção ativa no editor antes de apertar Run.
--
-- ─── POR QUE ESTAS 18 TABELAS EXISTEM ASSIM ──────────────────────────────────
-- Existe um event trigger `rls_auto_enable()` (remote_schema.sql:1322) que liga
-- RLS em todo CREATE TABLE do schema public — inclusive CREATE TABLE AS, que é
-- como os backups nasceram. Ninguém esqueceu a policy: o banco fecha sozinho e a
-- policy é o ato deliberado. O INFO 0008 é o efeito colateral desse default, que
-- é um bom default.
--
-- ─── O QUE ESTE ARQUIVO FAZ ──────────────────────────────────────────────────
-- Bloco 1: trava de segurança — aborta se alguma tabela alvo tiver ganhado
--          dependente ou linha desde a medição.
-- Bloco 2: DROP das 9 mortas.  Fecha 9 dos 18 INFO.
-- Bloco 3: COMMENT nas 5 que devem continuar fechadas. NÃO fecha INFO nenhum,
--          e não deve.
--
-- NÃO cria policy em lugar nenhum. Fechar os 18 com policy seria trocar 18
-- avisos por 18 superfícies novas de acesso.
--
-- ─── ANTES DE RODAR: os backups guardam dado de paciente ─────────────────────
-- 6.910 linhas congeladas entre 07/05 e 03/07. Se houver qualquer intenção de
-- guardá-las, exporte para CSV ANTES — e para fora do banco. Tabela de backup
-- vivendo no mesmo banco não é backup: é uma cópia que compartilha todos os
-- modos de falha do original, inclusive o próximo erro de RLS.

begin;

-- ============================================================
-- BLOCO 1 — trava de segurança
-- ============================================================
-- Aborta a transação inteira se o mundo mudou desde a medição. Barato, e evita
-- o único cenário ruim: dropar uma tabela que voltou a ser usada.
do $$
declare
  v_alvo    text[] := array[
    'agenda_tita_autorizacao_backup_20260508',
    'backup_fila_null_terapia',
    'fila_autorizacoes_backup_titaid',
    'fila_bkp_titaid_faltas_jun',
    'vw_central_pacientes_backup_20260508',
    'controle_disponibilidade_terapeutas',
    'terapeuta_eventos',
    'tita_grade_profissionais',
    'pre_auditoria_snapshot'
  ];
  v_vazias  text[] := array[
    'controle_disponibilidade_terapeutas',
    'terapeuta_eventos',
    'tita_grade_profissionais',
    'pre_auditoria_snapshot'
  ];
  r         record;
  v_t       text;
  v_n       bigint;
begin
  -- 1a. Alguma view/matview passou a depender de uma delas?
  for r in
    select distinct dep.relname as dependente, alvo.relname as alvo
    from pg_depend d
    join pg_rewrite rw       on rw.oid = d.objid
    join pg_class   dep      on dep.oid = rw.ev_class
    join pg_class   alvo     on alvo.oid = d.refobjid
    join pg_namespace n      on n.oid = alvo.relnamespace and n.nspname = 'public'
    where alvo.relname = any(v_alvo)
      and dep.relname <> alvo.relname
  loop
    raise exception 'ABORTADO: % depende de %', r.dependente, r.alvo;
  end loop;

  -- 1b. Alguma FK aponta para elas?
  for r in
    select con.conrelid::regclass::text as dependente, alvo.relname as alvo
    from pg_constraint con
    join pg_class alvo  on alvo.oid = con.confrelid
    join pg_namespace n on n.oid = alvo.relnamespace and n.nspname = 'public'
    where con.contype = 'f' and alvo.relname = any(v_alvo)
  loop
    raise exception 'ABORTADO: FK de % aponta para %', r.dependente, r.alvo;
  end loop;

  -- 1c. Alguma função passou a citar uma delas no corpo?
  --     (as 4 do grupo 4 nunca tiveram consumidor; se ganharam um, é sinal de
  --      que alguém começou a usá-las e a medição envelheceu)
  for r in
    select p.proname, a.tabela
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname in ('public','central')
    cross join unnest(v_alvo) as a(tabela)
    where p.prosrc ~ ('\m' || a.tabela || '\M')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    raise exception 'ABORTADO: funcao %() cita %', r.proname, r.tabela;
  end loop;

  -- 1d. As 4 do grupo 4 continuam vazias?
  --     Os 5 backups TÊM linhas de propósito — não entram nesta checagem.
  foreach v_t in array v_vazias loop
    execute format('select count(*) from public.%I', v_t) into v_n;
    if v_n > 0 then
      raise exception 'ABORTADO: % tem % linhas agora (medicao dizia 0)', v_t, v_n;
    end if;
  end loop;

  raise notice 'Trava OK: nenhuma das 9 tem dependente, FK, funcao citando, nem linha nova.';
end $$;


-- ============================================================
-- BLOCO 2 — DROP das 9 mortas
-- ============================================================
-- Backups: sem consumidor em código, sem dependente, última escrita mai/jul.
-- 6.910 linhas de dado clínico congelado que hoje são só passivo.
drop table if exists public.agenda_tita_autorizacao_backup_20260508;
drop table if exists public.backup_fila_null_terapia;
drop table if exists public.fila_autorizacoes_backup_titaid;
drop table if exists public.fila_bkp_titaid_faltas_jun;
drop table if exists public.vw_central_pacientes_backup_20260508;

-- Nunca usadas: 0 linhas e 0 inserts na vida inteira da tabela. Sabemos que é a
-- vida inteira porque as tabelas criadas em 08/05 ainda exibem seus contadores
-- em pg_stat_user_tables — não houve pg_stat_reset desde então.
drop table if exists public.controle_disponibilidade_terapeutas;
drop table if exists public.terapeuta_eventos;
drop table if exists public.tita_grade_profissionais;
drop table if exists public.pre_auditoria_snapshot;


-- ============================================================
-- BLOCO 3 — documentar as 5 que ficam fechadas de propósito
-- ============================================================
-- Aqui a AUSÊNCIA de policy é a proteção: só service_role e SECURITY DEFINER
-- tocam nestas tabelas. Criar policy abriria acesso que hoje não existe.
-- O COMMENT é para o próximo que olhar o advisor não "consertar" isso.
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


-- ============================================================
-- CONFERÊNCIA — leia antes de decidir entre commit e rollback
-- ============================================================
-- Esperado:
--   checagem 1 → ZERO linhas (nenhuma das 9 existe mais)
--   checagem 2 → 5 linhas, todas com comentário preenchido
select '1. ainda existe (esperado: zero)' as checagem,
       c.relname                          as tabela,
       null                               as comentario
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
  and c.relname in ('agenda_tita_autorizacao_backup_20260508','backup_fila_null_terapia',
                    'fila_autorizacoes_backup_titaid','fila_bkp_titaid_faltas_jun',
                    'vw_central_pacientes_backup_20260508','controle_disponibilidade_terapeutas',
                    'terapeuta_eventos','tita_grade_profissionais','pre_auditoria_snapshot')
union all
select '2. documentada (esperado: 5)',
       c.relname,
       left(obj_description(c.oid, 'pg_class'), 60)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in ('robo_config','robo_pacotes','edge_rate_limits',
                    'sync_status','dashboard_kpis_cache')
order by 1, 2;


-- Ensaio conferido em 2026-08-17: checagem 1 veio vazia (os 9 DROPs funcionaram
-- dentro da transação) e checagem 2 trouxe as 5 documentadas. Decisão do usuário
-- no mesmo dia: dropar os backups direto, sem exportar — são cópias congeladas
-- de migrações antigas e o dado vivo segue nas tabelas de origem.
commit;


-- ============================================================
-- FORA DESTE ARQUIVO — as 4 que sobram, cada uma com sua decisão
-- ============================================================
--
-- crm_inconsistencias — RESOLVIDO em 2026-08-17: a consulta a cron.job voltou
--   vazia. Não há job, e a função executar_relatorio_crm_inconsistente está
--   exposta como RPC (types/supabase.ts:5346) sem nenhum chamador. É relatório
--   manual de qualidade do CRM do médico. FICA: é o único artefato de auditoria
--   do pipeline de canonização de CRM, que segue vivo. Documentada com COMMENT
--   na migration 20260817180000, e o INFO dela permanece aberto de propósito.
--
-- guia_terapias, terapeutas, guias_processadas — decisão de produto, não de RLS.
--   Medido: guia_terapias e terapeutas têm 0 linhas e 0 inserts na vida inteira.
--   guias_processadas parou em 13/05 com 24 inserts para 14 linhas.
--   Ou seja: a tela /guias-digitais rodou em maio já com as origens vazias. O
--   carimbo do terapeuta NUNCA existiu — todo PDF saiu com o verso em branco.
--
--   Independente disso, há um bug latente na Edge Function `processar-guias`:
--   ela monta o cliente com a service_role key mas injeta o JWT do usuário no
--   header Authorization (index.ts:55-57). O PostgREST resolve o papel pelo JWT,
--   então aquelas queries correm como `authenticated` e a RLS vale para elas.
--   Hoje isso não quebra nada porque não há o que ler; passa a quebrar no
--   instante em que alguém popular `terapeutas`.
--
--   Duas saídas, e nenhuma é criar policy:
--     (a) matar a feature — tirar /guias-digitais do menu e dropar as 3 tabelas;
--     (b) fazer funcionar — popular terapeutas/guia_terapias E corrigir a Edge
--         Function para usar um cliente service_role de verdade (sem o
--         Authorization do usuário), mantendo o verifyAuthenticatedUser que ela
--         já faz.
--   Criar policy em `terapeutas` abriria carimbo_digital — assinatura de
--   profissional — para qualquer usuário logado. Não é o caminho.
