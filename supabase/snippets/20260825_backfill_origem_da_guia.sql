-- =============================================================================
-- Backfill de numero_autorizacao_origem — em DUAS etapas, por eras diferentes
-- =============================================================================
-- Rodar na ordem. Blocos 1 e 4 leem; 2 e 5 são dry-run; 3 e 6 escrevem; 7 desfaz.
--
-- ┌─ CORREÇÃO DE DIAGNÓSTICO (medido 25/08/2026) ──────────────────────────────────
-- │ A primeira versão deste snippet usava "tem log de conclusão em
-- │ fila_autorizacoes_logs" como prova de que o ROBÔ concluiu a linha. ERRADO, e o
-- │ bloco de medição pegou antes do UPDATE: o sinal deu ~99% em TODAS as semanas
-- │ (1075/1095, 1249/1266, 1210/1214, 199/200).
-- │
-- │ O motivo é `trg_log_fila_autorizacoes` (20260518131652:3739), trigger AFTER
-- │ INSERT OR UPDATE que grava `new.status` a cada transição de status. O UPDATE do
-- │ próprio `sync_assim_results` muda status para 'concluido' e portanto dispara o
-- │ trigger exatamente como o robô. Aquele log é um DIÁRIO DE TRANSIÇÕES, não uma
-- │ trilha de robô. A regra teria carimbado 'robo' em quase tudo, calada.
-- └────────────────────────────────────────────────────────────────────────────────
--
-- ── O QUE A MEDIÇÃO REVELOU, E QUE MUDA O ALCANCE ────────────────────────────────
--
--   semana   sem completed_at        sem started_at
--   03/08    1094/1095  (99,9%)      1094/1095
--   10/08    1001/1266  (79,1%)      1009/1266
--   17/08       2/1214  ( 0,2%)        68/1214
--   24/08       0/200   ( 0,0%)         0/200
--
-- É a assinatura de `completed_at` passando a ser escrito em ~13–14/08 (RPCs robo_*
-- em 20260813100200, sync em 20260814120000). E prova que **o robô ANTIGO também não
-- gravava completed_at**: na semana de 03/08 a coluna falta em 99,9% das linhas, robô
-- e relatório igualmente. Coluna que não varia não separa nada — e `started_at` tem a
-- mesma forma, porque só `robo_buscar_tarefa` (era das RPCs) escreve lá.
--
-- Portanto: DUAS eras, dois mecanismos, duas etapas.
--
--   ETAPA 1 (blocos 1–3) — era das RPCs. `completed_at` existe e o teste é a
--   IGUALDADE EXATA: o sync grava completed_at e horario_autorizacao a partir do
--   MESMO valor (data_execucao), então eles batem ao segundo; o robô grava now(),
--   sempre depois (esperou o modal de validação). A etapa se AUTO-SELECIONA — só
--   toca linha que tem completed_at E horario_autorizacao — então não preciso
--   acertar a data da virada, e as ~265 linhas já convertidas da semana de 10/08
--   entram junto, corretamente.
--
--   ETAPA 2 (blocos 4–6) — era antiga, 03/08 a ~13/08. O único mecanismo que
--   distingue ali: **antes de 20260814120000 o sync só promovia a 'concluido' quem
--   estava em 'erro'** (o CASE não alcançava 'pendente' — é o bug do incidente de
--   14/08). Logo o diário de transições guarda a diferença:
--       erro -> concluido        = o sync promoveu     -> 'relatorio'
--       processando -> concluido = o robô concluiu     -> 'robo'
--   Com uma ressalva que o bloco 4 mede: linha que errou e foi REPROCESSADA pelo
--   robô também tem 'erro' no histórico. O que separa é haver um log 'processando'
--   DEPOIS do último 'erro'. Sem isso a etapa 2 super-atribuiria a 'relatorio'.

