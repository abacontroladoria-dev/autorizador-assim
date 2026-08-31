-- =============================================================================
-- Verificação de 20260824020000 — antes e depois, e a prova de que não mudou
-- o resultado
-- =============================================================================
-- Rodar o bloco 1 ANTES de aplicar a migration, guardando o número.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Linha de base (rodar antes) — quantos blocos a função devolve hoje
-- -----------------------------------------------------------------------------
-- Este número não pode mudar depois da migration. Se mudar, o cast invertido não
-- era equivalente e a migration volta atrás.
select count(*) as blocos, sum(quantidade_sessoes) as sessoes
from public.fn_blocos_assim(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 2. Aplicar a migration, e então: mesmo número?
-- -----------------------------------------------------------------------------
-- Igual ao bloco 1. Comparar com o que foi guardado.
select count(*) as blocos, sum(quantidade_sessoes) as sessoes
from public.fn_blocos_assim(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 3. E quanto tempo agora
-- -----------------------------------------------------------------------------
-- Referências medidas hoje, mesma janela de 7 dias:
--   48.850 ms  antes do analyze
--   13.126 ms  depois do analyze (buffers 53.938)
--
-- Procurar na saída:
--   - `Index Scan using unique_fila_agendamento` (ou outro índice de
--     fila_autorizacoes) no lugar de `Seq Scan on fila_autorizacoes`
--   - buffers caindo de ~54.000 para a casa dos milhares
--   - nenhum `Rows Removed by Join Filter` na casa das centenas de milhares
explain (analyze, buffers, timing)
select count(*) from public.fn_blocos_assim(current_date - 7, current_date);

-- 3b. E a RPC inteira, que é o que a tela chama. Tem de ficar confortavelmente
-- abaixo dos 8 s da role `authenticated` — senão a Reconciliação continua
-- falhando calada no catch de useAnaliseReincidencia.ts:475-481.
explain (analyze, buffers, timing)
select * from public.get_guias_orfas(current_date - 7, current_date);


-- -----------------------------------------------------------------------------
-- 4. A janela que a tela realmente usa
-- -----------------------------------------------------------------------------
-- get_guias_orfas foi escrita para varrer um mês (20260821000000:162). Os 7 dias
-- acima são o caso fácil. Medir o mês antes de dar por encerrado.
explain (analyze, buffers, timing)
select count(*) from public.get_guias_orfas(date_trunc('month', current_date)::date, current_date);


-- -----------------------------------------------------------------------------
-- 5. O autovacuum que não chega em agenda_tita
-- -----------------------------------------------------------------------------
-- Achado do diagnóstico, independente do cast:
--   agenda_tita               last_autoanalyze 2026-08-05 (19 dias)   14,4% morto
--   grade_profissionais_tita  autoanalyze_count 1111, autovacuum_count 496
--
-- Uma tabela com sync diário sem analyze há 19 dias, e a vizinha com 1.111
-- analyzes. O autovacuum está inteiro ocupado com grade_profissionais_tita. O
-- `analyze` manual de hoje resolveu o sintoma uma vez; sem mexer nos thresholds
-- a estatística envelhece de novo.
--
-- Este select mostra se agenda_tita voltou a ficar para trás. Não corrige nada.
select
  relname,
  n_live_tup, n_mod_since_analyze,
  last_autoanalyze,
  now() - last_autoanalyze as ha_quanto_tempo,
  autoanalyze_count
from pg_stat_user_tables
where relname in ('agenda_tita', 'grade_profissionais_tita', 'fila_autorizacoes')
order by last_autoanalyze nulls first;
