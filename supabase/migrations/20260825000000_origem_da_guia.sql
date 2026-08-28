-- De onde veio a guia: o Pulsar a capturou, ou ela foi tirada direto no site da ASSIM?
--
-- O PROBLEMA
-- No detalhamento de uma autorização não havia como responder isso. O sinal que a
-- operação usava — "confirmação sem usuário ⇒ foi direto na ASSIM" — quebrou em
-- 25/08/2026: a atendente começou a solicitar pelo Pulsar, o RPA deu erro, ela fechou a
-- janela (linha em 'erro' com o nome dela em `criado_por`) e foi tirar a guia à mão no
-- portal. O sync trouxe a guia do relatório e carimbou naquela mesma linha. O
-- detalhamento passou a dizer "Solicitado por: <nome>" para uma guia que o Pulsar nunca
-- capturou.
--
-- A causa é que `criado_por` responde QUEM ABRIU A SOLICITAÇÃO — é escrito no INSERT, ou
-- pelo trigger `fn_set_criado_por` (20260730000000) resolvendo
-- `machine_id -> maquinas.user_id -> usuarios.nome`. Ele nunca respondeu QUEM CONSEGUIU A
-- GUIA. São duas perguntas diferentes e só a primeira tinha resposta.
--
-- O FATO JÁ É CONHECIDO NA HORA DA ESCRITA
-- `numero_autorizacao` só é escrito por três caminhos, e cada um já significa exatamente
-- o que se quer distinguir:
--
--   robo_concluir_tarefa        o robô leu a guia no recibo, na tela  -> o Pulsar conseguiu
--   sync_assim_results          a guia veio do extrato, numa linha que
--                               ainda não tinha guia nenhuma          -> ninguém no Pulsar
--                                                                        capturou, logo foi
--                                                                        tirada no site
--   reconciliar_guias_por_janela  reparo rodado à mão, também só onde
--                                 numero_autorizacao IS NULL          -> idem, achada depois
--
-- Nenhum deles precisa adivinhar nada: basta registrar o que já sabem. É por isso que
-- esta migration não inventa heurística — ela só para de jogar fora um fato.
--
-- POR QUE ESTA FORMA, E NÃO OUTRA
-- É a mesma de `forma_autorizacao_origem` (20260821080000): coluna irmã da coluna que ela
-- descreve, vocabulário curto, e WRITE-ONCE. A origem da coluna X mora em X_origem.
--
-- O write-once é o ponto que não pode ser relaxado. O sync roda a cada poucos minutos e
-- passa por cima da MESMA linha muitas vezes depois de ela estar concluída; sem o
-- `WHEN ... IS NOT NULL THEN <ela mesma>` na frente, a segunda passada reescreveria como
-- 'relatorio' a guia que o robô capturou, e o campo diria o contrário da verdade
-- justamente nas linhas mais comuns.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não preenche o passado — as linhas anteriores a ela ficam com origem NULL, e a tela não
-- mostra nada nesse caso, em vez de chutar. A medição que decide se um backfill é possível
-- está em supabase/snippets/20260825_origem_da_guia_historico.sql. Também não muda
-- nenhuma leitura: quem expõe o campo às telas é a migration 20260825010000.
--
-- ANTES DE APLICAR
-- Tirar a definição VIVA de cada função com `pg_get_functiondef` e conferir contra a que
-- está reproduzida aqui. Estas três foram copiadas das migrations mais recentes do repo
-- (20260813130000, 20260821080000 e 20260805170500 respectivamente), mas o repo não é a
-- autoridade sobre o que está em produção — ver reference_db_push_blast_radius.

-- ---------------------------------------------------------------------------
-- 1. Onde guardar
-- ---------------------------------------------------------------------------
ALTER TABLE public.fila_autorizacoes
  ADD COLUMN IF NOT EXISTS numero_autorizacao_origem text;

