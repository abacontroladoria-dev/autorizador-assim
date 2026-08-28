-- Fase 4 — search_path fixo nas 77 funções (advisor 0011)
-- 2026-08-17 · contexto: docs/warnings-supabase/ANALISE.md §4
--
-- Fecha 77 dos 129 warnings restantes: 60% do que sobrou, e o de menor risco.
--
-- ─── COMO ISTO FALHA ─────────────────────────────────────────────────────────
-- search_path errado NÃO quebra na hora de aplicar. Quebra na hora de CHAMAR,
-- com "relation X does not exist" ou "function X does not exist". Para as
-- funções de tela isso aparece na hora; para as de cron, só no próximo ciclo.
-- Por isso o bloco 1 é um ensaio que mostra o que cada uma receberia.
--
-- ─── POR QUE É SEGURO ────────────────────────────────────────────────────────
-- O caminho gerado é `<schema da função>, public, extensions, pg_temp` — um
-- superconjunto do que o `"$user", public` padrão resolve hoje. Referência já
-- qualificada por schema (net.http_post, auth.uid, central.tabela) não depende
-- de search_path e continua igual.
--
-- ─── DUAS DECISÕES JÁ TOMADAS ────────────────────────────────────────────────
-- 1. `extensions` entra no caminho mesmo hoje sendo inútil (unaccent, http e
--    pg_net estão em `public`). É de graça agora e evita ter que revisitar as
--    77 se um dia as extensões saírem de public.
-- 2. NÃO mexemos nas funções das extensões. O filtro `pg_depend deptype='e'`
--    exclui as 23 que pertencem a http/unaccent — o advisor também as ignora,
--    e ALTER nelas se perderia no próximo upgrade da extensão.

-- ============================================================
-- BLOCO 1 — ENSAIO (somente leitura). Rodar e ler antes de tudo.
-- ============================================================
-- Esperado: ~77 linhas. Confira a coluna `schemas_citados`: se alguma citar um
-- schema que NÃO esteja em `search_path_novo`, me avise antes de aplicar.
select
  n.nspname || '.' || p.proname                                  as funcao,
  pg_get_function_identity_arguments(p.oid)                      as args,
  p.prosecdef                                                    as definer,
  (
    select string_agg(distinct m[1], ', ' order by m[1])
    from regexp_matches(
           p.prosrc,
           '\m(auth|central|extensions|net|cron|vault|storage|graphql|realtime)\.',
           'g'
         ) as m
  )                                                              as schemas_citados,
  case when n.nspname = 'public'
       then 'public, extensions, pg_temp'
       else n.nspname || ', public, extensions, pg_temp'
  end                                                            as search_path_novo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prokind = 'f'
  -- sem search_path hoje = exatamente o que o advisor 0011 acusa
  and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%'
      )
  -- exclui funções que pertencem a extensão (http, unaccent): não são nossas
  and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
order by 1, 2;


-- ============================================================
-- BLOCO 2 — APLICAR
-- ============================================================
-- Um único comando, de propósito: DO é all-or-nothing. Não há como aplicar
-- metade disto por acidente, que foi o que aconteceu duas vezes hoje com
-- scripts de várias linhas.
--
-- Cada ALTER emite um NOTICE. O total sai no fim.
do $$
declare
  r        record;
  novo     text;
  contador int := 0;
begin
  for r in
    select p.oid,
           n.nspname as schema_nome,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'central')
      and p.prokind = 'f'
      and not exists (
            select 1 from unnest(coalesce(p.proconfig, '{}')) c
            where c like 'search_path=%'
          )
      and not exists (
            select 1 from pg_depend d
            where d.objid = p.oid and d.deptype = 'e'
          )
    order by n.nspname, p.proname
  loop
    novo := case when r.schema_nome = 'public'
                 then 'public, extensions, pg_temp'
                 else r.schema_nome || ', public, extensions, pg_temp'
            end;

    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      r.schema_nome, r.proname, r.args, novo
    );

    contador := contador + 1;
    raise notice 'search_path fixado: %.%(%)', r.schema_nome, r.proname, r.args;
  end loop;

  raise notice '--- % funcoes alteradas ---', contador;
end
$$;


-- ============================================================
-- BLOCO 3 — CONFERÊNCIA
-- ============================================================
-- Esperado: ZERO linhas. Qualquer função nossa ainda sem search_path é uma que
-- o bloco 2 não pegou.
select n.nspname || '.' || p.proname as ainda_sem_search_path,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'central')
  and p.prokind = 'f'
  and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%'
      )
  and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
order by 1;


-- ============================================================
-- TESTES — o que exercitar depois
-- ============================================================
-- As funções de TELA falham à vista e você descobre no primeiro clique:
--   /central-pacientes      listar_central_pacientes
--   /solicitar              listar_central_autorizacoes, rpc_horarios_disponiveis
--   /auditoria-assim        get_auditoria_assim, get_faltas_*, get_kpis_*
--   /alertas                get_alertas, get_alertas_contadores, get_alerta_historico
--   /relacionamento-prestador  fn_carga_dia, fn_continuidade_semana,
--                              fn_substituicoes_competencia, tuss_da_sessao
--
-- As de CRON só falham no próximo ciclo, e é aí que mora o risco. Vale olhar
-- cron.job_run_details no dia seguinte:
--   fn_sync_tita_hoje, fn_sync_tita_semana, fn_sync_tita_grade_hoje,
--   fn_sync_tita_operacional, fn_sync_tita_planejamento,
--   fn_sync_tita_reconciliacao, fn_enrich_tita_csv,
--   fn_reconcile_tita_csv_after_grade, sync_assim_results,
--   reconciliar_guias_por_janela, cleanup_old_audit_logs,
--   executar_relatorio_crm_inconsistente
--
-- E os GATILHOS, que falham no próximo INSERT/UPDATE da tabela:
--   inserir_na_fila_autorizacoes  (criar solicitação)
--   trigger_log_fila_autorizacoes (qualquer mexida na fila)
--   preencher_paciente_assim, ajustar_matricula_fila, ajustar_crm_fila
--   fn_set_tita_agendamento_id, fn_set_crm_uf, trg_canonizar_crm_agenda_orbita
--   sync_central_role_admin       (mudar papel de usuário)
--   fn_bloquear_alteracao_grade_passada
--   os set_cronograma_*_updated_at
--
-- Query para o dia seguinte:
--   select jobid, runid, status, return_message, start_time
--   from cron.job_run_details
--   where start_time > now() - interval '24 hours' and status <> 'succeeded'
--   order by start_time desc;
