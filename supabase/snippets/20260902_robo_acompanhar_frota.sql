-- ============================================================
-- Acompanhar a atualizacao dos robos
--
-- Tudo leitura. Rodar antes de liberar (foto do "antes"), e depois a cada
-- poucos minutos ate a frota inteira virar.
--
-- COMO A ATUALIZACAO CHEGA
-- Cada robo, no seu laco, manda `robo_heartbeat` e recebe `versao_disponivel` =
-- o ultimo `robo_pacotes` com publicado = true. Se for diferente da que ele
-- roda, ele baixa, confere a assinatura Ed25519, grava, e SAI com codigo 0 —
-- o supervisor (start.bat) o relanca ja na versao nova.
-- Nao ha canary: `versao_disponivel` e global, igual para todas as maquinas.
-- ============================================================


-- ============================================================
-- 1. QUEM ESTA EM QUE VERSAO                       [o principal]
-- ============================================================
-- `app_version` e escrito pelo proprio robo no heartbeat, entao ela so muda
-- depois que ele reiniciou de verdade na versao nova. E a prova de adesao.
--
-- ATENCAO ao ler `last_seen`: maquina que nao aparece ha horas nao vai
-- atualizar — ela esta desligada, nao "com problema na atualizacao".

select
  id,
  app_version,
  ativa,
  last_seen,
  round(extract(epoch from (now() - last_seen)) / 60)::int as visto_ha_min,
  case
    when last_seen is null                        then 'nunca apareceu'
    when now() - last_seen > interval '2 hours'   then 'desligada'
    when app_version = '1.1.7'                    then 'ATUALIZADA'
    when app_version is null                      then 'legado (nao reporta versao)'
    else                                               'ainda na ' || app_version
  end as situacao
from public.maquinas
order by app_version nulls last, last_seen desc nulls last;


-- ============================================================
-- 2. PLACAR                                       [uma linha]
-- ============================================================
-- Para acompanhar sem ler a tabela inteira. So conta maquina viva na ultima
-- hora: as desligadas atualizam quando ligarem, e nao ha o que esperar delas.

select
  count(*) filter (where app_version = '1.1.7')                   as na_1_1_7,
  count(*) filter (where app_version = '1.1.6')                   as ainda_na_1_1_6,
  count(*) filter (where app_version is null)                     as sem_versao,
  count(*)                                                        as vivas_na_ultima_hora
from public.maquinas
where last_seen > now() - interval '1 hour';


-- ============================================================
-- 3. O PACOTE ESTA LIBERADO MESMO?                 [se nada mudar]
-- ============================================================
-- Primeira coisa a conferir quando a frota nao vira: o insert entra com
-- publicado = false de proposito, e e comum esquecer o update que libera.

select versao, publicado, created_at, left(notas, 80) as notas
from public.robo_pacotes
order by created_at desc
limit 5;


-- ============================================================
-- 4. O ROBO ESTA TRABALHANDO?                      [saude, nao versao]
-- ============================================================
-- Depois de atualizar, o que importa e se as tarefas continuam fluindo.
-- 'erro' subindo depois da virada e o sinal de que algo quebrou.

select
  status,
  count(*) as qtd,
  max(updated_at) as mais_recente
from public.fila_autorizacoes
where data_atendimento = current_date
group by status
order by qtd desc;


-- ============================================================
-- 5. OS DOIS COMPORTAMENTOS NOVOS, NO LOG          [a prova real]
-- ============================================================
-- O robo registra na fila o que fez. Estas duas mensagens so existem na 1.1.7:
-- a primeira e a Parte A cedendo a vez, a segunda e a Parte B protegendo o
-- token. Ver qualquer uma delas e a prova de que a versao nova esta rodando.
--
-- Se aparecer MUITA linha de "diverge do registro da ASSIM", o cadastro esta
-- fora de sincronia com a base da operadora — vale investigar antes de culpar
-- o robo.

select
  l.created_at,
  f.paciente_nome,
  l.descricao
from public.fila_autorizacoes_logs l
join public.fila_autorizacoes f on f.id = l.fila_id
where l.created_at > now() - interval '1 day'
  and (
    l.descricao ilike '%token%'
    or l.descricao ilike '%diverge do registro%'
    or l.descricao ilike '%deixado para a recepcao%'
  )
order by l.created_at desc
limit 50;