-- ---------------------------------------------------------------------------
-- Bloco 1 — DRY-RUN da etapa 1 (era das RPCs)
-- ---------------------------------------------------------------------------
-- Esperado: maioria 'robo' (delta positivo) e uma minoria 'relatorio' (delta exato).
-- Se vier ~100% de um lado só, PARE — o discriminante não está separando.
WITH alvo AS (
  SELECT
    f.data_atendimento,
    CASE
      WHEN f.completed_at = ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
        THEN 'relatorio'
      WHEN f.completed_at > ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
        THEN 'robo'
      ELSE 'delta NEGATIVO (investigar)'
    END AS origem
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
    AND f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.numero_autorizacao_origem IS NULL
    -- A auto-seleção da etapa: sem estes dois não há teste possível.
    AND f.completed_at        IS NOT NULL
    AND f.horario_autorizacao IS NOT NULL
)
SELECT
  date_trunc('week', data_atendimento)::date  AS semana,
  origem,
  count(*)                                    AS linhas
FROM alvo
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 2 — cruzamento de sanidade da etapa 1
-- ---------------------------------------------------------------------------
-- `started_at IS NULL` = o robô nunca foi buscar a tarefa (só robo_buscar_tarefa
-- escreve lá). Testemunha independente, válida nesta era.
--
--   delta exato  &  started_at NULO  -> sync, sem dúvida
--   delta > 0    &  started_at CHEIO -> robô, sem dúvida
--   delta exato  &  started_at CHEIO -> o caso do incidente: o RPA pegou, falhou, e
--                                       a guia foi tirada no portal. Legítimo.
--   delta > 0    &  started_at NULO  -> A CÉLULA QUE FREIA. Alguém gravou
--                                       completed_at depois do horário sem o robô ter
--                                       pegado a tarefa. Se tiver volume, me mostre.
SELECT
  -- Três ramos, não dois: um ELSE binário jogava o delta NEGATIVO dentro de
  -- 'delta positivo' e escondia 3 linhas (medido 25/08) no balde de 1603.
  CASE
    WHEN f.completed_at = ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
      THEN 'delta exato'
    WHEN f.completed_at > ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
      THEN 'delta positivo'
    ELSE 'delta NEGATIVO'
  END                                                        AS forma,
  (f.started_at IS NULL)                                     AS robo_nunca_pegou,
  count(*)                                                   AS linhas,
  string_agg(DISTINCT COALESCE(f.machine_id,'(nulo)'), ', ')  AS maquinas
FROM public.fila_autorizacoes f
WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
  AND f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
  AND f.completed_at        IS NOT NULL
  AND f.horario_autorizacao IS NOT NULL
GROUP BY 1, 2
ORDER BY 3 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 3 — APLICA a etapa 1  (só depois de 1 e 2 fecharem)
-- ---------------------------------------------------------------------------
UPDATE public.fila_autorizacoes f
SET numero_autorizacao_origem = CASE
      WHEN f.completed_at = ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
        THEN 'relatorio'
      WHEN f.completed_at > ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
        THEN 'robo'
      ELSE NULL          -- delta negativo: não classifica, deixa aparecer no bloco 1
    END
WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
  AND f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
  AND f.numero_autorizacao_origem IS NULL
  AND f.completed_at        IS NOT NULL
  AND f.horario_autorizacao IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bloco 4 — MEDIÇÃO da etapa 2 (era antiga): a sequência de transições separa?
