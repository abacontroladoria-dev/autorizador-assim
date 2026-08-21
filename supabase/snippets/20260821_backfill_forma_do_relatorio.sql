-- ===========================================================================
-- Backfill: preencher forma_autorizacao a partir do relatório, na janela retida
-- ===========================================================================
--
-- A migration 20260821080000 faz o sync copiar `biofacial` daqui em diante, mas
-- `vw_match_autorizacoes_assim` só enxerga O DIA DE HOJE
-- (`WHERE ag.data_atendimento = hoje AND date(aa.data_execucao) = hoje`). O
-- passado não se preenche sozinho.
--
-- Este snippet preenche o que ainda dá: `autorizacoes_assim` é janela rolante
-- de ~30 dias, então só existe o que o relatório ainda retém. O que saiu da
-- janela está perdido para sempre — rodar isto CEDO é a diferença entre
-- recuperar um mês e recuperar nada.
--
-- ORDEM: 20260821070000 e 20260821080000 aplicadas antes (é a segunda que cria
-- as colunas e a função de de-para).
--
-- O pareamento é por guia MAIS INSTANTE (±300s). Não é preciosismo: o número da
-- guia da ASSIM RECICLA — 4.652 números repetidos cobrindo 12.883 linhas,
-- medido em 05/08/2026. Casar só pelo número traria a forma de validação de uma
-- autorização de outro paciente, de outro mês.
--
-- RODE OS BLOCOS 1 E 2 ANTES DO 3. O 3 escreve.

-- ---------------------------------------------------------------------------
-- 1. DRY-RUN: quantas linhas seriam tocadas, e viradas em quê
-- ---------------------------------------------------------------------------
SELECT
  public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token) AS viraria,
  aa.biofacial                                                     AS codigo_do_relatorio,
  count(*)                                                         AS linhas,
  min(fa.data_atendimento)                                         AS de,
  max(fa.data_atendimento)                                         AS ate
FROM public.fila_autorizacoes fa
JOIN public.autorizacoes_assim aa
  ON  aa.guia = fa.numero_autorizacao
  AND fa.horario_autorizacao IS NOT NULL
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE fa.forma_autorizacao IS NULL
  AND btrim(COALESCE(aa.biofacial, '')) <> ''
GROUP BY 1, 2
ORDER BY linhas DESC;


-- ---------------------------------------------------------------------------
-- 2. O que NÃO seria preenchido, e por quê
-- ---------------------------------------------------------------------------
-- Três buracos diferentes, e só um deles é problema:
--   'codigo desconhecido'  → código fora do de-para (4, 5, 6, 7 ou novo). É o
--                            único que pede ação: ver qual é e estender a função.
--   'relatorio sem par'    → a autorização saiu da janela rolante. Perdida.
--   'sem guia na fila'     → linha de PRESENÇA (numero_autorizacao = 'N/A') ou
--                            sessão nunca autorizada. Correto ficar de fora.
SELECT
  CASE
    WHEN fa.numero_autorizacao IS NULL
      OR fa.numero_autorizacao !~ '^[0-9]+$'          THEN 'sem guia na fila'
    WHEN aa.guia IS NULL                              THEN 'relatorio sem par'
    WHEN btrim(COALESCE(aa.biofacial, '')) = ''       THEN 'biofacial vazio'
    WHEN public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token) IS NULL
                                                      THEN 'codigo desconhecido'
    ELSE 'seria preenchido'
  END                                                 AS situacao,
  count(*)                                            AS linhas,
  min(aa.biofacial)                                   AS exemplo_codigo
FROM public.fila_autorizacoes fa
LEFT JOIN public.autorizacoes_assim aa
  ON  aa.guia = fa.numero_autorizacao
  AND fa.horario_autorizacao IS NOT NULL
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE fa.forma_autorizacao IS NULL
  AND fa.horario_autorizacao IS NOT NULL
GROUP BY 1
ORDER BY linhas DESC;


-- ---------------------------------------------------------------------------
-- 3. ESCREVE. Só depois de olhar os dois blocos acima.
-- ---------------------------------------------------------------------------
-- `forma_autorizacao IS NULL` no WHERE é o que torna o snippet repetível sem
-- estrago: rodar duas vezes não sobrescreve nada, porque a segunda passada não
-- acha mais linha nenhuma. E nunca toca no que a atendente respondeu.
--
-- `validacao_finalizada_em` fica como está, de propósito — é o carimbo de "a
-- atendente respondeu", e preencher aqui seria mentira.
UPDATE public.fila_autorizacoes fa
SET
  biofacial_assim          = aa.biofacial,
  forma_autorizacao        = public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token),
  forma_autorizacao_origem = 'relatorio',
  updated_at               = now() AT TIME ZONE 'UTC'
FROM public.autorizacoes_assim aa
WHERE aa.guia = fa.numero_autorizacao
  AND fa.horario_autorizacao IS NOT NULL
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
  AND fa.forma_autorizacao IS NULL
  AND public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token) IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 4. Conferência depois de escrever
-- ---------------------------------------------------------------------------
SELECT
  forma_autorizacao_origem,
  forma_autorizacao,
  count(*) AS linhas
FROM public.fila_autorizacoes
WHERE forma_autorizacao IS NOT NULL
  AND horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
GROUP BY 1, 2
ORDER BY 1, linhas DESC;
