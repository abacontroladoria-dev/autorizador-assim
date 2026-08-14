-- =============================================================================
-- "Liberar processos travados" ressuscitou trabalho antigo
-- =============================================================================
-- automation-release-stuck (supabase/functions/automation-release-stuck/index.ts:75-84)
-- faz UM update com apenas dois filtros:
--
--     .eq("status", "processando")
--     .lt("updated_at", <agora - 2h>)
--
-- Não filtra data_atendimento. Não filtra machine_id. Não olha se a linha já tem
-- numero_autorizacao. Então um clique devolve para 'pendente' TODA linha órfã em
-- 'processando' de QUALQUER dia da história, e cada uma volta para a fila da
-- estação que estiver no machine_id dela. Daí "solicitações aparecendo sozinhas,
-- de pacientes da tarde, no PC da Laura": não são novas, são antigas revividas.
--
-- De onde vinham as órfãs: quando sessao.abrirFormulario() falha (worker.js:236),
-- o catch de worker.js:269 nunca chama concluirTarefa, e a linha fica em
-- 'processando' para sempre. É o mesmo defeito que a Laura descreveu como
-- "não abriu a página de autorização".
--
-- ASSINATURA das linhas liberadas: status='pendente' E started_at IS NOT NULL.
-- Linha criada normalmente pelo /solicitar nasce com started_at NULL, e só
-- robo_buscar_tarefa escreve nessa coluna. release-stuck não a limpa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O QUE FOI LIBERADO (read-only) — rode primeiro
-- -----------------------------------------------------------------------------
-- Todas compartilham praticamente o mesmo updated_at: o instante do clique.

SELECT
  fa.data_atendimento,
  fa.horario,
  fa.paciente_nome,
  fa.terapia_nome,
  fa.machine_id,
  fa.numero_autorizacao,
  fa.status_assim,
  (fa.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS robo_pegou_em_sp,
  (fa.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS liberado_em_sp,
  CASE
    WHEN fa.numero_autorizacao IS NOT NULL
      THEN 'JA TEM GUIA — reautorizar gera REINCIDENCIA'
    WHEN fa.data_atendimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      THEN 'DIA PASSADO — autorizar hoje quebra o casamento por data'
    ELSE 'de hoje, sem guia — pode seguir'
  END AS risco
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
ORDER BY fa.data_atendimento, fa.horario;


-- Resumo por dia e por estação: o tamanho do estrago de um clique.
SELECT
  fa.data_atendimento,
  fa.machine_id,
  count(*)                                                    AS linhas,
  count(*) FILTER (WHERE fa.numero_autorizacao IS NOT NULL)   AS ja_com_guia
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;


-- O robô já chegou a executar alguma delas depois do clique? Se sim, confira na
-- ASSIM antes de qualquer outra coisa.
SELECT
  fa.data_atendimento, fa.horario, fa.paciente_nome, fa.status,
  fa.numero_autorizacao,
  (fa.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS concluido_em_sp
FROM public.fila_autorizacoes fa
WHERE fa.started_at IS NOT NULL
  AND fa.completed_at IS NOT NULL
  AND fa.completed_at > (now() AT TIME ZONE 'UTC') - INTERVAL '6 hours'
ORDER BY fa.completed_at DESC;


-- -----------------------------------------------------------------------------
-- 2. CONTENÇÃO — pare o robô antes de reparar
-- -----------------------------------------------------------------------------
-- Pausar não perde nada: robo_buscar_tarefa devolve NULL para máquina inativa e
-- as linhas ficam esperando. O que não tem volta é autorizar sessão de outro dia:
-- a ASSIM carimba data_execucao no instante da autorização, não na data do
-- atendimento, e todo o casamento por data quebra depois.

-- UPDATE public.maquinas SET ativa = false;


-- -----------------------------------------------------------------------------
-- 3. REPARO — devolver ao lugar (rode só depois de conferir a Seção 1)
-- -----------------------------------------------------------------------------
-- 3a. As que JÁ TÊM GUIA: estão autorizadas na ASSIM, então concluem.
--     (A migration 20260814120000 passa a fazer isso sozinha no próximo sync.)

-- BEGIN;
-- UPDATE public.fila_autorizacoes
-- SET status       = 'concluido',
--     completed_at = COALESCE(
--       completed_at,
--       (horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
--     ),
--     updated_at   = now()
-- WHERE status = 'pendente'
--   AND started_at IS NOT NULL
--   AND numero_autorizacao IS NOT NULL;
-- COMMIT;

-- 3b. As de DIAS PASSADOS sem guia: não devem ser autorizadas hoje. Voltam a
--     'erro' com o motivo escrito, que é onde estavam de fato — travadas.
--     Ficam visíveis no ModalErros para alguém decidir caso a caso.

-- BEGIN;
-- UPDATE public.fila_autorizacoes
-- SET status        = 'erro',
--     error_message = 'Reaberta por engano pelo "Liberar processos travados" em '
--                     || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
--                     || '. Sessao de dia anterior: autorizar hoje carimbaria a data errada na ASSIM.',
--     updated_at    = now()
-- WHERE status = 'pendente'
--   AND started_at IS NOT NULL
--   AND numero_autorizacao IS NULL
--   AND data_atendimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
-- COMMIT;

-- 3c. As de HOJE sem guia: essas o robô pode mesmo processar. Não faça nada —
--     só religue as máquinas depois de 3a e 3b.

-- UPDATE public.maquinas SET ativa = true;


-- -----------------------------------------------------------------------------
-- 4. CONFERÊNCIA
-- -----------------------------------------------------------------------------
-- Depois do reparo, só devem sobrar linhas de HOJE e sem guia.

SELECT
  fa.data_atendimento,
  count(*) AS pendentes_com_started_at,
  count(*) FILTER (WHERE fa.numero_autorizacao IS NOT NULL) AS com_guia
FROM public.fila_autorizacoes fa
WHERE fa.status = 'pendente'
  AND fa.started_at IS NOT NULL
GROUP BY 1
ORDER BY 1;
