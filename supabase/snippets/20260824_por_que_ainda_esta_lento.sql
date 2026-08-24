-- =============================================================================
-- Por que ainda está lento — diagnóstico em 5 perguntas
-- =============================================================================
-- Os logs provam QUE o pool está saturado, mas o Postgres não registra o texto
-- da query cancelada: "canceling statement due to statement timeout" vem sem
-- Query Text. Então o log diz que 192 statements morreram entre 11:00 e 13:10 e
-- não diz quais. Estas 5 perguntas dizem.
--
-- Rodar no SQL Editor, um bloco por vez, e colar a saída.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O índice de 12:51 ficou VÁLIDO?  ← comece por aqui
-- -----------------------------------------------------------------------------
-- `create index concurrently` cancelado no meio não some: ele deixa o índice
-- para trás com indisvalid = false, e o planner ignora índice inválido SEM
-- avisar ninguém. O log mostra o comando começando 12:51:05, esperando ShareLock
-- duas vezes (2,4 s e 5,6 s), e dois statements sendo cancelados por timeout às
-- 12:51:14 e 12:51:23 — e nunca mostra o comando terminando. Se um daqueles
-- cancelamentos era o próprio CIC (o SQL Editor impõe statement_timeout de 58 s),
-- a correção de ontem está no banco só na aparência: get_guias_orfas continua
-- varrendo a tabela, agora com 15 s de timeout em vez de 55 s.
--
-- Esperado: valido = true. Se vier false, ver o bloco 1b.
select
  i.indexrelid::regclass                   as indice,
  i.indisvalid                             as valido,
  i.indisready                             as pronto,
  pg_size_pretty(pg_relation_size(i.indexrelid)) as tamanho
from pg_index i
where i.indexrelid = 'public.idx_fila_autorizacoes_guia_horario'::regclass;

-- 1b. Se valido = false, refazer. DROP primeiro: o `if not exists` do comando
-- original enxerga o índice inválido e não faz nada — repetir o create sem
-- dropar é um no-op silencioso.
--
--   drop index concurrently if exists public.idx_fila_autorizacoes_guia_horario;
--   create index concurrently idx_fila_autorizacoes_guia_horario
--     on public.fila_autorizacoes (numero_autorizacao, horario_autorizacao)
--     where numero_autorizacao is not null;
--
-- Rodar fora de horário de uso: CIC espera TODA transação aberta terminar antes
-- de começar, e às 12:51 ele já esperou 8 s só nisso.


-- -----------------------------------------------------------------------------
-- 2. E se ficou válido — o get_guias_orfas está mesmo usando ele?
-- -----------------------------------------------------------------------------
-- Trocar as datas por uma janela que a tela realmente pede.
-- Procurar na saída: "Index Scan using idx_fila_autorizacoes_guia_horario".
-- Se aparecer "Seq Scan on fila_autorizacoes", o índice existe e não serve.
explain (analyze, buffers, timing)
select * from public.get_guias_orfas(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 3. Quem está consumindo o banco de verdade (o ranking que falta no log)
-- -----------------------------------------------------------------------------
-- Ordenado por tempo TOTAL, não por tempo médio: uma query de 300 ms chamada
-- 4.000 vezes derruba o pool tanto quanto uma de 44 s chamada 20 vezes, e só
-- esta ordenação mostra as duas.
select
  round(total_exec_time / 1000.0)::int          as total_s,
  calls,
  round(mean_exec_time)::int                    as media_ms,
  round(max_exec_time)::int                     as max_ms,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_statements
where query not ilike '%pg_stat_statements%'
order by total_exec_time desc
limit 25;

-- 3b. O mesmo ranking, mas por tempo médio, restrito ao que passa de 1 s.
-- É aqui que aparece quem segura conexão do pool tempo suficiente para
-- transformar uma tela lenta em site inteiro fora do ar.
select
  round(mean_exec_time)::int                    as media_ms,
  calls,
  round(total_exec_time / 1000.0)::int          as total_s,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
from pg_stat_statements
where mean_exec_time > 1000
  and query not ilike '%pg_stat_statements%'
order by mean_exec_time desc
limit 25;


-- -----------------------------------------------------------------------------
-- 4. O que está aberto AGORA, e há quanto tempo
-- -----------------------------------------------------------------------------
-- Rodar durante uma lentidão, não depois. Duas coisas para procurar:
--   - `authenticated` com duracao alta  → é o pool do PostgREST sendo comido
--   - state = 'idle in transaction'     → conexão presa sem estar trabalhando;
--     é isso que faz o create index concurrently esperar para sempre
select
  pid,
  usename,
  application_name,
  state,
  now() - query_start                as duracao,
  now() - xact_start                 as transacao_aberta,
  wait_event_type || ':' || wait_event as esperando,
  left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query
from pg_stat_activity
where state <> 'idle'
  and pid <> pg_backend_pid()
order by xact_start nulls last;

-- 4b. Quantas conexões por role. O PostgREST loga "Connection Pool initialized
-- with a maximum size of 10 connections" — são 10 no total para o app inteiro.
select usename, state, count(*)
from pg_stat_activity
group by 1, 2
order by 3 desc;


-- -----------------------------------------------------------------------------
-- 5. O archive de WAL está falhando de novo?
-- -----------------------------------------------------------------------------
-- Log de 13:06:25: "archive command failed with exit code 1". Uma ocorrência é
-- ruído; falha contínua faz o WAL se acumular em disco até encher, e aí TUDO
-- fica lento pelo motivo mais burro possível. failed_count subindo entre duas
-- execuções deste select (com 1 min de intervalo) = está falhando em série.
select
  archived_count,
  last_archived_wal,
  last_archived_time,
  failed_count,
  last_failed_wal,
  last_failed_time,
  now() - last_archived_time as desde_o_ultimo_sucesso
from pg_stat_archiver;

-- 5b. Slots de replicação. O log mostra "logical decoding found consistent
-- point" quatro vezes em 40 minutos — o realtime recriando slot. Slot morto ou
-- atrasado segura WAL no disco indefinidamente.
select
  slot_name,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as wal_retido
from pg_replication_slots
order by pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) desc;
