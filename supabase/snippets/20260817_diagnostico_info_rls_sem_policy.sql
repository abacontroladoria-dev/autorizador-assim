-- INFO `rls_enabled_no_policy` — 18 tabelas (advisor 0008)
-- 2026-08-17 · contexto: docs/warnings-supabase/ANALISE.md §9
--
-- ─── O QUE ESTE INFO SIGNIFICA ───────────────────────────────────────────────
-- RLS ligada SEM policy nenhuma = nega tudo para anon e authenticated.
-- service_role e SECURITY DEFINER passam por cima. Então NÃO há exposição aqui:
-- é o oposto dos WARNINGS de ontem. O advisor marca como INFO porque o estado é
-- ambíguo — pode ser "fechado de propósito" ou "esqueci a policy".
--
-- O risco é a regra que já mordeu na fila_autorizacoes:
--   RLS não grita, ela some com a linha.
-- SELECT bloqueado devolve ZERO LINHAS COM SUCESSO. Só o INSERT/UPDATE levanta
-- erro (42501, via WITH CHECK). Uma tela que lê tabela deste grupo pelo cliente
-- do navegador mostra "nenhum resultado" e ninguém percebe.
--
-- ─── LEITURA DO REPOSITÓRIO (já feita, não precisa rodar) ────────────────────
-- Grupo 1 — BACKUPS MORTOS (5). Nenhum consumidor em código:
--   agenda_tita_autorizacao_backup_20260508, backup_fila_null_terapia,
--   fila_autorizacoes_backup_titaid, fila_bkp_titaid_faltas_jun,
--   vw_central_pacientes_backup_20260508  (é TABELA, apesar do prefixo vw_)
--
-- Grupo 2 — FECHADO CORRETAMENTE (5). Só service_role/DEFINER toca:
--   robo_config, robo_pacotes  → lidos DENTRO das robo_* SECURITY DEFINER
--                                (20260813100200_robo_rpcs.sql:114,320,367)
--   edge_rate_limits           → supabaseAdmin (auth-lookup-username:45,55)
--   sync_status                → supabaseAdmin (sincronizar-operacional:166,189)
--   dashboard_kpis_cache       → via get_dashboard_kpis() DEFINER
--   Aqui a ausência de policy É a proteção. Falta só documentar a intenção.
--
-- Grupo 3 — SUSPEITA DE TELA QUEBRADA CALADA (3):
--   guia_terapias, terapeutas, guias_processadas
--   /guias-digitais chama a Edge Function `processar-guias`
--   (guias-digitais/page.tsx:53), e ela monta o cliente com a service_role key
--   MAS injeta o JWT do usuário no header Authorization
--   (processar-guias/index.ts:55-57). O PostgREST resolve o papel pelo JWT, não
--   pela apikey — então essas queries correm como `authenticated` e a RLS VALE.
--   Consequência esperada: verso do PDF sai sem carimbo nenhum (zero linhas,
--   sem erro) e o insert em guias_processadas é negado com o erro ignorado.
--   O BLOCO 2 abaixo mede se é isso mesmo.
--   (A rota Next /api/guias-digitais/processar faz o mesmo com supabaseService
--    e funcionaria — mas está morta, ninguém chama.)
--
-- Grupo 4 — SEM CONSUMIDOR IDENTIFICADO (5). Só aparecem no dump inicial
--   20260518131652_remote_schema.sql:
--   controle_disponibilidade_terapeutas, terapeuta_eventos,
--   tita_grade_profissionais, pre_auditoria_snapshot, crm_inconsistencias
--   (crm_inconsistencias é escrita pelo cron executar_relatorio_crm_inconsistente)
--   O BLOCO 1 diz se estão vivas ou são entulho.


-- ============================================================
-- BLOCO 1 — as 18 tabelas: estão vivas? (somente leitura)
-- ============================================================
-- Contagem EXATA via query_to_xml (não é estimativa do reltuples).
-- Lê também a escrita mais recente registrada pelo autovacuum.
--
-- Como ler:
--   linhas = 0 e nunca_escrita  → entulho, candidata a DROP
--   linhas > 0 e escrita velha  → congelada; se for backup, DROP
--   escrita recente             → viva, precisa de decisão consciente
with alvo(tabela, grupo) as (
  values
    ('agenda_tita_autorizacao_backup_20260508', '1-backup'),
    ('backup_fila_null_terapia',                '1-backup'),
    ('fila_autorizacoes_backup_titaid',         '1-backup'),
    ('fila_bkp_titaid_faltas_jun',              '1-backup'),
    ('vw_central_pacientes_backup_20260508',    '1-backup'),
    ('robo_config',                             '2-fechada-ok'),
    ('robo_pacotes',                            '2-fechada-ok'),
    ('edge_rate_limits',                        '2-fechada-ok'),
    ('sync_status',                             '2-fechada-ok'),
    ('dashboard_kpis_cache',                    '2-fechada-ok'),
    ('guia_terapias',                           '3-tela-viva'),
    ('terapeutas',                              '3-tela-viva'),
    ('guias_processadas',                       '3-tela-viva'),
    ('controle_disponibilidade_terapeutas',     '4-sem-consumidor'),
    ('terapeuta_eventos',                       '4-sem-consumidor'),
    ('tita_grade_profissionais',                '4-sem-consumidor'),
    ('pre_auditoria_snapshot',                  '4-sem-consumidor'),
    ('crm_inconsistencias',                     '4-sem-consumidor')
)
select
  a.grupo,
  a.tabela,
  (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from public.%I', a.tabela),
                      false, true, '')))[1]::text::bigint          as linhas,
  pg_size_pretty(pg_total_relation_size(c.oid))                    as tamanho,
  c.relrowsecurity                                                 as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = a.tabela)       as policies,
  greatest(s.last_autovacuum, s.last_autoanalyze, s.last_analyze)  as sinal_atividade,
  s.n_tup_ins                                                      as inserts_desde_stats,
  s.n_tup_upd                                                      as updates_desde_stats
