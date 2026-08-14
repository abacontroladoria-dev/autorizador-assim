-- =============================================================================
-- FASE 1 — reparo do estrago do "Liberar processos travados"
-- =============================================================================
-- Rode BLOCO A. Olhe o resultado. Só então rode o BLOCO B.
-- A frota tem de estar parada (Fase 0) antes de qualquer coisa aqui.
--
-- Assinatura das linhas afetadas: status='pendente' E started_at IS NOT NULL.
-- Linha criada pelo /solicitar nasce com started_at NULL; só robo_buscar_tarefa
-- escreve nessa coluna, e o release-stuck não a limpa.
-- =============================================================================


-- #############################################################################
-- BLOCO A — DIAGNÓSTICO (read-only). Rode e leia antes de seguir.
-- #############################################################################

SELECT
  fa.data_atendimento,
  fa.horario,
  fa.paciente_nome,
  fa.machine_id,
  fa.numero_autorizacao,
  fa.status_assim,
  (fa.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS liberado_em_sp,
  CASE
    WHEN fa.numero_autorizacao IS NOT NULL
      THEN 'JA TEM GUIA -> bloco B1'
    WHEN fa.data_atendimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      THEN 'DIA PASSADO -> bloco B2'
    ELSE 'de hoje, sem guia -> nao mexer, o robo processa'
  END AS destino
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
ORDER BY fa.data_atendimento, fa.horario;


-- Resumo: quantas, de quantos dias, em quais estações.
SELECT
  fa.data_atendimento,
  fa.machine_id,
  count(*)                                                  AS linhas,
  count(*) FILTER (WHERE fa.numero_autorizacao IS NOT NULL) AS ja_com_guia
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- O robô chegou a executar alguma DEPOIS do clique? Se voltar linha, confira
-- essas na ASSIM antes de continuar.
SELECT
  fa.data_atendimento, fa.horario, fa.paciente_nome, fa.status, fa.numero_autorizacao,
  (fa.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS concluido_em_sp
FROM public.fila_autorizacoes fa
WHERE fa.started_at IS NOT NULL
  AND fa.completed_at IS NOT NULL
  AND fa.completed_at > (now() AT TIME ZONE 'UTC') - INTERVAL '6 hours'
ORDER BY fa.completed_at DESC;


-- #############################################################################
-- BLOCO B — REPARO. Cole os dois juntos: rodam numa transação só.
-- #############################################################################

BEGIN;

-- B1. Já têm guia: estão autorizadas na ASSIM. Concluem.
--     (Depois da Fase 2, sync_assim_results faria isso sozinha — mas as máquinas
--      ainda estão paradas e é melhor tirar essas da fila agora.)
UPDATE public.fila_autorizacoes
SET status       = 'concluido',
    completed_at = COALESCE(
      completed_at,
      (horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
    ),
    updated_at   = now()
WHERE status = 'pendente'
  AND started_at IS NOT NULL
  AND numero_autorizacao IS NOT NULL;

-- B2. Dias passados sem guia: não podem ser autorizadas hoje. Voltam para 'erro'
--     com o motivo escrito — que é onde de fato estavam, travadas. Ficam visíveis
--     no ModalErros para alguém decidir caso a caso.
UPDATE public.fila_autorizacoes
SET status        = 'erro',
    error_message = 'Reaberta por engano pelo "Liberar processos travados" em '
                    || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                    || '. Sessao de dia anterior: autorizar hoje carimbaria a data errada na ASSIM.',
    updated_at    = now()
WHERE status = 'pendente'
  AND started_at IS NOT NULL
  AND numero_autorizacao IS NULL
  AND data_atendimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date;

-- CONFERÊNCIA antes de confirmar: só pode sobrar linha de HOJE e sem guia.
SELECT
  fa.data_atendimento,
  count(*)                                                  AS ainda_pendentes,
  count(*) FILTER (WHERE fa.numero_autorizacao IS NOT NULL) AS com_guia
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
GROUP BY 1
ORDER BY 1;

COMMIT;
-- Se o resultado acima mostrar dia que não é hoje, ou com_guia > 0: ROLLBACK;
