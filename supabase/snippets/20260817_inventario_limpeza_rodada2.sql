-- ============================================================================
-- Limpeza — rodada 2: desempatar os candidatos  —  2026-08-17
-- ============================================================================
-- Por que existe: o BLOCO C da rodada 1 casa TEXTO do corpo da função. Um CTE
-- chamado `terapeutas` fica idêntico à tabela `terapeutas`. Já confirmei um
-- falso positivo assim: refresh_dashboard_kpis "usa terapeutas", mas é um CTE
-- — a função lê grade_profissionais_tita. Regex nenhuma resolve isso; só olhar
-- o trecho resolve.
--
-- Tudo leitura. Nada altera dado.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCO H — o trecho exato onde cada candidato aparece no corpo das funções
-- Olhe a coluna `trecho`: se vier depois de FROM/JOIN é uso real; se vier
-- seguido de "AS (" é CTE (falso positivo).
-- ----------------------------------------------------------------------------
with candidatos(nome) as (
  values ('autorizacoes'), ('sessions'), ('terapeutas'), ('guia_terapias'),
         ('logs_execucao'), ('agenda_terapias'), ('remuneracao_historico'),
         ('acomp_auditoria'), ('acomp_prof_map'), ('crm_inconsistencias'),
         ('paciente_medico_vigente'), ('auditoria_glosa_motivos')
)
select
  c.nome,
  p.proname as funcao,
  (regexp_matches(
     p.prosrc,
     '(.{0,60}\m' || c.nome || '\M.{0,60})',
     'gi'
   ))[1] as trecho
from candidatos c
join pg_proc p
  on p.pronamespace = 'public'::regnamespace
 and p.prosrc ~* ('\m' || c.nome || '\M')
order by c.nome, p.proname;


-- ----------------------------------------------------------------------------
-- BLOCO I — data do reset de estatísticas
-- Sem isso, "poucas leituras" no bloco E não prova nada. Decide também se as
-- leituras acumuladas nas duas "EM DESUSO -" são antigas (de antes do rename)
-- ou recentes (alguém ainda lê).
-- ----------------------------------------------------------------------------
select stats_reset,
       now() - stats_reset as tempo_acumulado,
       now()               as agora
from pg_stat_database
where datname = current_database();


-- ----------------------------------------------------------------------------
-- BLOCO J — as duas "EM DESUSO -": quem ainda as lê?
-- Nome com espaço/hífen escapou do filtro do bloco C da rodada 1.
-- ----------------------------------------------------------------------------
select p.proname as funcao, 'funcao' as origem
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosrc ilike '%EM DESUSO%'
union all
select c.relname, 'view'
from pg_class c
join pg_rewrite r on r.ev_class = c.oid
where c.relnamespace = 'public'::regnamespace
  and pg_get_viewdef(c.oid) ilike '%EM DESUSO%'
union all
select j.jobname, 'cron'
from cron.job j
where j.command ilike '%EM DESUSO%';


-- ----------------------------------------------------------------------------
-- BLOCO F (refazer — truncou) — FK e triggers
-- ----------------------------------------------------------------------------
select conrelid::regclass::text  as tabela_filha,
       confrelid::regclass::text as tabela_referenciada,
       conname                   as constraint_nome
from pg_constraint
where contype = 'f'
  and connamespace = 'public'::regnamespace
  and confrelid::regclass::text in (
    'autorizacoes','sessions','terapeutas','guia_terapias','logs_execucao',
    'agenda_terapias','remuneracao_historico','acomp_auditoria','acomp_prof_map',
    'crm_inconsistencias','"EM DESUSO - remuneracao_contratos_atuais"',
    '"EM DESUSO - remuneracao_contratos_antigos"'
  )
order by tabela_referenciada, tabela_filha;

select c.relname as tabela, t.tgname as trigger_nome, p.proname as funcao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relnamespace = 'public'::regnamespace
  and c.relname in (
    'autorizacoes','sessions','terapeutas','guia_terapias','logs_execucao',
    'agenda_terapias','remuneracao_historico','acomp_auditoria','acomp_prof_map',
    'crm_inconsistencias'
  )
order by c.relname, t.tgname;


-- ----------------------------------------------------------------------------
-- BLOCO K — hotspots de leitura (não é limpeza, é o Disk IO)
-- Tabelas minúsculas levando dezenas de milhares de seq scan: cada scan é
-- barato, o volume é que pesa. Vale saber quem chama.
-- ----------------------------------------------------------------------------
select relname                as tabela,
       n_live_tup             as linhas,
       seq_scan,
       seq_tup_read,
       round(seq_tup_read::numeric / nullif(seq_scan,0), 1) as linhas_por_scan
from pg_stat_user_tables
where schemaname = 'public'
  and seq_scan > 10000
order by seq_scan desc;
