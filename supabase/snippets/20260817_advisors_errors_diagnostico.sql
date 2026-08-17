-- Diagnóstico dos ERRORS do Supabase Advisors (2026-08-17)
--
-- SOMENTE LEITURA. Nada aqui altera o banco. O bloco 2 usa `set local role`
-- dentro de uma transação com ROLLBACK só para medir o que o anon consegue ler.
--
-- Os 19 ERRORS são 3 problemas, não 19:
--   A) usuarios com RLS desabilitado          (2 lints: rls_disabled_in_public + policy_exists_rls_disabled)
--   B) 17 views SECURITY DEFINER              (security_definer_view)
--   C) `occurrences`, ponte morta pro schema cco, é um caso especial de (B)
--
-- Rode bloco por bloco no SQL Editor e me traga a saída dos blocos 2 e 4 —
-- são os dois que decidem o que é seguro corrigir.

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — Estado real das 17 views: security_invoker e quem tem SELECT
-- ─────────────────────────────────────────────────────────────────────────────
-- `security_invoker` ausente = view roda como o dono (postgres) e IGNORA a RLS
-- das tabelas base. Se `anon_pode_ler` = true na mesma linha, então a chave
-- pública embutida no JS lê a view inteira sem login.

select
  c.relname                                                as view_name,
  coalesce(
    (select option_value
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'),
    '(nao definido = DEFINER)'
  )                                                        as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT')     as anon_pode_ler,
  has_table_privilege('authenticated', c.oid, 'SELECT')     as auth_pode_ler,
  pg_get_userbyid(c.relowner)                              as dono
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in (
    'vw_reposicao_faltas', 'vw_match_autorizacoes_assim', 'vw_central_terapeutica',
    'vw_central_autorizacoes', 'vw_auditoria_autorizacoes_assim', 'vw_faltas_pacientes',
    'vw_controle_terapeutico', 'agenda_tita_autorizacao', 'vw_profissionais_disponiveis',
    'vw_terapeutas_semana', 'vw_blocos_autorizaveis_assim', 'agenda_tita_autorizacao_v2',
    'vw_kpis_auditoria_assim', 'vw_modal_substituicao_terapeutas', 'occurrences',
    'vw_central_pacientes', 'vw_acomp_auditoria'
  )
order by anon_pode_ler desc, c.relname;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — Prova de exposição: quantas linhas o anon lê de fato
-- ─────────────────────────────────────────────────────────────────────────────
-- Qualquer contagem > 0 aqui é leitura NÃO AUTENTICADA de dado de paciente,
-- porque a anon key é pública (está no bundle do frontend).
-- Tudo dentro de begin/rollback: não altera nada.

begin;
set local role anon;

select 'vw_central_pacientes'             as view_name, count(*) as linhas_visiveis_ao_anon from public.vw_central_pacientes
union all select 'vw_central_terapeutica',            count(*) from public.vw_central_terapeutica
union all select 'vw_central_autorizacoes',           count(*) from public.vw_central_autorizacoes
union all select 'vw_terapeutas_semana',              count(*) from public.vw_terapeutas_semana
union all select 'vw_modal_substituicao_terapeutas',  count(*) from public.vw_modal_substituicao_terapeutas
union all select 'agenda_tita_autorizacao_v2',        count(*) from public.agenda_tita_autorizacao_v2
union all select 'vw_auditoria_autorizacoes_assim',   count(*) from public.vw_auditoria_autorizacoes_assim
union all select 'vw_acomp_auditoria',                count(*) from public.vw_acomp_auditoria
union all select 'occurrences',                       count(*) from public.occurrences
order by linhas_visiveis_ao_anon desc;

rollback;

-- Se alguma view acima der ERRO de permissão em vez de contagem, ótimo: aquela
-- view não está exposta ao anon. Comente a linha e rode o resto.

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — Estado da tabela usuarios
-- ─────────────────────────────────────────────────────────────────────────────
-- Espera-se relrowsecurity = false com 5 policies penduradas (é o que o lint diz).

select
  c.relname,
  c.relrowsecurity                                      as rls_habilitado,
  c.relforcerowsecurity                                 as rls_forcado,
  has_table_privilege('anon', c.oid, 'SELECT')          as anon_select,
  has_table_privilege('anon', c.oid, 'UPDATE')          as anon_update,
  has_table_privilege('anon', c.oid, 'INSERT')          as anon_insert,
  has_table_privilege('anon', c.oid, 'DELETE')          as anon_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'usuarios';

select policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public' and tablename = 'usuarios'
order by cmd, policyname;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 4 — O que quebra se eu ligar security_invoker em cada view
-- ─────────────────────────────────────────────────────────────────────────────
-- Ao virar invoker, a RLS das tabelas base passa a valer. Se uma tabela base
-- tem RLS ligado e NENHUMA policy de SELECT que alcance `authenticated`, a view
-- passa a devolver 0 linhas — silenciosamente, sem erro. É esse o risco.
--
-- Leia a coluna `veredito`:
--   OK                -> flip seguro (policy permissiva pra authenticated existe)
--   RLS SEM POLICY    -> flip devolve 0 linhas; precisa criar policy antes
--   POLICY RESTRITIVA -> flip muda o que o usuário vê (isolamento por unidade);
--                        pode ser desejado, mas é mudança de comportamento

with alvo(view_name) as (
  values ('vw_reposicao_faltas'), ('vw_match_autorizacoes_assim'), ('vw_central_terapeutica'),
         ('vw_central_autorizacoes'), ('vw_auditoria_autorizacoes_assim'), ('vw_faltas_pacientes'),
         ('vw_controle_terapeutico'), ('agenda_tita_autorizacao'), ('vw_profissionais_disponiveis'),
         ('vw_terapeutas_semana'), ('vw_blocos_autorizaveis_assim'), ('agenda_tita_autorizacao_v2'),
         ('vw_kpis_auditoria_assim'), ('vw_modal_substituicao_terapeutas'), ('occurrences'),
         ('vw_central_pacientes'), ('vw_acomp_auditoria')
),
deps as (
  select distinct
    v.relname   as view_name,
    tn.nspname  as base_schema,
    t.relname   as base_table,
    t.relrowsecurity as base_rls,
    t.relkind   as base_kind
  from pg_class v
  join pg_namespace vn on vn.oid = v.relnamespace
  join alvo a          on a.view_name = v.relname
  join pg_rewrite r    on r.ev_class = v.oid
  join pg_depend  d    on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
  join pg_class   t    on t.oid = d.refobjid and t.relkind in ('r','p','v','m')
  join pg_namespace tn on tn.oid = t.relnamespace
  where vn.nspname = 'public'
    and v.relkind = 'v'
    and t.oid <> v.oid
)
select
  d.view_name,
  d.base_schema || '.' || d.base_table            as tabela_base,
  d.base_rls                                      as base_tem_rls,
  coalesce(p.n_permissivas, 0)                    as policies_select_authenticated,
  coalesce(p.exprs, '')                           as using_das_policies,
  case
    when d.base_kind in ('v','m')            then 'VIEW ANINHADA (avalie separado)'
    when not d.base_rls                      then 'BASE SEM RLS (flip nao muda nada aqui)'
    when coalesce(p.n_permissivas, 0) = 0    then 'RLS SEM POLICY -> FLIP DEVOLVE 0 LINHAS'
    when p.exprs ilike '%true%'
     and p.exprs not ilike '%usuarios%'      then 'OK'
    else                                         'POLICY RESTRITIVA (muda o que o usuario ve)'
  end                                             as veredito
from deps d
left join (
  select schemaname, tablename,
         count(*)                        as n_permissivas,
         string_agg(coalesce(qual,'') , ' | ') as exprs
  from pg_policies
  where permissive = 'PERMISSIVE'
    and cmd in ('SELECT','ALL')
    and (roles && array['authenticated','public']::name[])
  group by schemaname, tablename
) p on p.schemaname = d.base_schema and p.tablename = d.base_table
order by
  case
    when d.base_kind in ('v','m') then 3
    when not d.base_rls then 4
    when coalesce(p.n_permissivas,0) = 0 then 1
    else 2
  end,
  d.view_name, tabela_base;
