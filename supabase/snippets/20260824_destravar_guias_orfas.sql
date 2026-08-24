-- =============================================================================
-- Aplicar e conferir o destravamento de get_guias_orfas (incidente de 24/08)
-- =============================================================================
-- Rodar no SQL Editor, bloco a bloco, NÃO por `db push` — o push não seleciona
-- arquivo, empurra todo o pendente.
--
-- Ordem: MEDIR (1) -> ÍNDICE (2) -> FUNÇÃO (3) -> MEDIR DE NOVO (4) ->
-- CONFERIR QUE A LISTA NÃO MUDOU (5) -> LIVRO-CAIXA (6).
-- =============================================================================


-- ── 1. O antes ───────────────────────────────────────────────────────────────
-- Anote o tempo total e a CONTAGEM (o passo 5 compara contra ela).
-- Esperado hoje: dezenas de segundos, com Seq Scan em fila_autorizacoes dentro
-- de um nested loop.

explain (analyze, buffers)
select * from public.get_guias_orfas('2026-08-01', '2026-08-24');

select count(*) as linhas, min(guia) as menor_guia, max(guia) as maior_guia
from public.get_guias_orfas('2026-08-01', '2026-08-24');


-- ── 2. O índice ──────────────────────────────────────────────────────────────
-- SOZINHO, em statement próprio: `concurrently` não roda dentro de bloco de
-- transação. Se o SQL Editor reclamar de transação, rodar só esta linha,
-- selecionando-a.
-- Conteúdo de supabase/migrations/20260824000000_indice_fila_numero_autorizacao.sql

create index concurrently if not exists idx_fila_autorizacoes_guia_horario
  on public.fila_autorizacoes (numero_autorizacao, horario_autorizacao)
  where numero_autorizacao is not null;

-- Confirma que ficou válido (INVALID acontece quando o concurrently é
-- interrompido; um índice inválido não é usado pelo planner e passa despercebido).
select i.indexrelid::regclass as indice, i.indisvalid, i.indisready,
       pg_size_pretty(pg_relation_size(i.indexrelid)) as tamanho
from pg_index i
where i.indexrelid = 'public.idx_fila_autorizacoes_guia_horario'::regclass;


-- ── 3. A função ──────────────────────────────────────────────────────────────
-- Colar aqui o conteúdo de
-- supabase/migrations/20260824010000_orfas_usam_o_indice_da_guia.sql
-- (o arquivo inteiro; o `create or replace` já traz search_path,
-- statement_timeout e security definer no corpo).

-- Depois de aplicar, confirmar que o proconfig sobreviveu:
select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_guias_orfas';
-- Esperado: security_definer = true e proconfig contendo
-- {search_path=public, statement_timeout=15s}


-- ── 4. O depois ──────────────────────────────────────────────────────────────
-- Alvo: Index Scan em idx_fila_autorizacoes_guia_horario e total abaixo de 1 s.

explain (analyze, buffers)
select * from public.get_guias_orfas('2026-08-01', '2026-08-24');


-- ── 5. A lista não pode ter mudado ───────────────────────────────────────────
-- O predicado novo é equivalente ao antigo, então isto tem de bater EXATAMENTE
-- com o que o passo 1 devolveu. Se não bater, reverter a função e investigar
-- antes de seguir — divergência aqui significa guia órfã aparecendo ou sumindo
-- da Reconciliação.

select count(*) as linhas, min(guia) as menor_guia, max(guia) as maior_guia
from public.get_guias_orfas('2026-08-01', '2026-08-24');


-- ── 6. Livro-caixa ───────────────────────────────────────────────────────────
-- Sem isto o ambiente diverge do repo e o próximo `db push` tenta reaplicar.

insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260824000000', 'indice_fila_numero_autorizacao'),
  ('20260824010000', 'orfas_usam_o_indice_da_guia')
on conflict (version) do nothing;


-- ── Extra: a fila está sendo varrida por mais alguém? ────────────────────────
-- Se o banco continuar pesado depois disto, este é o próximo lugar para olhar —
-- as 10 chamadas mais caras acumuladas, para ver se sobrou outra varredura.
-- (Requer pg_stat_statements; zerar antes com select pg_stat_statements_reset()
-- se quiser medir só a janela nova.)

select calls,
       round(total_exec_time::numeric, 0) as ms_total,
       round(mean_exec_time::numeric, 0)  as ms_medio,
       left(query, 120) as query
from pg_stat_statements
order by total_exec_time desc
limit 10;
