-- ===========================================================================
-- O relatório da ASSIM passou a trazer a forma de validação. Dá para aposentar
-- o modal que a atendente responde no fim de cada autorização?
-- ===========================================================================
--
-- HOJE são duas fontes para a MESMA informação:
--
--   fila_autorizacoes.forma_autorizacao   ← o modal do robô (OPCOES_VALIDACAO em
--                                            robo-autorizador/rpa.js:407-414),
--                                            respondido à mão pela atendente
--   autorizacoes_assim.biofacial          ← o relatório da ASSIM, que agora traz
--                                            a informação sozinho
--
-- Antes de tirar o modal do caminho é preciso responder três coisas, e cada
-- bloco abaixo responde uma:
--
--   A. O relatório cobre TUDO? (bloco 2) — se ele só preenche parte das linhas,
--      tirar o modal cria buraco em vez de economizar tempo.
--   B. O vocabulário é o MESMO? (blocos 3 e 4) — 'Biometria' do modal é o quê no
--      relatório? Sem o de-para, quem consome forma_autorizacao quebra.
--   C. Quando divergem, quem está certo? (bloco 5) — amostra para olhar no olho.
--
-- QUEM CONSOME forma_autorizacao HOJE, e por isso não pode ser esquecido:
--   - get_tokens_mensal() / Conferência de Filipetas: 'Token' e 'Erro no
--     Reconhecimento Facial' são as duas formas que DEIXAM PAPEL para conferir
--     (supabase/snippets/20260820_tokens_mensal_inclui_erro_facial_remoto.sql).
--   - a tela diária da auditoria, que trata as duas igual.
--
-- ATENÇÃO AO PAREAMENTO. Nada aqui compara `numero_autorizacao = guia` cru: o
-- número da guia da ASSIM RECICLA (4.652 números repetidos cobrindo 12.883
-- linhas, medido em 05/08/2026). Todo cruzamento abaixo é qualificado pelo
-- INSTANTE — autorizacoes_assim.data_execucao é o momento em que a autorização
-- foi feita no portal, e bate com fila_autorizacoes.horario_autorizacao dentro
-- de segundos. Janela de ±5 min, o mesmo critério de
-- reconciliar_guias_por_janela() e de get_guias_orfas().
--
-- Somente leitura. Nada aqui altera dado.

-- ---------------------------------------------------------------------------
-- 0. A coluna existe mesmo, e é o quê?
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'autorizacoes_assim'
  AND column_name IN ('biofacial', 'teve_token', 'token', 'status', 'data_execucao')
ORDER BY column_name;


-- ---------------------------------------------------------------------------
-- 1. Inventário: o que aparece nessa coluna, desde 01/07/2026
-- ---------------------------------------------------------------------------
-- É o retrato do vocabulário. Se voltar uma lista curta e estável, existe
-- de-para possível; se voltar texto livre, não existe.
SELECT
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)') AS valor_biofacial,
  count(*)                                                  AS linhas,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1)        AS pct,
  min(aa.data_execucao)::date                               AS primeira_vez,
  max(aa.data_execucao)::date                               AS ultima_vez,
  min(aa.guia)                                              AS exemplo_guia
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= DATE '2026-07-01'
GROUP BY 1
ORDER BY linhas DESC;


-- ---------------------------------------------------------------------------
-- 2. Desde quando o relatório traz isso, e quanto ele cobre
-- ---------------------------------------------------------------------------
-- A pergunta A. O mês em que `preenchidas` sai do zero é o mês em que a ASSIM
-- ligou o campo. `pct_preenchido` no mês corrente é a cobertura real — é ela que
-- diz se o modal pode sumir ou se ainda precisa ser o plano B.
SELECT
  date_trunc('month', aa.data_execucao)::date                  AS mes,
  count(*)                                                     AS total_autorizacoes,
  count(*) FILTER (WHERE btrim(COALESCE(aa.biofacial, '')) <> '') AS preenchidas,
  round(
    100.0 * count(*) FILTER (WHERE btrim(COALESCE(aa.biofacial, '')) <> '')
    / NULLIF(count(*), 0)
  , 1)                                                         AS pct_preenchido
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= DATE '2026-07-01'
GROUP BY 1
ORDER BY 1;