-- ---------------------------------------------------------------------------
-- Roda sobre o que a etapa 1 NÃO alcançou. Três colunas decidem:
--
--   com_erro_antes    linhas que passaram por 'erro' antes de concluir. Na era antiga
--                     o sync só promovia de 'erro', então é a população candidata a
--                     'relatorio'.
--   reprocessadas     das acima, as que têm 'processando' DEPOIS do último 'erro' —
--                     ou seja, o robô voltou e concluiu. Essas são 'robo', não
--                     'relatorio'. Se este número for alto, a regra da etapa 2 é
--                     fraca e é melhor não aplicá-la.
--   sem_erro          nunca erraram: 'robo'.
--
-- Se `com_erro_antes` for perto de ZERO, não há o que separar e a etapa 2 não vale a
-- pena — a era antiga fica sem origem, que é a resposta honesta.
WITH alvo AS (
  SELECT f.id, f.data_atendimento
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
    AND f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.numero_autorizacao_origem IS NULL
),
marcos AS (
  SELECT
    a.id,
    a.data_atendimento,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = a.id AND l.status = 'erro')          AS ultimo_erro,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = a.id AND l.status = 'processando')    AS ultimo_processando,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = a.id AND l.status LIKE 'concluido%')  AS ultima_conclusao
  FROM alvo a
)
SELECT
  date_trunc('week', data_atendimento)::date                          AS semana,
  count(*)                                                            AS sem_origem_ainda,
  count(*) FILTER (WHERE ultimo_erro IS NOT NULL)                     AS com_erro_antes,
  count(*) FILTER (WHERE ultimo_erro IS NOT NULL
                     AND ultimo_processando IS NOT NULL
                     AND ultimo_processando > ultimo_erro)            AS reprocessadas,
  count(*) FILTER (WHERE ultimo_erro IS NULL)                         AS sem_erro,
  count(*) FILTER (WHERE ultima_conclusao IS NULL)                    AS sem_log_de_conclusao
FROM marcos
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- Bloco 4b — o STATUS das linhas que sobraram  (medição que faltava)
-- ---------------------------------------------------------------------------
-- A população deste snippet filtra por `numero_autorizacao IS NOT NULL` e NÃO por
-- status — de propósito, mas isso deixa entrar um caso que a regra da etapa 2 não
-- cobre: a FILA ENVENENADA. Antes de 20260814120000 o sync gravava a guia numa linha
-- que continuava 'pendente' (o CASE não promovia de 'pendente'), e é justamente o bug
-- do incidente de 14/08. Se alguma dessas tiver log de 'processando', a regra da etapa
-- 2 diria 'robo' para uma guia que veio do sync.
--
-- Há um sinal limpo para elas, e independente da sequência de logs: **o robô nunca
-- deixa linha com guia em 'pendente'**. `robo_concluir_tarefa` grava status e guia no
-- MESMO UPDATE, e os status que ele aceita são concluido/concluido_sem_guia/erro/glosa
-- (nunca 'pendente'). Logo guia + 'pendente' = carimbo de sync = 'relatorio'.
--
-- O que decidir com o resultado:
--   'concluido' domina                 -> a regra da etapa 2 vale como está
--   'pendente' com volume              -> acrescentar o ramo do 'pendente' antes dela
--   'erro'/'glosa'/'cancelado' com guia -> deixar NULL; nenhum mecanismo distingue
SELECT
  f.status,
  count(*)                                                            AS linhas,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.fila_autorizacoes_logs l
     WHERE l.fila_id = f.id AND l.status = 'processando'))              AS com_log_processando,
  min(f.data_atendimento)                                             AS de,
  max(f.data_atendimento)                                             AS ate
FROM public.fila_autorizacoes f
WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
  AND f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
  AND f.numero_autorizacao_origem IS NULL
