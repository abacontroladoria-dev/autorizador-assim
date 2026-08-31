-- =============================================================================
-- Fila envenenada: linha com guia da ASSIM mas ainda elegível para o robô
-- =============================================================================
-- Contexto: sync_assim_results() carimbava numero_autorizacao/status_assim numa
-- linha 'pendente' e deixava o status como estava. robo_buscar_tarefa filtra por
-- status='pendente', então a linha continuava na fila do robô DEPOIS de já
-- existir guia na ASSIM — e seria autorizada duas vezes ("1601-REINCIDENCIA").
--
-- A migration 20260814120000_sync_assim_conclui_pendente.sql fecha o buraco
-- daqui pra frente. Este snippet trata o estoque que já ficou nesse estado.
--
-- Ordem de execução:
--   1. Rodar a SEÇÃO 1 (read-only) e conferir cada linha na tela da ASSIM.
--   2. Só então descomentar e rodar a SEÇÃO 2, com os ids conferidos.
--
-- ATENÇÃO ao fuso, porque a tabela mistura duas convenções:
--   created_at / updated_at / started_at / completed_at → hora de parede UTC
--   horario_autorizacao                                 → hora de parede SP
-- As seções abaixo já convertem tudo para São Paulo na exibição.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SEÇÃO 1 — DIAGNÓSTICO (read-only)
-- -----------------------------------------------------------------------------
-- Tudo que está na fila do robô e já tem guia. Em operação normal isto é vazio.

SELECT
  fa.id,
  fa.status,
  fa.paciente_nome,
  fa.data_atendimento,
  fa.horario,
  fa.machine_id,
  fa.criado_por,
  fa.tuss,
  fa.numero_autorizacao,
  fa.status_assim,
  -- SP: já está em hora de parede de São Paulo, mostra cru
  fa.horario_autorizacao                            AS autorizado_em_sp,
  -- UTC: converte para São Paulo para dar pra comparar com a linha de cima
  (fa.created_at  AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS criado_em_sp,
  (fa.updated_at  AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS atualizado_em_sp,
  (fa.started_at  AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS robo_pegou_em_sp,
  CASE
    WHEN fa.started_at IS NULL THEN 'o robô NUNCA pegou esta tarefa'
    ELSE 'o robô pegou e não concluiu'
  END                                               AS leitura
FROM public.fila_autorizacoes fa
WHERE fa.status IN ('pendente', 'processando')
  AND fa.numero_autorizacao IS NOT NULL
ORDER BY fa.data_atendimento DESC, fa.horario;


-- Só para HOJE: de onde veio o casamento. vw_match_autorizacoes_assim casa por
-- POSIÇÃO no dia (ordem_autorizacao = ordem_consumo, particionado por
-- matricula+dep+data+codigo_tuss), não por identidade da sessão. Quando
-- ordem_consumo > 1 vale conferir na ASSIM se a guia é mesmo daquele horário.

SELECT
  fa.id,
  fa.status,
  fa.paciente_nome,
  fa.horario,
  fa.numero_autorizacao,
  vm.guia                AS guia_da_view,
  vm.status_assim,
  vm.data_execucao       AS emitida_em_sp,
  vm.ordem_consumo,
  vm.ordem_autorizacao,
  CASE
    WHEN vm.ordem_consumo = 1 THEN 'única/primeira do dia — casamento direto'
    ELSE 'sessão nº ' || vm.ordem_consumo || ' do dia — CONFERIR na ASSIM'
  END                    AS confianca
FROM public.fila_autorizacoes fa
JOIN public.vw_match_autorizacoes_assim vm
  ON  fa.paciente_id::bigint = vm.paciente_id
  AND fa.data_atendimento    = vm.data_atendimento
  AND fa.horario             = vm.hora_inicial
WHERE fa.status IN ('pendente', 'processando')
  AND fa.numero_autorizacao IS NOT NULL
ORDER BY fa.paciente_nome, fa.horario;


-- O caso que originou tudo. Esperado: status='pendente', started_at NULL,
-- numero_autorizacao='217417', horario_autorizacao='2026-08-14 09:03:00'.
SELECT *
FROM public.fila_autorizacoes
WHERE id = '1882f7f5-285c-4d72-80bc-2e602b039064';


-- Contraprova de que o robô de atendente_02 parou de consumir a fila: quando foi
-- a última tarefa que ele realmente pegou, e quantas estão paradas atrás.
SELECT
  machine_id,
  count(*) FILTER (WHERE status = 'pendente')                       AS paradas_agora,
  (max(started_at) AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'
                                                                    AS ultima_pegada_sp
FROM public.fila_autorizacoes
WHERE data_atendimento = (now() AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY machine_id
ORDER BY machine_id;


-- -----------------------------------------------------------------------------
-- SEÇÃO 2 — REPARO (rodar SÓ depois de conferir a Seção 1)
-- -----------------------------------------------------------------------------
-- Reproduz exatamente o que a nova sync_assim_results faria, restrito por id.
-- Não apaga nada: a guia e o horário já gravados são preservados.
--
-- Troque a lista de ids pelos que você conferiu. Rode o SELECT de dentro
-- primeiro se quiser ver quais linhas serão tocadas.

-- BEGIN;
--
-- UPDATE public.fila_autorizacoes
-- SET
--   status       = 'concluido',
--   completed_at = COALESCE(
--     completed_at,
--     (horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
--   ),
--   updated_at   = now()
-- WHERE id IN (
--   '1882f7f5-285c-4d72-80bc-2e602b039064'   -- Benício Santiago De Souza, 08:40, guia 217417
-- )
--   AND status IN ('pendente', 'processando')
--   AND numero_autorizacao IS NOT NULL
--   AND status_assim = 'Liberado';
--
-- -- Confira o resultado ANTES de confirmar. Esperado: status='concluido',
-- -- completed_at='2026-08-14 12:03:00' (= 09:03 em São Paulo).
-- SELECT id, status, numero_autorizacao, completed_at, horario_autorizacao
-- FROM public.fila_autorizacoes
-- WHERE id IN ('1882f7f5-285c-4d72-80bc-2e602b039064');
--
-- COMMIT;
-- -- ROLLBACK;


-- -----------------------------------------------------------------------------
-- SEÇÃO 3 — CONFERÊNCIA FINAL
-- -----------------------------------------------------------------------------
-- Depois do reparo E da migration aplicada, isto tem que voltar 0.

SELECT count(*) AS ainda_envenenadas
FROM public.fila_autorizacoes
WHERE status IN ('pendente', 'processando')
  AND numero_autorizacao IS NOT NULL;