-- ---------------------------------------------------------------------------
-- 3. O de-para: biofacial (relatório)  x  forma_autorizacao (modal)
-- ---------------------------------------------------------------------------
-- A pergunta B, e o coração do snippet. Cada célula é "o relatório disse X e a
-- atendente disse Y, N vezes". O que se espera de um campo substituível é uma
-- diagonal: poucas combinações, cada valor do relatório caindo quase sempre no
-- mesmo valor do modal.
WITH pareado AS (
  SELECT
    COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)')         AS valor_biofacial,
    COALESCE(NULLIF(btrim(fa.forma_autorizacao), ''), '(nao respondido)') AS forma_do_modal
  FROM public.autorizacoes_assim aa
  JOIN public.fila_autorizacoes fa
    ON  fa.numero_autorizacao   = aa.guia
    AND fa.horario_autorizacao IS NOT NULL
    -- ±5 min: o mesmo evento nas duas pontas. NÃO trocar por igualdade de
    -- número cru — o número recicla.
    AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
  WHERE aa.data_execucao >= DATE '2026-07-01'
)
SELECT
  valor_biofacial,
  forma_do_modal,
  count(*)                                           AS linhas,
  round(
    100.0 * count(*) / sum(count(*)) OVER (PARTITION BY valor_biofacial)
  , 1)                                               AS pct_dentro_do_biofacial
FROM pareado
GROUP BY 1, 2
ORDER BY valor_biofacial, linhas DESC;


-- ---------------------------------------------------------------------------
-- 4. O relatório distingue token? (cruzamento com teve_token)
-- ---------------------------------------------------------------------------
-- 'Token' é uma das opções do modal e é o que alimenta a Conferência de
-- Filipetas. autorizacoes_assim já tem teve_token/token por conta própria; este
-- bloco mostra se `biofacial` diz a mesma coisa ou algo independente.
SELECT
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)') AS valor_biofacial,
  aa.teve_token,
  count(*)                                                  AS linhas,
  count(*) FILTER (WHERE btrim(COALESCE(aa.token, '')) <> '') AS com_numero_de_token
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= DATE '2026-07-01'
GROUP BY 1, 2
ORDER BY 1, 2;


-- ---------------------------------------------------------------------------
-- 5. Onde os dois discordam — amostra para olhar no olho
-- ---------------------------------------------------------------------------
-- A pergunta C. Divergência aqui não significa que o relatório erra: pode ser a
-- atendente clicando no que for mais rápido para fechar o modal, que aliás é
-- mais um motivo para aposentá-lo. Mas é preciso ver antes de decidir.
SELECT
  aa.data_execucao,
  aa.guia,
  fa.paciente_nome,
  fa.horario                    AS horario_sessao,
  aa.biofacial                  AS relatorio_diz,
  fa.forma_autorizacao          AS atendente_disse,
  fa.criado_por                 AS solicitado_por,
  aa.status                     AS status_assim,
  fa.status                     AS status_fila
FROM public.autorizacoes_assim aa
JOIN public.fila_autorizacoes fa
  ON  fa.numero_autorizacao   = aa.guia
  AND fa.horario_autorizacao IS NOT NULL
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE aa.data_execucao >= DATE '2026-07-01'
  AND btrim(COALESCE(aa.biofacial, ''))         <> ''
  AND btrim(COALESCE(fa.forma_autorizacao, '')) <> ''
  -- Compara sem acento/caixa não dá para fazer barato aqui; a leitura da
  -- diferença é do bloco 3. Este bloco lista tudo que não é igualdade literal e
  -- deixa o olho decidir o que é sinônimo e o que é divergência de verdade.
  AND lower(btrim(aa.biofacial)) <> lower(btrim(fa.forma_autorizacao))
ORDER BY aa.data_execucao DESC
LIMIT 100;


-- ---------------------------------------------------------------------------
-- 6. O buraco ao contrário: sessão validada no modal que o relatório não cobre
-- ---------------------------------------------------------------------------
-- Se isto vier alto, tirar o modal perde informação. Se vier perto de zero, o
-- relatório já sabe tudo que a atendente estava digitando.
SELECT
  date_trunc('month', fa.horario_autorizacao)::date            AS mes,
  count(*)                                                     AS com_forma_no_modal,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM public.autorizacoes_assim aa
      WHERE aa.guia              = fa.numero_autorizacao
        AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
        AND btrim(COALESCE(aa.biofacial, '')) <> ''
    )
  )                                                            AS cobertas_pelo_relatorio,
  count(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.autorizacoes_assim aa
      WHERE aa.guia              = fa.numero_autorizacao
        AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
        AND btrim(COALESCE(aa.biofacial, '')) <> ''
    )
  )                                                            AS sem_cobertura
FROM public.fila_autorizacoes fa
WHERE fa.horario_autorizacao        >= TIMESTAMP '2026-07-01 00:00:00'
  AND fa.numero_autorizacao IS NOT NULL
  AND btrim(COALESCE(fa.forma_autorizacao, '')) <> ''
GROUP BY 1
ORDER BY 1;
