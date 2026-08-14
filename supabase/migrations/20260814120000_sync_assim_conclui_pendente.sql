-- sync_assim_results carimbava a guia da ASSIM numa linha 'pendente' e deixava o
-- status como estava. O CASE só promovia 'Liberado' a 'concluido' quando a linha
-- estava em 'erro'; 'pendente' caía no ELSE fa.status.
--
-- O efeito é pior do que "status errado na tela": robo_buscar_tarefa filtra
-- `status = 'pendente' AND machine_id = <eu>` (20260813100200_robo_rpcs.sql:170),
-- então a linha continuava elegível DEPOIS de já existir guia na ASSIM. O robô
-- pegaria de novo e autorizaria duas vezes — "1601-REINCIDENCIA NO ATEN".
--
-- Caso que revelou isto (Benício, 08:40 de 2026-08-14, Musicoterapia), em hora de
-- parede de São Paulo:
--   08:56 Laura solicita pelo /solicitar
--   08:59 reverte a falta -> volta a 'pendente'
--   09:03 a autorização sai na ASSIM (guia 217417) — feita À MÃO, porque o robô
--         nunca pegou a tarefa: started_at continuou NULL, e essa coluna só é
--         escrita por robo_buscar_tarefa, no mesmo UPDATE que grava 'processando'
--   09:35 sync_assim_results casa a guia, carimba tudo, e deixa 'pendente'
--
-- Duas mudanças, além de 'Liberado' com guia passar a concluir a partir de
-- 'pendente':
--
-- 1. O status novo passa a ser calculado UMA vez, numa CTE. Antes ele só existia
--    dentro do SET; agora `completed_at` precisa saber o resultado, e duplicar o
--    CASE seria garantir que as duas cópias divergissem com o tempo.
--
-- 2. `completed_at` é preenchido com o instante da ASSIM, convertido. A tabela
--    mistura dois fusos: horario_autorizacao guarda hora de parede de São Paulo
--    (ver 20260804040000) e completed_at guarda o now() do servidor, que no
--    Supabase é UTC. Copiar cru atrasaria o campo em 3h — no caso do Benício ele
--    ficaria ANTES do created_at da própria linha.

-- ---------------------------------------------------------------------------
-- Reclassifica status com base no retorno real do ASSIM:
--   'Liberado *' → cancelado
--   'Liberado'   → concluido  (o RPA não viu a tela de sucesso, ou ninguém usou
--                              o robô e a recepção autorizou na mão)
--   outro valor  → glosa      (código de rejeição, ex: "1601-REINCIDENCIA NO ATEN")
--   NULL         → mantém status atual
-- 'concluido' e 'falta' nunca são sobrescritos.
CREATE OR REPLACE FUNCTION public.sync_assim_results()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  WITH alvo AS (
    SELECT
      fa.id,
      vm.status_assim,
      vm.guia,
      vm.data_execucao,
      CASE
        WHEN vm.status_assim = 'Liberado *'
          AND fa.status <> 'concluido'
          THEN 'cancelado'

        WHEN vm.status_assim = 'Liberado'
          -- Sem guia não há prova de autorização: só o rótulo não tira a linha
          -- da fila. O ramo matches_falta da view produz guia NULL.
          AND vm.guia IS NOT NULL
          AND (
            fa.status IN ('erro', 'pendente')
            -- 'processando' só quando já está órfã. Sem esta guarda o sync
            -- viraria o status debaixo de uma tarefa viva, e o cancelado() de
            -- worker.js:226-231 abortaria a execução no meio do preenchimento.
            OR (
              fa.status = 'processando'
              AND fa.started_at IS NOT NULL
              AND fa.started_at < (now() AT TIME ZONE 'UTC') - INTERVAL '30 minutes'
            )
          )
          THEN 'concluido'

        WHEN vm.status_assim IS NOT NULL
          AND vm.status_assim NOT ILIKE '%Liberado%'
          AND fa.status NOT IN ('concluido', 'falta', 'pendente')
          THEN 'glosa'

        ELSE fa.status
      END AS status_novo
    FROM fila_autorizacoes fa
    JOIN vw_match_autorizacoes_assim vm
      ON  fa.paciente_id::bigint = vm.paciente_id
      AND fa.data_atendimento    = vm.data_atendimento
      AND fa.horario             = vm.hora_inicial
  )
  UPDATE fila_autorizacoes fa
  SET
    status_assim        = a.status_assim,
    status              = a.status_novo,
    numero_autorizacao  = a.guia,
    horario_autorizacao = a.data_execucao,
    -- Só onde a linha de fato terminou concluída, e só se ainda não havia marca:
    -- quem concluiu pelo robô já tem o completed_at verdadeiro.
    completed_at        = CASE
      WHEN fa.completed_at IS NULL
        AND a.status_novo = 'concluido'
        AND a.data_execucao IS NOT NULL
        THEN (a.data_execucao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
      ELSE fa.completed_at
    END,
    error_message       = CASE
      WHEN a.status_assim ILIKE '%REINCIDENCIA%' THEN a.status_assim
      WHEN a.status_assim ILIKE '%ERRO%'         THEN a.status_assim
      ELSE NULL
    END,
    assim_updated_at    = NOW()
  FROM alvo a
  WHERE fa.id = a.id;
END;
$function$;
