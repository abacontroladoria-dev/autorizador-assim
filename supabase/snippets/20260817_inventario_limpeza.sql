-- ============================================================================
-- Inventário para limpeza de tabelas e views  —  2026-08-17
-- ============================================================================
-- Rode BLOCO A POR BLOCO no SQL Editor e me mande a saída de cada um.
--
-- Por que este snippet existe: o cruzamento por código (grep no repo) só prova
-- o que o FRONTEND e as EDGE FUNCTIONS acessam por nome. Ele NÃO enxerga quem
-- é lido de dentro do banco — por RPC SECURITY DEFINER, por cron, por trigger
-- ou por outra view. Uma relação com "0 acesso no código" pode ser a espinha
-- dorsal de um RPC. Sem os blocos B/C/D abaixo, qualquer DROP é chute.
--
-- NADA aqui altera dado. É tudo leitura.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCO A — inventário: o que existe, tamanho, tipo, RLS
-- ----------------------------------------------------------------------------
select
  case c.relkind
    when 'r' then 'tabela'
    when 'p' then 'particionada'
    when 'v' then 'view'
    when 'm' then 'matview'
  end                                             as tipo,
  c.relname                                       as nome,
  pg_size_pretty(pg_total_relation_size(c.oid))   as tamanho,
  pg_total_relation_size(c.oid)                   as bytes,
  case when c.relkind in ('r','p') then c.reltuples::bigint end as linhas_estimadas,
  case when c.relkind in ('r','p') then c.relrowsecurity end    as rls_ligada,
  obj_description(c.oid, 'pg_class')              as comentario
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r','p','v','m')
order by pg_total_relation_size(c.oid) desc, c.relname;


-- ----------------------------------------------------------------------------
-- BLOCO B — grafo de dependência: quem consome quem
-- Uma view/tabela que aparece em "consumida_por" NÃO pode ser dropada sozinha.
-- ----------------------------------------------------------------------------
with dep as (
  select distinct
    origem.relname     as relacao,
    consumidor.relname as consumida_por,
    case consumidor.relkind when 'v' then 'view' when 'm' then 'matview' else 'outro' end as tipo_consumidor
  from pg_depend d
  join pg_rewrite r        on r.oid = d.objid
  join pg_class consumidor on consumidor.oid = r.ev_class
  join pg_class origem     on origem.oid = d.refobjid
  where d.classid    = 'pg_rewrite'::regclass
    and d.refclassid = 'pg_class'::regclass
    and origem.relnamespace = 'public'::regnamespace
    and consumidor.oid <> origem.oid
)
select relacao,
       count(*)                          as qtd_consumidores,
       string_agg(consumida_por, ', ' order by consumida_por) as consumida_por
from dep
group by relacao
order by qtd_consumidores desc, relacao;


-- ----------------------------------------------------------------------------
-- BLOCO C — quais relações são citadas DENTRO do corpo de funções/RPCs
-- Este é o bloco que o grep no repo não consegue enxergar.
-- ----------------------------------------------------------------------------
select
  c.relname                                              as relacao,
  count(distinct p.oid)                                  as qtd_funcoes,
  string_agg(distinct p.proname, ', ' order by p.proname) as funcoes
from pg_class c
join pg_proc p
  on p.pronamespace = 'public'::regnamespace
 and p.prosrc ~* ('\m' || c.relname || '\M')
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r','p','v','m')
  and c.relname ~ '^[a-z_][a-z0-9_]*$'   -- ignora nomes com espaço/hífen
group by c.relname
order by qtd_funcoes desc, relacao;


-- ----------------------------------------------------------------------------
-- BLOCO D — cron: o que roda sozinho e o que cada job toca
-- ----------------------------------------------------------------------------
select jobid, jobname, schedule, active, left(command, 400) as comando
from cron.job
order by active desc, jobname;