from alvo a
join pg_class c     on c.relname = a.tabela
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_stat_user_tables s on s.relid = c.oid
order by a.grupo, a.tabela;


-- ============================================================
-- BLOCO 2 — o Grupo 3 quebrou? Quando? (somente leitura)
-- ============================================================
-- Se /guias-digitais está sendo usada e o insert está sendo negado pela RLS,
-- guias_processadas fica CONGELADA na data em que a RLS foi ligada, enquanto as
-- pessoas seguem clicando e baixando PDFs sem carimbo.
--
-- Como ler:
--   guias_processadas vazia          → ou a tela nunca foi usada, ou nunca gravou
--   ultima_guia muito antiga         → parou de gravar naquele dia; é o sintoma
--   terapeutas com carimbo_digital=0 → o verso sairia em branco de qualquer jeito
select 'guias_processadas'  as tabela, count(*) as linhas,
       max(created_at)::text as ultimo_registro
from public.guias_processadas
union all
select 'guia_terapias', count(*), null
from public.guia_terapias
union all
select 'terapeutas (total)', count(*), null
from public.terapeutas
union all
select 'terapeutas com carimbo', count(*), null
from public.terapeutas
where carimbo_digital is not null;


-- ============================================================
-- BLOCO 3 — os backups podem cair? (somente leitura)
-- ============================================================
-- Antes de qualquer DROP: alguma view, FK ou função depende deles?
-- Esperado: ZERO linhas. Qualquer linha aqui é um DROP que quebraria algo.
select
  dependente.relname                as objeto_dependente,
  dependente.relkind                as tipo,   -- v=view, m=matview, r=tabela
  alvo.relname                      as backup_referenciado
from pg_depend d
join pg_rewrite rw   on rw.oid = d.objid
join pg_class dependente on dependente.oid = rw.ev_class
join pg_class alvo   on alvo.oid = d.refobjid
join pg_namespace n  on n.oid = alvo.relnamespace and n.nspname = 'public'
where alvo.relname in (
        'agenda_tita_autorizacao_backup_20260508',
        'backup_fila_null_terapia',
        'fila_autorizacoes_backup_titaid',
        'fila_bkp_titaid_faltas_jun',
        'vw_central_pacientes_backup_20260508')
  and dependente.relname <> alvo.relname
union all
select
  con.conrelid::regclass::text,
  'FK',
  alvo.relname
from pg_constraint con
join pg_class alvo on alvo.oid = con.confrelid
join pg_namespace n on n.oid = alvo.relnamespace and n.nspname = 'public'
where con.contype = 'f'
  and alvo.relname in (
        'agenda_tita_autorizacao_backup_20260508',
        'backup_fila_null_terapia',
        'fila_autorizacoes_backup_titaid',
        'fila_bkp_titaid_faltas_jun',
        'vw_central_pacientes_backup_20260508');


-- ============================================================
-- BLOCO 4 — o que aplicar (NÃO rodar antes de ler 1, 2 e 3)
-- ============================================================
-- Deixado comentado de propósito. DROP de tabela com dado clínico não é coisa
-- que se roda por engano num arquivo colado inteiro.
--
-- 4A. Backups: guardam dado de paciente congelado, sem consumidor e sem policy.
--     Enquanto existem, são passivo — qualquer erro futuro de RLS os expõe
--     junto. Rodar só depois de o BLOCO 3 vir vazio.
--
-- drop table if exists public.agenda_tita_autorizacao_backup_20260508;
-- drop table if exists public.backup_fila_null_terapia;
-- drop table if exists public.fila_autorizacoes_backup_titaid;
-- drop table if exists public.fila_bkp_titaid_faltas_jun;
-- drop table if exists public.vw_central_pacientes_backup_20260508;
--
-- 4B. Grupo 2: a ausência de policy é o desenho. Documentar para o próximo que
--     olhar o advisor não "consertar" abrindo acesso. Isto NÃO fecha o INFO —
--     e não deve fechar.
--
-- comment on table public.robo_config is
--   'Sem policy de propósito: só as robo_* SECURITY DEFINER leem. RLS fechada é a proteção.';
-- comment on table public.robo_pacotes is
--   'Sem policy de propósito: só as robo_* SECURITY DEFINER leem. RLS fechada é a proteção.';
-- comment on table public.edge_rate_limits is
--   'Sem policy de propósito: só a Edge Function auth-lookup-username escreve, com service_role.';
-- comment on table public.sync_status is
--   'Sem policy de propósito: só as Edge Functions de sync escrevem, com service_role.';
-- comment on table public.dashboard_kpis_cache is
--   'Sem policy de propósito: leitura via get_dashboard_kpis() SECURITY DEFINER.';
--
-- 4C. Grupo 3: NÃO criar policy antes de decidir o desenho. Duas saídas, e a
--     escolha é de arquitetura, não de RLS:
--       (i)  a Edge Function passa a usar service_role de verdade (cliente sem
--            o Authorization do usuário), mantendo a checagem de sessão que ela
--            já faz em verifyAuthenticatedUser — as tabelas seguem fechadas; ou
--       (ii) criar policy de SELECT para authenticated em guia_terapias e
--            terapeutas, e de INSERT em guias_processadas.
--     (i) é coerente com o resto do sistema e não abre carimbo de terapeuta
--     para todo usuário logado. Ver ANALISE.md §9.
