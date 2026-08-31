-- Diagnóstico dos WARNINGS do Supabase Advisors — 2026-08-17
-- SOMENTE LEITURA. Nenhum GRANT, REVOKE, ALTER ou DDL.
-- Contexto: docs/warnings-supabase/ANALISE.md
--
-- Rodar bloco a bloco no SQL Editor e colar o resultado de volta na análise.


-- ============================================================
-- 1. Quem realmente pode executar o quê (a causa-raiz dos 55+48)
-- ============================================================
-- Coluna-chave: execute_para_public. Se TRUE, o grant nominal para
-- service_role é decorativo — anon já entra por PUBLIC.
-- Coluna-crítica: service_role_explicito. Se FALSE e execute_para_public
-- for TRUE, essa função QUEBRA CALADA num "REVOKE FROM PUBLIC" sem
-- o GRANT correspondente.
select
  n.nspname                                          as schema,
  p.proname                                          as funcao,
  pg_get_function_identity_arguments(p.oid)          as args,
  p.prosecdef                                        as security_definer,
  pg_get_function_result(p.oid)                      as retorno,
  exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  )                                                  as execute_para_public,
  exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE'
  )                                                  as service_role_explicito,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_pode,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prosecdef                                   -- só SECURITY DEFINER
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by
  (pg_get_function_result(p.oid) = 'trigger'),      -- gatilhos por último (ruído)
  n.nspname,
  p.proname;


-- ============================================================
-- 1b. As que vão quebrar em silêncio na Fase 2
-- ============================================================
-- Lista curta e acionável: DEFINER, aberta a PUBLIC, e SEM service_role
-- explícito. Cada linha aqui precisa de um GRANT antes do REVOKE.
select n.nspname || '.' || p.proname || '(' ||
       pg_get_function_identity_arguments(p.oid) || ')' as assinatura
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prosecdef
  and pg_get_function_result(p.oid) <> 'trigger'
  and exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  )
  and not exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE'
  )
order by 1;


-- ============================================================
-- 2. search_path: quem tem, quem não tem, e com qual valor
-- ============================================================
-- As migrations definem ~47 funções com SET search_path e o advisor
-- acusa 77 sem. Esta consulta mostra a divergência real do banco.
select
  n.nspname                                 as schema,
  p.proname                                 as funcao,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer,
  coalesce(
    (select c from unnest(p.proconfig) c where c like 'search_path=%'),
    '(NENHUM)'
  )                                         as search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prokind = 'f'
order by (p.proconfig is not null), n.nspname, p.proname;


-- ============================================================
-- 3. Extensões em public e quem depende delas
-- ============================================================
-- Decide o search_path da Fase 5: se estas funções existem, o path
-- precisa ser 'public, extensions, pg_temp' e não 'public, pg_temp'.
select e.extname, n.nspname as schema_atual
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by n.nspname, e.extname;

select
  n.nspname || '.' || p.proname as funcao,
  case
    when p.prosrc ~* 'unaccent\s*\(' then 'unaccent'
    when p.prosrc ~* 'net\.http'     then 'pg_net'
    else 'http'
  end                           as depende_de,
  coalesce(
    (select c from unnest(p.proconfig) c where c like 'search_path=%'),
    '(NENHUM)'
  )                             as search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prosrc ~* '(unaccent\s*\(|net\.http|http_(get|post|post_file)\s*\()'
order by 2, 1;


-- ============================================================
-- 4. Policies always-true (as 24), com o texto completo
-- ============================================================
select
  schemaname || '.' || tablename as tabela,
  policyname,
  cmd,
  roles,
  coalesce(qual, '-')       as using_clause,
  coalesce(with_check, '-') as with_check_clause
from pg_policies
where schemaname in ('public', 'central')
  and cmd <> 'SELECT'
  and (qual = 'true' or with_check = 'true')
order by tablename, cmd, policyname;


-- ============================================================
-- 4b. Policies duplicadas na mesma tabela/comando
-- ============================================================
-- Esperado: public.logs com 3 INSERT idênticas. Some 2 warnings sem
-- mudar comportamento nenhum.
select
  schemaname || '.' || tablename as tabela,
  cmd,
  count(*)                       as qtd,
  array_agg(policyname order by policyname) as policies
from pg_policies
where schemaname in ('public', 'central')
group by 1, 2
having count(*) > 1
order by 3 desc, 1;


-- ============================================================
-- 6. Policies amplas que podem estar anulando as granulares
-- ============================================================
-- O bloco 4b revelou 5 policies de SELECT em fila_autorizacoes, 3 em
-- agenda_terapias, 3 em usuarios. Policies permissivas somam com OR: basta
-- UMA ampla para tornar todas as finas decorativas.
-- O advisor não reporta isso (ele só olha non-SELECT com `true`).
-- Objetivo: ver o texto e decidir se as policies por setor têm algum efeito.
select
  schemaname || '.' || tablename as tabela,
  policyname,
  cmd,
  permissive,
  roles,
  coalesce(qual, '-')       as using_clause,
  coalesce(with_check, '-') as with_check_clause
from pg_policies
where (schemaname, tablename) in (
        ('public','fila_autorizacoes'),
        ('public','agenda_terapias'),
        ('public','autorizacoes'),
        ('public','usuarios'),
        ('public','controle_terapeutico')
      )
order by tablename, cmd, policyname;


-- ============================================================
-- 7. Quem perde acesso se as policies amplas caírem
-- ============================================================
-- O bloco 6 confirmou: "Usuarios autenticados podem acessar" (ALL) e
-- select_fila (true) tornam decorativas as 7 policies granulares da
-- fila_autorizacoes. Derrubá-las ATIVA um modelo de papéis dormente.
-- Isto mede quem sobra de fora antes de qualquer DROP POLICY.

-- 7a. Distribuição real dos papéis
select
  coalesce(role, '(null)') as role,
  ativo,
  count(*)                 as usuarios
from public.usuarios
group by 1, 2
order by 3 desc;

-- 7b. Cobertura por papel nas policies granulares da fila_autorizacoes
-- Papéis citados nas granulares: recepcao, terapeutico, autorizacao,
-- diretoria (+ admin via fila_autorizacoes_admin_all).
-- Qualquer papel FORA desta lista perde a fila inteira no drop.
select
  coalesce(u.role, '(null)') as role,
  count(*) filter (where u.ativo) as ativos,
  case
    when u.role in ('recepcao','terapeutico','autorizacao','diretoria','admin')
      then 'coberto'
    else '>>> PERDE ACESSO <<<'
  end as situacao
from public.usuarios u
group by u.role
order by 3 desc, 2 desc;

-- 7c. Papéis distintos usados em QUALQUER policy do banco
-- Serve para achar papel que existe no código mas em nenhuma policy,
-- e vice-versa.
select distinct
  substring(qual from '''([a-z_]+)''::text') as papel_citado_em_policy
from pg_policies
where schemaname in ('public','central')
  and qual ~ '''[a-z_]+''::text'
order by 1;


-- ============================================================
-- 5. Contraprova do robô (o padrão a copiar)
-- ============================================================
-- Deve mostrar execute_para_public = FALSE, anon_pode = TRUE,
-- auth_pode = FALSE. É o único bloco do banco já correto.
select
  p.proname                                                as funcao,
  exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  )                                                        as execute_para_public,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_pode,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_pode
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'robo\_%'
order by p.proname;