COMMENT ON COLUMN public.fila_autorizacoes.numero_autorizacao_origem IS
  'De onde veio o numero_autorizacao desta linha. ''robo'' = o robo do Pulsar leu a '
  'guia no recibo, na tela (robo_concluir_tarefa). ''relatorio'' = o sync achou a guia '
  'no extrato da ASSIM numa sessao que ainda nao tinha guia, ou seja NINGUEM no Pulsar '
  'a capturou e ela foi tirada direto no site (sync_assim_results). '
  '''reconciliacao'' = reparo rodado a mao por reconciliar_guias_por_janela, mesmo '
  'significado operacional que ''relatorio''. NULL = linha anterior a 25/08/2026, ou '
  'linha sem guia. ESCRITO UMA VEZ E NUNCA REESCRITO: o sync passa muitas vezes pela '
  'mesma linha ja concluida, e sem isso ele apagaria a autoria do robo. '
  'NAO confundir com criado_por, que diz quem ABRIU A SOLICITACAO e nao quem conseguiu '
  'a guia — foi exatamente essa confusao que motivou a coluna.';

-- ---------------------------------------------------------------------------
-- 2. O robô, quando lê a guia no recibo
-- ---------------------------------------------------------------------------
-- Recriada a partir de 20260813130000_robo_conclui_glosa.sql, com UMA adição (o CASE de
-- numero_autorizacao_origem). Assinatura idêntica, então CREATE OR REPLACE sem DROP — o
-- DROP levaria os grants junto e a frota inteira pararia de concluir tarefa até serem
-- refeitos.
--
-- `SET search_path = public` continua declarado AQUI DENTRO de propósito: CREATE OR
-- REPLACE descarta o `proconfig` que um ALTER FUNCTION tivesse posto, calado.
CREATE OR REPLACE FUNCTION public.robo_concluir_tarefa(
  p_token               text,
  p_fila_id             uuid,
  p_status              text,
  p_numero_autorizacao  text      DEFAULT NULL,
  p_forma_autorizacao   text      DEFAULT NULL,
  p_horario_autorizacao timestamp DEFAULT NULL,
  p_error_message       text      DEFAULT NULL,
  p_status_assim        text      DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_afetadas   int;
BEGIN
  -- 'cancelado' e 'falta' seguem fora do alcance do robô: são decisões humanas,
  -- tomadas na tela. 'glosa' entrou porque é leitura do recibo, não decisão.
  IF p_status NOT IN ('concluido', 'concluido_sem_guia', 'erro', 'glosa') THEN
    RAISE EXCEPTION 'status nao permitido ao robo: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.fila_autorizacoes
     SET status              = p_status,
         numero_autorizacao  = coalesce(p_numero_autorizacao, numero_autorizacao),

         -- ── A origem da guia ────────────────────────────────────────────────
         -- Só marca quando o robô está de fato TRAZENDO um número. Em
         -- 'concluido_sem_guia' e em 'erro' o RPA chega aqui com
         -- p_numero_autorizacao NULL: a autorização pode até ter acontecido na
         -- ASSIM, mas o robô não leu guia nenhuma, então não há origem a
         -- declarar. Se o sync trouxer essa guia depois, ele é quem carimba
         -- 'relatorio' — e estará certo, porque o vínculo veio do extrato.
         numero_autorizacao_origem = CASE
           WHEN numero_autorizacao_origem IS NOT NULL THEN numero_autorizacao_origem
           WHEN p_numero_autorizacao      IS NOT NULL THEN 'robo'
           ELSE numero_autorizacao_origem
         END,

         horario_autorizacao = coalesce(p_horario_autorizacao, horario_autorizacao),
         forma_autorizacao   = coalesce(p_forma_autorizacao, forma_autorizacao),
         -- Sem forma escolhida, validacao_finalizada_em fica nula de propósito:
         -- é o que deixa a pendência visível e preenchível depois pela rota
         -- /api/fila-autorizacoes/validacao, em vez de fingir que foi resolvida.
         validacao_finalizada_em = CASE
                                     WHEN p_forma_autorizacao IS NOT NULL THEN now()
                                     ELSE validacao_finalizada_em
                                   END,
         -- Mesma coluna e mesmo formato que sync_assim_results usa quando o
         -- relatório chega ("1601-REINCIDENCIA NO ATEN"). Aqui chega horas antes.
         status_assim        = coalesce(p_status_assim, status_assim),
         assim_updated_at    = CASE
                                 WHEN p_status_assim IS NOT NULL THEN now()
                                 ELSE assim_updated_at
                               END,
         -- Glosa não é erro: sem problema relatado, error_message é limpo, do
         -- mesmo jeito que num aceite. O motivo da recusa mora em status_assim.
         error_message       = CASE
                                 WHEN p_status IN ('concluido', 'glosa')
                                  AND p_error_message IS NULL
                                 THEN NULL ELSE coalesce(p_error_message, error_message)
                               END,
         completed_at        = now(),
         updated_at          = now()
   WHERE id = p_fila_id
     AND machine_id = v_machine_id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. O sync, quando a guia vem do extrato
-- ---------------------------------------------------------------------------
-- Recriada a partir de 20260821080000_forma_autorizacao_do_relatorio.sql, com UMA adição.
-- Partir de qualquer versão anterior desfaria a guarda de guia duplicada de
-- 20260821070000 (o `guia_ja_usada_por_outra_linha` e o rank 1:1), que já está embutida
-- aqui.
--
-- LIMITE DE ESCOPO que vale lembrar ao ler o CASE abaixo: `vw_match_autorizacoes_assim` é
-- filtrada em HOJE nos dois lados, então este sync só age no dia corrente. Guia tirada à
-- mão ontem e descoberta hoje não passa por aqui — ela cai em reconciliar_guias_por_janela
-- (bloco 4) ou fica órfã para a triagem da Reconciliação.
CREATE OR REPLACE FUNCTION public.sync_assim_results()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN

  -- ── Alerta: as guias que este sync se recusou a carimbar ──────────────────
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
      vm.data_execucao,
      -- A forma de validação. `guia` é chave única em autorizacoes_assim, então
      -- o join por número é exato aqui — e não é o caso do "número recicla",
      -- porque vm.guia VEIO desta mesma tabela nesta mesma leitura.
      aa.biofacial,
      COALESCE(aa.teve_token, false) AS teve_token
    FROM fila_autorizacoes fa
    JOIN vw_match_autorizacoes_assim vm
      ON  fa.paciente_id::bigint = vm.paciente_id
      AND fa.data_atendimento    = vm.data_atendimento
      AND fa.horario             = vm.hora_inicial
    LEFT JOIN public.autorizacoes_assim aa
      ON  aa.guia = vm.guia
    -- A GUARDA (20260821070000). Fora daqui a linha inteira é pulada: sem guia
    -- própria, ela não tem autorização, e o status não pode avançar.
    WHERE NOT public.guia_ja_usada_por_outra_linha(vm.guia, vm.data_execucao, fa.id)
  ),

  -- 1:1 dentro da rodada: uma guia carimba no máximo uma linha, e uma linha
  -- recebe no máximo uma guia.
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
      n.biofacial,
      n.teve_token,
      CASE
        WHEN n.status_assim = 'Liberado *'
          AND n.status_atual <> 'concluido'
          THEN 'cancelado'

        WHEN n.status_assim = 'Liberado'
          AND n.guia IS NOT NULL
          AND (
            n.status_atual IN ('erro', 'pendente')
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

    -- ── A origem da guia ────────────────────────────────────────────────────
    -- A condição do meio é o mesmo teste que o COALESCE logo acima já faz
    -- implicitamente: só é 'relatorio' quando ESTE sync é quem está suprindo a
    -- guia. Se a linha já tinha número, ele veio do robô e nada muda.
    --
    -- E o primeiro ramo é o que impede o campo de mentir na maioria das linhas:
    -- o sync reencontra a mesma sessão a cada rodada, muito depois de concluída,
    -- e sem ele toda guia capturada pelo robô viraria 'relatorio' na passada
    -- seguinte.
    numero_autorizacao_origem = CASE
      WHEN fa.numero_autorizacao_origem IS NOT NULL THEN fa.numero_autorizacao_origem
      WHEN fa.numero_autorizacao IS NULL
       AND a.guia                IS NOT NULL        THEN 'relatorio'
      ELSE fa.numero_autorizacao_origem
    END,

    -- ── A forma de validação ────────────────────────────────────────────────
    -- O valor cru vem sempre; ele é o fato do relatório, independente de quem
    -- respondeu o modal.
    biofacial_assim     = COALESCE(a.biofacial, fa.biofacial_assim),

    -- O mapeado só entra onde ninguém respondeu. A divergência entre as duas
    -- fontes fica visível comparando forma_autorizacao com
    -- forma_validacao_do_biofacial(biofacial_assim, ...) — sobrescrever
    -- apagaria justamente a evidência do período em paralelo.
    forma_autorizacao   = COALESCE(
                            fa.forma_autorizacao,
                            public.forma_validacao_do_biofacial(a.biofacial, a.teve_token)
                          ),

    -- Primeiro a escrever ganha, e nunca é reescrito.
    forma_autorizacao_origem = CASE
      WHEN fa.forma_autorizacao_origem IS NOT NULL THEN fa.forma_autorizacao_origem
      WHEN fa.forma_autorizacao        IS NOT NULL THEN 'modal'
      WHEN public.forma_validacao_do_biofacial(a.biofacial, a.teve_token) IS NOT NULL
        THEN 'relatorio'
      ELSE NULL
    END,

    -- validacao_finalizada_em NÃO é tocado de propósito: ele é o carimbo de
    -- "a atendente respondeu" (robo_concluir_tarefa e a rota /api/fila-
    -- autorizacoes/validacao). Nada lê essa coluna como gatilho hoje — ela é
    -- trilha de auditoria, e o sync mentiria ao preenchê-la.

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
-- 4. O reparo à mão
-- ---------------------------------------------------------------------------
-- Recriada a partir de 20260805170500_reconciliar_guias_limite_de_janela.sql, com UMA
-- adição no UPDATE. Mesma assinatura de 4 argumentos, então CREATE OR REPLACE sem DROP.
--
-- Aqui o write-once é redundante — o `WHERE fa.numero_autorizacao IS NULL` já garante que
-- só linha sem guia é tocada — mas a forma é a mesma dos outros dois sites de propósito:
-- quem ler os três lado a lado tem de ver a mesma regra, não três variações dela.
CREATE OR REPLACE FUNCTION public.reconciliar_guias_por_janela(
  p_de              date,
  p_ate             date,
  p_aplicar         boolean DEFAULT false,
  p_janela_max_seg  integer DEFAULT NULL
)
RETURNS TABLE(
  fila_id          uuid,
  paciente_nome    text,
  data_atendimento date,
  horario          time without time zone,
  terapia_nome     text,
  tuss             text,
  guia             text,
  data_execucao    timestamp without time zone,
  janela_inicio    timestamp without time zone,
  janela_fim       timestamp without time zone,
  janela_seg       integer,
  aplicado         boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
#variable_conflict use_column
BEGIN

  CREATE TEMP TABLE _pares_guia ON COMMIT DROP AS
  WITH candidatas AS (
    -- Linhas que terminaram o fluxo ASSIM sem guia vinculada. Só entram as que têm
    -- trilha de log completa: sem janela não há como afirmar nada com segurança.
    SELECT
      fa.id,
      fa.paciente_nome,
      fa.data_atendimento,
      fa.horario,
      fa.terapia_nome,
      fa.tuss,
      fa.matricula,
      fa.dep,
      ( (SELECT min(l.created_at) FROM public.fila_autorizacoes_logs l
          WHERE l.fila_id = fa.id AND l.status = 'processando')
        AT TIME ZONE 'America/Sao_Paulo' ) AS janela_ini,
      ( (SELECT max(l.created_at) FROM public.fila_autorizacoes_logs l
          WHERE l.fila_id = fa.id AND l.status LIKE 'concluido%')
        AT TIME ZONE 'America/Sao_Paulo' ) AS janela_fim
    FROM public.fila_autorizacoes fa
    WHERE fa.data_atendimento BETWEEN p_de AND p_ate
      AND fa.status = ANY (ARRAY['concluido'::text, 'concluido_sem_guia'::text])
      AND fa.numero_autorizacao IS NULL
      AND COALESCE(fa.completion_type, 'automated') = 'automated'
      AND fa.matricula IS NOT NULL
      AND fa.tuss     IS NOT NULL
  ),
  pares AS (
    SELECT
      c.id, c.paciente_nome, c.data_atendimento, c.horario, c.terapia_nome, c.tuss,
      aa.guia, aa.data_execucao, c.janela_ini, c.janela_fim,
      extract(epoch FROM (c.janela_fim - c.janela_ini))::integer AS janela_seg,
      -- Desempate: a guia temporalmente mais próxima da conclusão da linha.
      ROW_NUMBER() OVER (
        PARTITION BY c.id
        ORDER BY abs(extract(epoch FROM (aa.data_execucao - c.janela_fim)))
      ) AS rank_fila,
      ROW_NUMBER() OVER (
        PARTITION BY aa.guia
        ORDER BY abs(extract(epoch FROM (aa.data_execucao - c.janela_fim)))
      ) AS rank_guia
    FROM candidatas c
    JOIN public.autorizacoes_assim aa
      ON  aa.matricula_limpa = c.matricula
      AND COALESCE(right(aa.matricula, 2), '') = COALESCE(c.dep, '')
      AND aa.codigo_tuss     = c.tuss
      AND aa.data_execucao BETWEEN (c.janela_ini - interval '2 minutes')
                               AND (c.janela_fim + interval '2 minutes')
      -- Guia já pertencente a outra linha: comparação escopada pelo INSTANTE, não
      -- pelo número cru (o número recicla — ver 20260805170100).
      AND NOT EXISTS (
        SELECT 1
        FROM public.fila_autorizacoes f2
        WHERE f2.numero_autorizacao  = aa.guia
          AND f2.horario_autorizacao IS NOT NULL
          AND abs(extract(epoch FROM (f2.horario_autorizacao - aa.data_execucao))) < 300
      )
    WHERE c.janela_ini IS NOT NULL
      AND c.janela_fim IS NOT NULL
  )
  SELECT
    id AS fila_id, paciente_nome, data_atendimento, horario, terapia_nome, tuss,
    guia, data_execucao, janela_ini AS janela_inicio, janela_fim, janela_seg
  FROM pares
  -- 1:1 nos dois sentidos — nenhuma guia servindo duas sessões, nenhuma sessão
  -- disputando duas guias.
  WHERE rank_fila = 1
    AND rank_guia = 1
    AND (p_janela_max_seg IS NULL OR janela_seg <= p_janela_max_seg);

  IF p_aplicar THEN
    UPDATE public.fila_autorizacoes fa
    SET numero_autorizacao  = p.guia,
        horario_autorizacao = p.data_execucao,
        status_assim        = 'Liberado',
        status              = 'concluido',
        -- A guia veio do extrato, achada por janela temporal — o Pulsar não a
        -- capturou. Valor próprio, e não 'relatorio', porque a evidência é de
        -- outra natureza: aqui o pareamento é por proximidade de tempo, não pelo
        -- match posicional do sync. Quem for auditar a origem um dia precisa
        -- poder separar as duas.
        numero_autorizacao_origem = CASE
          WHEN fa.numero_autorizacao_origem IS NOT NULL THEN fa.numero_autorizacao_origem
          ELSE 'reconciliacao'
        END
    FROM _pares_guia p
    WHERE fa.id = p.fila_id
      AND fa.numero_autorizacao IS NULL;
  END IF;

  RETURN QUERY
  SELECT p.fila_id, p.paciente_nome, p.data_atendimento, p.horario, p.terapia_nome,
         p.tuss, p.guia, p.data_execucao, p.janela_inicio, p.janela_fim, p.janela_seg,
         p_aplicar
  FROM _pares_guia p
  ORDER BY p.data_atendimento, p.horario;

END;
$$;
