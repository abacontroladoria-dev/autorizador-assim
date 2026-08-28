-- sync_assim_results() carimbava a guia sem olhar se aquele número já estava em
-- outra sessão.
--
-- Incidente de 21/08/2026, segunda metade. Paciente com sessões às 13:00 e 13:40.
-- Às 12:58 a recepção autorizou a das 13:40 (fora de ordem) e o robô gravou a
-- guia nela, correta. Às 13:02 pediram a das 13:00; a ASSIM recusou por
-- identificação dentro do intervalo de 30 minutos e a linha ficou em 'erro' —
-- ou seja, a sessão das 13:00 NÃO foi autorizada.
--
-- Só que existia UMA autorização no relatório da ASSIM daquele paciente/TUSS no
-- dia, e o pareamento de vw_match_autorizacoes_assim é POSICIONAL:
--
--     AND an.ordem_autorizacao = bo.ordem_consumo
--
-- A única guia é ordem 1; a sessão mais cedo (13:00) é consumo 1. Casaram. E o
-- UPDATE de sync_assim_results não tinha predicado nenhum além de `fa.id = a.id`:
--
--     numero_autorizacao = a.guia   -- sem checar se a guia já era de outra linha
--
-- Resultado na tela de gestão: 13:00 e 13:40 com o MESMO número de guia — um
-- trazido pelo robô autorizador, outro carimbado por este sync.
--
-- O QUE ESTA MIGRATION FAZ
--
-- 1. `guia_ja_usada_por_outra_linha()` — a guarda, num lugar só. A comparação é
--    qualificada pelo INSTANTE (±300s), nunca pelo número cru: o número da guia
--    da ASSIM RECICLA (4.652 números repetidos cobrindo 12.883 linhas, medido em
--    05/08/2026). Um `NOT EXISTS (numero_autorizacao = guia)` cru descartaria
--    guia legítima de hoje por causa de uma linha de meses atrás. É exatamente o
--    critério que 20260805170300_reconciliar_guias_por_janela.sql:99-107 já usa
--    — o caminho MANUAL tinha a guarda; o caminho automático, que roda de cron,
--    não tinha.
--
-- 2. O sync passa a PULAR a linha inteira quando a guia é de outra sessão. Pular
--    o status junto é proposital, não descuido: se a guia é de outra sessão,
--    esta aqui não tem autorização nenhuma, e mentir 'concluido' é o que sumiria
--    com ela da fila. No incidente, a linha das 13:00 fica em 'erro', que é a
--    verdade.
--
-- 3. Desambiguação 1:1 dentro da própria rodada (`rank_guia` / `rank_fila`).
--    Sem ela, nada impedia que a mesma guia saísse em duas linhas de `alvo` e
--    fosse gravada nas duas de uma vez — o mesmo estrago, sem passar pela
--    guarda, porque nenhuma das duas ainda era "de outra linha".
--
-- 4. `numero_autorizacao` e `horario_autorizacao` viram COALESCE: o sync nunca
--    sobrescreve o que o robô capturou lendo o recibo na tela.
--
-- 5. O alerta explícito: cada recusa vira uma linha em `fila_autorizacoes_logs`
--    com status 'conflito_guia', e `vw_conflitos_guia` lista as abertas. Só a
--    primeira vez por (linha, guia) — o cron roda de minuto em minuto e o log
--    viraria ruído.
--
-- O que NÃO tem aqui, de propósito: índice único em
-- `fila_autorizacoes.numero_autorizacao`. Global está descartado pela reciclagem
-- do número, e um índice parcial por data falharia na criação se o estoque atual
-- tiver duplicata. O detector abaixo mostra o estoque antes de qualquer decisão
-- desse tipo.