-- ----------------------------------------------------------------------------
-- BLOCO E — uso real desde o último reset de estatísticas
-- leituras = 0 é o sinal mais forte de relação morta (só vale para TABELAS;
-- pg_stat não contabiliza view, a leitura aparece na tabela de baixo).
-- Confira a data do reset primeiro: se for recente, "0 leituras" não prova nada.
-- ----------------------------------------------------------------------------
select stats_reset as reset_das_estatisticas,
       now() - stats_reset as tempo_acumulado
from pg_stat_database
where datname = current_database();

select
  relname                                   as tabela,
  coalesce(seq_scan,0) + coalesce(idx_scan,0) as leituras,
  seq_scan, idx_scan,
  n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes,
  n_live_tup as linhas_vivas,
  greatest(last_autovacuum, last_vacuum, last_autoanalyze, last_analyze) as ultima_manutencao
from pg_stat_user_tables
where schemaname = 'public'
order by leituras asc, n_live_tup asc;


-- ----------------------------------------------------------------------------
-- BLOCO F — amarras: FK e trigger impedem DROP sem CASCADE
-- ----------------------------------------------------------------------------
select conrelid::regclass::text as tabela_filha,
       confrelid::regclass::text as tabela_referenciada,
       conname as constraint_nome
from pg_constraint
where contype = 'f'
  and connamespace = 'public'::regnamespace
order by tabela_referenciada, tabela_filha;

select c.relname as tabela,
       t.tgname  as trigger_nome,
       p.proname as funcao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relnamespace = 'public'::regnamespace
order by c.relname, t.tgname;


-- ----------------------------------------------------------------------------
-- BLOCO G — VEREDITO: junta tudo e classifica
-- "sem_consumidor_no_banco" = nenhuma view e nenhuma função cita a relação.
-- Cruze com o grep do repo antes de dropar.
-- ----------------------------------------------------------------------------
with rel as (
  select c.oid, c.relname, c.relkind
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r','p','v','m')
),
consumo_view as (
  select distinct origem.relname
  from pg_depend d
  join pg_rewrite r        on r.oid = d.objid
  join pg_class consumidor on consumidor.oid = r.ev_class
  join pg_class origem     on origem.oid = d.refobjid
  where d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass
    and origem.relnamespace='public'::regnamespace
    and consumidor.oid <> origem.oid
),
consumo_func as (
  select distinct c.relname
  from rel c
  join pg_proc p
    on p.pronamespace='public'::regnamespace
   and p.prosrc ~* ('\m' || c.relname || '\M')
  where c.relname ~ '^[a-z_][a-z0-9_]*$'
),
consumo_cron as (
  select distinct c.relname
  from rel c
  join cron.job j on j.command ~* ('\m' || c.relname || '\M')
  where c.relname ~ '^[a-z_][a-z0-9_]*$'
),
tem_fk as (
  select distinct confrelid::regclass::text as relname
  from pg_constraint where contype='f' and connamespace='public'::regnamespace
)
select
  case r.relkind when 'r' then 'tabela' when 'p' then 'particionada'
                 when 'v' then 'view'   when 'm' then 'matview' end as tipo,
  r.relname                                             as nome,
  pg_size_pretty(pg_total_relation_size(r.oid))         as tamanho,
  coalesce(s.seq_scan,0) + coalesce(s.idx_scan,0)       as leituras,
  s.n_live_tup                                          as linhas,
  (cv.relname is not null)                              as usada_por_view,
  (cf.relname is not null)                              as usada_por_funcao,
  (cc.relname is not null)                              as usada_por_cron,
  (fk.relname is not null)                              as alvo_de_fk
from rel r
left join pg_stat_user_tables s on s.relid = r.oid
left join consumo_view cv on cv.relname = r.relname
left join consumo_func cf on cf.relname = r.relname
left join consumo_cron cc on cc.relname = r.relname
left join tem_fk       fk on fk.relname = r.relname
where cv.relname is null
  and cf.relname is null
  and cc.relname is null
order by coalesce(s.seq_scan,0) + coalesce(s.idx_scan,0) asc,
         pg_total_relation_size(r.oid) desc;
