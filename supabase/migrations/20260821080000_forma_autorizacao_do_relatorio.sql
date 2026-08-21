-- A forma de validação passa a vir do relatório da ASSIM, e a atendente para de
-- digitar o que o sistema já sabe.
--
-- O EXTRATO DA ASSIM MUDOU e passou a trazer a forma de validação do
-- beneficiário em `autorizacoes_assim.biofacial` — a mesma coisa que o modal do
-- robô (OPCOES_VALIDACAO, robo-autorizador/rpa.js:407) pergunta no fim de cada
-- autorização e grava em `fila_autorizacoes.forma_autorizacao`.
--
-- MEDIDO EM 21/08/2026 (janela 22/07–21/08, 5.233 linhas do relatório contra
-- 5.300 autorizações reais da fila):
--
--   10-QRCODE                    3.605  (68,9%)   QR Code
--   9-FACIAL                     1.501  (28,7%)   Biometria
--   8-DISPOSITIVO INDISPONIVEL     106  ( 2,0%)   NÃO EXISTE NO MODAL
--   1-ERRO NO RECONHECIMENTO FA     17            Erro no Reconhecimento Facial
--   2-BENEFICIARIO SE NEGOU A V      1            Beneficiário recusou validação
--   3-BENEFICIARIO SEM CELULAR       1            Beneficiário sem celular
--
-- Por que trocar de fonte:
--   - 19,8% das autorizações (1.270 de 6.419) a atendente NUNCA respondeu. O
--     modal já é fonte com um quinto de buraco.
--   - Onde os dois existem, concordam em 95,6%. O desvio tem padrão: 187 casos
--     marcados "QR Code" que o relatório diz 9-FACIAL — clique de hábito na
--     opção mais frequente.
--   - Erro facial: 4 na fila contra 17 no relatório. O relatório acha 4× mais.
--   - As 5.300 guias reais da janela existem TODAS no relatório (100%). A
--     "perda de 18,6%" que apareceu no diagnóstico eram as linhas de PRESENÇA,
--     que gravam a string literal 'N/A' em numero_autorizacao e nunca deveriam
--     estar no extrato.
--
-- TRÊS DECISÕES DE DESENHO
--
-- 1. O SYNC COPIA, o modal não é substituído por uma leitura.
--    `autorizacoes_assim` é janela rolante de ~30 dias; `forma_autorizacao` é
--    permanente. Ler o relatório sob demanda perderia o histórico junto com a
--    janela. Copiar enquanto a linha está viva preserva tudo e não muda a fonte
--    de nenhum consumidor atual (get_tokens_mensal, auditoria, telas).
--
-- 2. O DE-PARA LÊ O PREFIXO NUMÉRICO, NUNCA O RÓTULO.
--    O texto vem truncado em 25 caracteres: 'ERRO NO RECONHECIMENTO FACIAL'
--    chega como 'ERRO NO RECONHECIMENTO FA'. Os outros só parecem inteiros
--    porque têm 24. É o mesmo corte de paciente_nome, truncado em 20.
--
-- 3. CÓDIGO DESCONHECIDO NÃO VIRA CHUTE.
--    A numeração pula 4, 5, 6 e 7 — esses códigos existem na lista da ASSIM e
--    apenas não ocorreram nesta janela (o `2-` e o `3-` apareceram UMA vez cada
--    em um mês). Um `ELSE 'Biometria'` transformaria código novo em dado errado,
--    calado. Aqui desconhecido devolve NULL, e `biofacial_assim` guarda o valor
--    cru para refazer o de-para depois.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--
-- Não tira o modal do robô. O campo é novo no extrato e merece algumas semanas
-- em paralelo: com as duas fontes gravadas, `forma_autorizacao_origem` diz de
-- onde veio cada linha e dá para medir a concordância em dado fresco antes de
-- mexer no rpa.js. Também não preenche o passado — o backfill da janela retida
-- está em supabase/snippets/20260821_backfill_forma_do_relatorio.sql, para
-- rodar à mão, com dry-run.
--
-- ORDEM: esta migration recria `sync_assim_results()` A PARTIR DA VERSÃO DE
-- 20260821070000_sync_assim_nao_duplica_guia.sql (guarda de guia duplicada,
-- rank 1:1, log de conflito). Aquela precisa ir antes, senão esta desfaz a
-- correção.

-- ---------------------------------------------------------------------------
-- 1. Onde guardar
-- ---------------------------------------------------------------------------
ALTER TABLE public.fila_autorizacoes
  ADD COLUMN IF NOT EXISTS biofacial_assim          text,
  ADD COLUMN IF NOT EXISTS forma_autorizacao_origem text;

COMMENT ON COLUMN public.fila_autorizacoes.biofacial_assim IS
  'Valor CRU de autorizacoes_assim.biofacial, copiado enquanto a linha esta na '
  'janela rolante do relatorio. Guardado para permitir refazer o de-para se a '
  'ASSIM renumerar ou mudar o corte do rotulo (que vem truncado em 25 chars).';