-- ---------------------------------------------------------------------------
-- 1. A guarda
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guia_ja_usada_por_outra_linha(
  p_guia          text,
  p_data_execucao timestamp without time zone,
  p_fila_id       uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  -- p_guia NULL (o ramo matches_falta da view produz guia NULL) devolve false:
  -- não há número para colidir.
  SELECT EXISTS (
    SELECT 1
    FROM public.fila_autorizacoes f2
    WHERE f2.numero_autorizacao   = p_guia
      AND f2.id                  <> p_fila_id
      AND f2.horario_autorizacao IS NOT NULL
      -- ±5 min: o instante da autorização é o mesmo evento nas duas pontas
      -- (autorizacoes_assim.data_execucao == fila.horario_autorizacao).
      AND abs(extract(epoch FROM (f2.horario_autorizacao - p_data_execucao))) < 300
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.guia_ja_usada_por_outra_linha(text, timestamp without time zone, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.guia_ja_usada_por_outra_linha(text, timestamp without time zone, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. O sync
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

  -- ── Alerta: as guias que este sync se recusou a carimbar ──────────────────
  -- Vem ANTES do UPDATE de propósito: depois dele o pareamento continua o mesmo
  -- (a linha em conflito não foi tocada), mas manter a ordem deixa o log e a
  -- decisão lendo o mesmo estado.
  INSERT INTO public.fila_autorizacoes_logs (
    fila_id, status, descricao, usuario,
    numero_autorizacao, horario_autorizacao, metadata
  )
  SELECT DISTINCT ON (fa.id, vm.guia)
    fa.id,
    'conflito_guia',
    format(
      'Guia %s NAO foi vinculada a sessao das %s: o mesmo numero ja esta na '
      || 'sessao das %s, autorizada no mesmo instante. Esta sessao segue SEM '
      || 'autorizacao (status %s).',
      vm.guia,
      to_char(fa.horario, 'HH24:MI'),
      to_char(dono.horario, 'HH24:MI'),
      fa.status
    ),
    'sync_assim_results',
    vm.guia,
    vm.data_execucao AT TIME ZONE 'America/Sao_Paulo',
    jsonb_build_object(
      'fila_dona_id',  dono.id,
      'horario_dona',  dono.horario,
      'data_execucao', vm.data_execucao,
      'paciente_id',   fa.paciente_id
    )
  FROM public.fila_autorizacoes fa
  JOIN public.vw_match_autorizacoes_assim vm
    ON  fa.paciente_id::bigint = vm.paciente_id
    AND fa.data_atendimento    = vm.data_atendimento
    AND fa.horario             = vm.hora_inicial
  JOIN public.fila_autorizacoes dono
    ON  dono.numero_autorizacao   = vm.guia
    AND dono.id                  <> fa.id
    AND dono.horario_autorizacao IS NOT NULL
    AND abs(extract(epoch FROM (dono.horario_autorizacao - vm.data_execucao))) < 300
  WHERE vm.guia IS NOT NULL
    AND fa.numero_autorizacao IS DISTINCT FROM vm.guia
    -- Uma vez por (linha, guia). O cron roda a cada poucos minutos.
    AND NOT EXISTS (
      SELECT 1
      FROM public.fila_autorizacoes_logs l
      WHERE l.fila_id            = fa.id
        AND l.status             = 'conflito_guia'
        AND l.numero_autorizacao = vm.guia
    )
  ORDER BY fa.id, vm.guia, dono.horario;

  -- ── O carimbo ─────────────────────────────────────────────────────────────
  WITH candidatos AS (
    SELECT
      fa.id,
      fa.status              AS status_atual,
      fa.started_at,
      fa.horario,
      vm.status_assim,
      vm.guia,
      vm.data_execucao
    FROM fila_autorizacoes fa
    JOIN vw_match_autorizacoes_assim vm
      ON  fa.paciente_id::bigint = vm.paciente_id
      AND fa.data_atendimento    = vm.data_atendimento
      AND fa.horario             = vm.hora_inicial
    -- A GUARDA. Fora daqui a linha inteira é pulada: sem guia própria, ela não
    -- tem autorização, e o status não pode avançar.
    WHERE NOT public.guia_ja_usada_por_outra_linha(vm.guia, vm.data_execucao, fa.id)
  ),

  -- 1:1 dentro da rodada: uma guia carimba no máximo uma linha, e uma linha
  -- recebe no máximo uma guia. Empate resolve pelo instante e pelo horário, para
  -- ser determinístico entre execuções.
  numerados AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.guia ORDER BY c.data_execucao, c.horario, c.id
      ) AS rank_guia,
      row_number() OVER (
        PARTITION BY c.id   ORDER BY c.data_execucao, c.guia
      ) AS rank_fila
    FROM candidatos c
  ),

  alvo AS (
    SELECT
      n.id,
      n.status_assim,
      n.guia,
      n.data_execucao,
      CASE
        WHEN n.status_assim = 'Liberado *'
          AND n.status_atual <> 'concluido'
          THEN 'cancelado'

        WHEN n.status_assim = 'Liberado'
          -- Sem guia não há prova de autorização: só o rótulo não tira a linha
          -- da fila. O ramo matches_falta da view produz guia NULL.
          AND n.guia IS NOT NULL
          AND (
            n.status_atual IN ('erro', 'pendente')
            -- 'processando' só quando já está órfã. Sem esta guarda o sync
            -- viraria o status debaixo de uma tarefa viva, e o cancelado() de
            -- worker.js:226-231 abortaria a execução no meio do preenchimento.
            OR (
              n.status_atual = 'processando'
              AND n.started_at IS NOT NULL
              AND n.started_at < (now() AT TIME ZONE 'UTC') - INTERVAL '30 minutes'
            )
          )
          THEN 'concluido'

        WHEN n.status_assim IS NOT NULL
          AND n.status_assim NOT ILIKE '%Liberado%'
          AND n.status_atual NOT IN ('concluido', 'falta', 'pendente')
          THEN 'glosa'

        ELSE n.status_atual
      END AS status_novo
    FROM numerados n
    WHERE n.rank_fila = 1
      -- guia NULL não participa da disputa por número: o rank dela é ruído.
      AND (n.guia IS NULL OR n.rank_guia = 1)
  )
  UPDATE fila_autorizacoes fa
  SET
    status_assim        = a.status_assim,
    status              = a.status_novo,
    -- COALESCE: o robô leu a guia no recibo, na tela. Este sync lê um relatório
    -- consolidado e nunca deve sobrescrever a captura direta.
    numero_autorizacao  = COALESCE(fa.numero_autorizacao, a.guia),
    horario_autorizacao = COALESCE(fa.horario_autorizacao, a.data_execucao),
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

-- ---------------------------------------------------------------------------
-- 3. O painel: conflitos e duplicatas vivas
-- ---------------------------------------------------------------------------
-- security_invoker para a view não virar mais uma DEFINER legível por anon.
CREATE OR REPLACE VIEW public.vw_conflitos_guia
WITH (security_invoker = on) AS
SELECT
  l.created_at                       AS detectado_em,
  l.numero_autorizacao               AS guia,
  fa.paciente_id,
  fa.paciente_nome,
  fa.data_atendimento,
  fa.horario                         AS horario_recusado,
  fa.status                          AS status_da_sessao,
  (l.metadata ->> 'horario_dona')    AS horario_da_dona,
  (l.metadata ->> 'fila_dona_id')    AS fila_dona_id,
  l.descricao,
  -- Ainda vale olhar? Se a sessão recusada já foi resolvida por outro caminho
  -- (vínculo manual, autorização nova), o conflito é história.
  (fa.numero_autorizacao IS NULL
     AND fa.status NOT IN ('concluido', 'concluido_sem_guia', 'falta', 'cancelado'))
                                     AS em_aberto
FROM public.fila_autorizacoes_logs l
JOIN public.fila_autorizacoes fa ON fa.id = l.fila_id
WHERE l.status = 'conflito_guia'
ORDER BY l.created_at DESC;

COMMENT ON VIEW public.vw_conflitos_guia IS
  'Guias que sync_assim_results() se recusou a carimbar porque o numero ja '
  'pertencia a outra sessao no mesmo instante. em_aberto = a sessao recusada '
  'continua sem autorizacao.';

-- Detector do estoque: a mesma guia viva em mais de uma sessao, no mesmo dia.
-- Em operacao normal tem de voltar vazio.
CREATE OR REPLACE VIEW public.vw_guias_duplicadas
WITH (security_invoker = on) AS
SELECT
  fa.numero_autorizacao              AS guia,
  fa.data_atendimento,
  count(*)                           AS sessoes,
  array_agg(fa.horario ORDER BY fa.horario)       AS horarios,
  array_agg(DISTINCT fa.paciente_nome)            AS pacientes,
  array_agg(fa.id ORDER BY fa.horario)            AS fila_ids
FROM public.fila_autorizacoes fa
WHERE fa.numero_autorizacao IS NOT NULL
  -- SÓ DÍGITO. `numero_autorizacao` guarda a string literal 'N/A' nas linhas de
  -- PRESENÇA (completion_type = 'presenca'), que não são autorizações ASSIM e
  -- não têm guia nenhuma — 1.125 delas na janela de 22/07 a 21/08, medido em
  -- 21/08/2026. Sem este filtro a view abriria todo dia com 'N/A' repetida
  -- centenas de vezes e o alerta real ficaria enterrado embaixo.
  AND fa.numero_autorizacao ~ '^[0-9]+$'
GROUP BY fa.numero_autorizacao, fa.data_atendimento
HAVING count(*) > 1;

COMMENT ON VIEW public.vw_guias_duplicadas IS
  'Mesmo numero de guia em mais de uma sessao no MESMO dia. O numero da ASSIM '
  'recicla ao longo do tempo, por isso o agrupamento e por dia — duas linhas de '
  'meses diferentes com o mesmo numero sao normais e nao aparecem aqui. '
  'Linhas de presenca (numero_autorizacao = ''N/A'') sao excluidas.';
