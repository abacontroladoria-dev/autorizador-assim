-- FASE 1 do fix dos ERRORS dos Advisors — fechar o anon nas 17 views (2026-08-17)
--
-- POR QUE ISSO PRIMEIRO, E NÃO O security_invoker:
--
-- O lint pede `security_invoker = true`. Isso é a cura certa, mas mexe no que
-- cada usuário logado vê (a RLS das tabelas base passa a valer) e pode zerar
-- tela sem dar erro. Já REVOKE no anon é o oposto: mata a exposição real —
-- leitura de dado de paciente com a chave pública, sem login — e não muda nada
-- pra quem está autenticado.
--
-- É exatamente o cenário que a própria migration 20260806110000 escreveu como
-- o que NÃO podia acontecer (linhas 217-233):
--
--   "Hoje isso não vaza nada — as views são security_invoker e a policy da
--    tabela base não contempla anon. Mas a proteção está vindo só da RLS; basta
--    alguém trocar a view para security_definer, ou criar uma policy para anon,
--    para que nome de paciente e agenda inteira fiquem legíveis com a chave
--    pública embutida no JS."
--
-- Estas 17 views são security_definer. A metade do cenário que faltava.
--
-- ATENÇÃO: rode o BLOCO 2 do diagnóstico antes, pra ter a medida do "antes".
-- Depois deste script, o BLOCO 2 deve dar erro de permissão em todas as linhas.
--
-- SEGURO PARA APLICAR: nenhuma rota pública usa estas views. A única tela sem
-- login é /tv, que hoje lê por /api/tv/* com service_role (ver
-- frontend/app/api/tv/), não pelo client anon.

begin;

revoke all on public.vw_reposicao_faltas              from anon;
revoke all on public.vw_match_autorizacoes_assim      from anon;
revoke all on public.vw_central_terapeutica           from anon;
revoke all on public.vw_central_autorizacoes          from anon;
revoke all on public.vw_auditoria_autorizacoes_assim  from anon;
revoke all on public.vw_faltas_pacientes              from anon;
revoke all on public.vw_controle_terapeutico          from anon;
revoke all on public.agenda_tita_autorizacao          from anon;
revoke all on public.vw_profissionais_disponiveis     from anon;
revoke all on public.vw_terapeutas_semana             from anon;
revoke all on public.vw_blocos_autorizaveis_assim     from anon;
revoke all on public.agenda_tita_autorizacao_v2       from anon;
revoke all on public.vw_kpis_auditoria_assim          from anon;
revoke all on public.vw_modal_substituicao_terapeutas from anon;
revoke all on public.vw_central_pacientes             from anon;
revoke all on public.vw_acomp_auditoria               from anon;
revoke all on public.occurrences                      from anon;

-- Impede que a próxima view nova do schema public nasça aberta pro anon.
-- É o default privilege da Supabase que vinha concedendo sem ninguém pedir
-- (verificado no dump de produção de 2026-08-06, vw_grade_base).
alter default privileges in schema public revoke all on tables from anon;

-- Conferência: tem que voltar zero linhas.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and has_table_privilege('anon', c.oid, 'SELECT')
  and c.relname in (
    'vw_reposicao_faltas', 'vw_match_autorizacoes_assim', 'vw_central_terapeutica',
    'vw_central_autorizacoes', 'vw_auditoria_autorizacoes_assim', 'vw_faltas_pacientes',
    'vw_controle_terapeutico', 'agenda_tita_autorizacao', 'vw_profissionais_disponiveis',
    'vw_terapeutas_semana', 'vw_blocos_autorizaveis_assim', 'agenda_tita_autorizacao_v2',
    'vw_kpis_auditoria_assim', 'vw_modal_substituicao_terapeutas', 'occurrences',
    'vw_central_pacientes', 'vw_acomp_auditoria'
  );

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- O `alter default privileges` acima só vale pro role que o executou.
-- Confira se sobrou outro concedente (postgres vs supabase_admin):
-- ─────────────────────────────────────────────────────────────────────────────
-- select pg_get_userbyid(defaclrole) as concedente, defaclobjtype, defaclacl
--   from pg_default_acl d
--   join pg_namespace n on n.oid = d.defaclnamespace
--  where n.nspname = 'public';

-- ─────────────────────────────────────────────────────────────────────────────
-- PENDENTE DE CONFIRMAÇÃO SUA — não rodei, é destrutivo:
-- ─────────────────────────────────────────────────────────────────────────────
-- `public.occurrences` é ponte pro schema `cco`, criada em 20260610000005 com a
-- justificativa "Enables REST API access for dashboards and test validation
-- scripts". Referências que sobraram no repo: só as edge functions cco-* (mortas
-- desde 11/06) e tests/validate_occurrences.py. Zero uso no frontend.
--
-- Se confirmar que o CCO está morto pra valer, o certo é dropar em vez de só
-- revogar — e junto com ela a edge `cco-test-setup`, que é o C5 da auditoria de
-- 2026-07-06 (backdoor service_role sem auth) e ainda está no repo:
--
--   drop view if exists public.occurrences;