COMMENT ON COLUMN public.fila_autorizacoes.forma_autorizacao_origem IS
  '''modal'' = a atendente respondeu; ''relatorio'' = veio de biofacial. '
  'Escrito uma vez e nunca reescrito, para a comparacao entre as duas fontes '
  'continuar possivel durante o periodo em paralelo.';

-- ---------------------------------------------------------------------------
-- 2. O de-para, num lugar só
-- ---------------------------------------------------------------------------
-- Os rótulos de saída são EXATAMENTE os de OPCOES_VALIDACAO (rpa.js:407-414),
-- porque quem consome casa por texto: get_tokens_mensal filtra
-- `forma_autorizacao ILIKE '%reconhecimento facial%'`.
CREATE OR REPLACE FUNCTION public.forma_validacao_do_biofacial(
  p_biofacial  text,
  p_teve_token boolean DEFAULT false
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE split_part(btrim(COALESCE(p_biofacial, '')), '-', 1)
    WHEN '1'  THEN 'Erro no Reconhecimento Facial'
    WHEN '2'  THEN 'Beneficiário recusou validação facial/QR Code'
    WHEN '3'  THEN 'Beneficiário sem celular'
    -- O código 8 é a CAUSA, não a forma: sem dispositivo, a ASSIM cai no
    -- #checkBday e emite a filipeta. 97 dos 106 casos da janela têm token, e
    -- fora do 8 existe UM token em 5.233 linhas. Por isso 8 + token = 'Token',
    -- que é o que a recepção marcava (93,5% das vezes) e o que os consumidores
    -- já esperam. Sem token, o rótulo diz a verdade nova, que o modal não tinha.
    WHEN '8'  THEN CASE WHEN p_teve_token THEN 'Token' ELSE 'Dispositivo indisponível' END
    WHEN '9'  THEN 'Biometria'
    WHEN '10' THEN 'QR Code'
    -- Códigos 4, 5, 6, 7 e qualquer coisa nova: NULL de propósito. Ver a nota 3
    -- no cabeçalho — chutar aqui é inventar dado.
    ELSE NULL
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.forma_validacao_do_biofacial(text, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.forma_validacao_do_biofacial(text, boolean) TO service_role;

COMMENT ON FUNCTION public.forma_validacao_do_biofacial(text, boolean) IS
  'De-para de autorizacoes_assim.biofacial para os rotulos de OPCOES_VALIDACAO. '
  'Casa pelo PREFIXO NUMERICO: o rotulo do relatorio vem truncado em 25 chars. '
  'Codigo desconhecido devolve NULL — nunca chuta.';

-- ---------------------------------------------------------------------------
-- 3. O sync passa a copiar
-- ---------------------------------------------------------------------------
-- Reclassifica status com base no retorno real do ASSIM:
--   'Liberado *' → cancelado
--   'Liberado'   → concluido
--   outro valor  → glosa      (ex: "1601-REINCIDENCIA NO ATEN")
--   NULL         → mantém status atual
-- 'concluido' e 'falta' nunca são sobrescritos.
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
-- 4. O painel do período em paralelo
-- ---------------------------------------------------------------------------
-- Enquanto as duas fontes convivem, é aqui que se decide se o modal pode sair.
-- Só aparece linha onde AS DUAS existem: a atendente respondeu E o relatório
-- trouxe o código.
CREATE OR REPLACE VIEW public.vw_forma_validacao_divergencias
WITH (security_invoker = on) AS
SELECT
  fa.data_atendimento,
  fa.forma_autorizacao                                                   AS atendente_marcou,
  fa.biofacial_assim                                                     AS relatorio_diz,
  public.forma_validacao_do_biofacial(fa.biofacial_assim)                AS relatorio_mapeado,
  count(*)                                                               AS linhas
FROM public.fila_autorizacoes fa
WHERE fa.forma_autorizacao        IS NOT NULL
  AND fa.biofacial_assim          IS NOT NULL
  AND fa.forma_autorizacao_origem = 'modal'
GROUP BY 1, 2, 3, 4
ORDER BY fa.data_atendimento DESC, linhas DESC;

COMMENT ON VIEW public.vw_forma_validacao_divergencias IS
  'Onde a atendente e o relatorio da ASSIM discordam sobre a forma de '
  'validacao. Medido em 21/08/2026 sobre o pareamento por guia: 95,6% de '
  'concordancia, e o desvio concentrado em "QR Code" marcado onde o relatorio '
  'diz 9-FACIAL. Serve para decidir quando aposentar o modal do rpa.js. '
  'ATENCAO: relatorio_mapeado nao recebe teve_token aqui, entao o codigo 8 '
  'aparece como "Dispositivo indisponivel" mesmo quando virou Token na fila.';