GROUP BY 1
ORDER BY 2 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 5 — DRY-RUN da etapa 2  (só se o bloco 4 mostrar separação)
-- ---------------------------------------------------------------------------
-- ── SÓ `status = 'concluido'`, e o bloco 4b é quem determinou isso ─────────────
-- Medido em 25/08: concluido 2065 · glosa 26 · falta 9 · pendente ZERO.
--
--   'pendente' = 0  -> a fila envenenada não está nesta faixa (o reparo de 14/08
--                      aguentou), então o ramo que eu ia acrescentar é desnecessário.
--   glosa (26)      -> FICAM DE FORA. Todas são de 03/08–13/08, quando o robô ainda
--                      NÃO podia gravar 'glosa' (isso entrou em 20260813130000): quem
--                      escreveu esse status foi o sync. Mas a tentativa foi do robô
--                      (todas têm log de 'processando'), então "quem conseguiu a
--                      guia" não tem resposta limpa numa autorização RECUSADA. 26
--                      linhas não justificam uma regra construída sobre inferência.
--   falta (9)       -> FICAM DE FORA. Nenhuma tem log de 'processando', e sessão que
--                      não aconteceu não deveria ter guia nenhuma. É defeito de dado,
--                      não pergunta de procedência — merece olhar próprio.
--
-- Nas 2065 de 'concluido', TODAS têm log de 'processando'. Isso é o que faz o ramo 1
-- da regra ser aplicável linha por linha, sem cair em NULL por falta de trilha.
WITH marcos AS (
  SELECT
    f.id,
    f.data_atendimento,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = f.id AND l.status = 'erro')          AS ultimo_erro,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = f.id AND l.status = 'processando')    AS ultimo_processando
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
    AND f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.numero_autorizacao_origem IS NULL
    AND f.status = 'concluido'
)
SELECT
  date_trunc('week', data_atendimento)::date                          AS semana,
  CASE
    -- O robô esteve na linha DEPOIS do último erro (ou não houve erro): foi ele que
    -- concluiu. Cobre a linha reprocessada — errou, voltou para a fila, o robô pegou
    -- de novo e fechou. Este ramo vem PRIMEIRO porque é prova positiva.
    WHEN ultimo_processando IS NOT NULL
     AND (ultimo_erro IS NULL OR ultimo_processando > ultimo_erro)
      THEN 'robo'
    -- Errou e o robô nunca voltou: na era antiga só o sync promovia de 'erro'.
    WHEN ultimo_erro IS NOT NULL
      THEN 'relatorio'
    ELSE 'indeterminado'
  END                                                                 AS origem,
  count(*)                                                            AS linhas
FROM marcos
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 6 — APLICA a etapa 2
-- ---------------------------------------------------------------------------
-- Liberado depois de 4 e 4b: `reprocessadas` alto (85–91%) NÃO enfraquece a regra,
-- porque a versão corrigida devolve 'robo' para elas — a ordem dos ramos é o conserto.
-- A população reivindicada como 'relatorio' é `com_erro_antes - reprocessadas`, e ela
-- dá ~3,3% do total, contra 4,5% da etapa 1. Duas eras, mecanismos independentes,
-- mesma ordem de grandeza: é corroboração, não coincidência.
WITH marcos AS (
  SELECT
    f.id,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = f.id AND l.status = 'erro')          AS ultimo_erro,
    (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id = f.id AND l.status = 'processando')    AS ultimo_processando
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
    AND f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.numero_autorizacao_origem IS NULL
    AND f.status = 'concluido'          -- ver a nota do bloco 5: glosa e falta ficam fora
)
UPDATE public.fila_autorizacoes f
SET numero_autorizacao_origem = CASE
      -- Prova positiva primeiro: o robô esteve na linha depois do último erro (ou
      -- não houve erro). Cobre a reprocessada — errou, voltou à fila, o robô fechou.
      WHEN m.ultimo_processando IS NOT NULL
       AND (m.ultimo_erro IS NULL OR m.ultimo_processando > m.ultimo_erro)
        THEN 'robo'
      -- Errou e o robô nunca voltou. Na era antiga só o sync promovia de 'erro'.
      WHEN m.ultimo_erro IS NOT NULL
        THEN 'relatorio'
      ELSE NULL
    END
FROM marcos m
WHERE f.id = m.id;

-- ---------------------------------------------------------------------------
-- Bloco 7 — o rateio final, e o ROLLBACK
-- ---------------------------------------------------------------------------
SELECT
  COALESCE(numero_autorizacao_origem, '(sem origem)') AS origem,
  count(*)                                            AS linhas,
  min(data_atendimento)                               AS de,
  max(data_atendimento)                               AS ate
FROM public.fila_autorizacoes
WHERE data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24'
  AND numero_autorizacao IS NOT NULL
  AND numero_autorizacao <> 'N/A'
GROUP BY 1
ORDER BY 2 DESC;

-- Exato porque nenhuma função escreve origem em sessão de até 24/08 — de 25/08 em
-- diante é o sync e o robô que escrevem, e a faixa não os alcança.
-- UPDATE public.fila_autorizacoes
-- SET numero_autorizacao_origem = NULL
-- WHERE data_atendimento BETWEEN DATE '2026-08-03' AND DATE '2026-08-24';
