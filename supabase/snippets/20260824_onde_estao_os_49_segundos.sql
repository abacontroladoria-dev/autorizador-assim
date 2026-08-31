-- =============================================================================
-- Onde estão os 49 segundos de get_guias_orfas
-- =============================================================================
-- O índice está válido (632 kB) e o archiver está saudável — as duas hipóteses
-- do snippet anterior morreram. O que sobrou é o bloco 2:
--
--   Function Scan on get_guias_orfas  (actual time=49053.361..49057.245 rows=1)
--   Buffers: shared hit=54259 read=523
--   Execution Time: 49230.782 ms
--
-- Ler esses números: 54.259 buffers HIT contra 523 READ. Quase nada veio do
-- disco — está tudo em cache e mesmo assim levou 49 s. Isso não é I/O, é CPU
-- moendo as mesmas páginas repetidamente, que é a assinatura de nested loop
-- re-escaneando uma tabela por linha. E `rows=1`: 49 segundos para devolver UMA
-- linha.
--
-- O `Function Scan` não mostra o interior porque o proconfig (`set
-- statement_timeout`) impede o inlining da função SQL. Por isso estas perguntas
-- medem o interior na mão.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A migration 20260824010000 chegou mesmo a rodar?
-- -----------------------------------------------------------------------------
-- A função declara `set statement_timeout = '15s'`, e o bloco 2 rodou 49 s. Ou
-- o timeout de proconfig não limita o corpo da própria função, ou a versão em
-- produção não é a nova. `get_dashboard_kpis` declara 30 s e o
-- pg_stat_statements mostra max_ms = 29.709 — bem embaixo do teto —, o que
-- sugere que proconfig FUNCIONA e portanto que a segunda hipótese é a certa:
-- o `create or replace` das 12:52 pode não ter completado.
--
-- Esperado se a migration entrou: timeout = {statement_timeout=15s}
--                                 usa_between = true
select
  p.proname,
  p.proconfig                                as timeout,
  p.prosrc like '%between g.data_execucao%'  as usa_between,
  p.prosrc like '%abs(extract%'              as ainda_tem_abs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_guias_orfas', 'get_candidatas_vinculo',
                    'fn_blocos_assim', 'get_auditoria_assim_periodo');


-- -----------------------------------------------------------------------------
-- 2. Os 49 s estão na fn_blocos_assim  ← a pergunta que decide tudo
-- -----------------------------------------------------------------------------
-- get_guias_orfas chama fn_blocos_assim(p_de, p_ate) na CTE `n_sessoes`, sobre a
-- janela inteira, só para CONTAR sessões por partição. Se este bloco sozinho der
-- ~48 s, a correção de ontem consertou a metade barata do problema: o `between`
-- contra fila_autorizacoes era real, mas não era onde o tempo estava.
explain (analyze, buffers, timing)
select count(*) from public.fn_blocos_assim(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 3. E dentro dela, o mesmo bug que você acabou de corrigir — de novo
-- -----------------------------------------------------------------------------
-- fn_blocos_assim, CTE `agenda_sem_falta` (20260821000000:224):
--
--     where f.paciente_id::bigint = a.paciente_id
--
-- É exatamente a classe de defeito que a migration de ontem eliminou do outro
-- predicado: a coluna está dentro de uma expressão. `f.paciente_id::bigint`
-- envolve a coluna num cast, e índice nenhum sobre `fila_autorizacoes
-- (paciente_id)` pode ser usado — o planner varre a tabela inteira e avalia
-- linha a linha, uma vez por linha de agenda_filtrada.
--
-- Se `paciente_id` for text, o cast é obrigatório para comparar e a correção é
-- um índice de expressão:
--
--     create index concurrently idx_fila_paciente_id_bigint
--       on public.fila_autorizacoes ((paciente_id::bigint));
--
-- Se já for bigint, o cast é ruído e basta apagá-lo.
--
-- Este select responde qual dos dois.
select
  c.table_name, c.column_name, c.data_type
from information_schema.columns c
where c.table_schema = 'public'
  and ((c.table_name = 'fila_autorizacoes'
        and c.column_name in ('paciente_id','data_atendimento','horario'))
    or (c.table_name = 'agenda_tita' and c.column_name = 'paciente_id'))
order by c.table_name, c.column_name;

-- 3b. O que já existe de índice nas duas tabelas.
select
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as tamanho,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('fila_autorizacoes', 'agenda_tita')
order by tablename, indexname;

-- 3c. Tamanho das duas tabelas — para saber o custo de cada varredura.
select
  relname,
  n_live_tup                                   as linhas,
  pg_size_pretty(pg_total_relation_size(oid))  as tamanho,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables t
join pg_class c on c.oid = t.relid
where relname in ('fila_autorizacoes', 'agenda_tita',
                  'autorizacoes_assim', 'grade_profissionais_tita');


-- -----------------------------------------------------------------------------
-- 4. O ANALYZE de 25 minutos
-- -----------------------------------------------------------------------------
-- O bloco 4 pegou isto rodando:
--
--   autovacuum: ANALYZE public.grade_profissionais_tita   duracao 00:25:35
--
-- ANALYZE amostra 30.000 linhas e deveria levar segundos. 25 minutos significa
-- que está sendo estrangulado pelo cost delay, ou que a tabela está inchada. E
-- enquanto ele roda ele segura conexão, gera I/O contínuo e — isto importa — é
-- exatamente o tipo de transação longa que fez o `create index concurrently`
-- das 12:51 esperar ShareLock duas vezes.
select
  relname,
  n_live_tup, n_dead_tup,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as pct_morto,
  last_autovacuum, last_autoanalyze, autovacuum_count, autoanalyze_count
from pg_stat_user_tables
where n_dead_tup > 1000
order by n_dead_tup desc
limit 15;


-- -----------------------------------------------------------------------------
-- 5. Metade do pool está parada em transação aberta
-- -----------------------------------------------------------------------------
-- Bloco 4b: authenticator tinha 5 idle + 5 `idle in transaction` + 1 active = 11
-- de um pool de 10. As cinco em `idle in transaction` estavam em
-- `Client:ClientRead` — transação aberta, esperando o PostgREST mandar a query.
-- Alguma abertura é normal no PostgREST; cinco simultâneas com até 4,4 s de
-- transação aberta não é, e é o que segura o xmin e impede o vacuum de limpar.
--
-- Rodar durante uma lentidão. Se aparecerem transações abertas de dezenas de
-- segundos, o problema é conexão vazando, não query lenta.
select
  state,
  count(*),
  max(now() - xact_start)   as transacao_mais_velha,
  max(now() - state_change) as parada_ha
from pg_stat_activity
where usename = 'authenticator'
group by state;
