-- Correção de 20260805170300: os parâmetros de saída do RETURNS TABLE
-- (paciente_nome, data_atendimento, horario, terapia_nome, tuss, guia,
-- data_execucao) são variáveis PL/pgSQL e colidiam com as colunas homônimas usadas
-- dentro da query, fazendo a função estourar
-- "column reference \"paciente_nome\" is ambiguous" em qualquer chamada.
--
-- `#variable_conflict use_column` resolve a ambiguidade em favor da coluna, que é o
-- que a query quer em todos os pontos — os parâmetros de entrada (p_de, p_ate,
-- p_aplicar) não colidem com nada e seguem funcionando.

CREATE OR REPLACE FUNCTION public.reconciliar_guias_por_janela(
  p_de      date,
  p_ate     date,
  p_aplicar boolean DEFAULT false
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
    guia, data_execucao, janela_ini AS janela_inicio, janela_fim
  FROM pares
  -- 1:1 nos dois sentidos — nenhuma guia servindo duas sessões, nenhuma sessão
  -- disputando duas guias.
  WHERE rank_fila = 1 AND rank_guia = 1;

  IF p_aplicar THEN
    UPDATE public.fila_autorizacoes fa
    SET numero_autorizacao  = p.guia,
        horario_autorizacao = p.data_execucao,
        status_assim        = 'Liberado',
        status              = 'concluido'
    FROM _pares_guia p
    WHERE fa.id = p.fila_id
      AND fa.numero_autorizacao IS NULL;
  END IF;

  RETURN QUERY
  SELECT p.fila_id, p.paciente_nome, p.data_atendimento, p.horario, p.terapia_nome,
         p.tuss, p.guia, p.data_execucao, p.janela_inicio, p.janela_fim, p_aplicar
  FROM _pares_guia p
  ORDER BY p.data_atendimento, p.horario;

END;
$$;

GRANT EXECUTE ON FUNCTION public.reconciliar_guias_por_janela(date, date, boolean) TO service_role;
