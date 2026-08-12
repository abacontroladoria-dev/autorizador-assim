-- Reconciliação de guias órfãs por JANELA DE AUTORIZAÇÃO, sem exigir que a data da
-- guia seja igual à data do atendimento.
--
-- Por que a data não serve como chave: `autorizacoes_assim.data_execucao` é o
-- instante em que a autorização foi feita no portal, NÃO a data do atendimento.
-- Prova (Alvaro Soares Da Silva, 05/08/2026): nas sessões autorizadas no próprio dia,
-- data_execucao == fila_autorizacoes.horario_autorizacao exatamente (08:47, 09:21,
-- 10:02, 10:40, 11:20). Quando se autoriza no mesmo dia as duas datas coincidem — por
-- isso nunca se notou. Nas duas sessões da tarde, autorizadas com dois dias de
-- antecedência (03/08), a guia ficou carimbada com 03/08 enquanto o atendimento era
-- 05/08, e TODO caminho de vínculo quebrou de forma permanente:
--   * vw_match_autorizacoes_assim (usada por sync_assim_results) exige
--     `ag.data_atendimento = hoje` E `date(aa.data_execucao) = hoje` nos dois lados;
--   * a Parte 2 de listar_central_pacientes exige `g.data_execucao::date =
--     s.data_atendimento` — e nem chega lá, porque a existência da linha de fila já
--     exclui o slot.
-- Resultado: guias 5401 e 3883 ficaram órfãs e a tela mostrou o campo Guia vazio.
--
-- A chave que funciona é o INSTANTE: a guia é emitida durante o processamento da
-- própria linha de fila. `fila_autorizacoes_logs` guarda esse intervalo com precisão
-- de segundos. Validado nos dois casos reais:
--   13:40 → janela 09:20:29–09:26:47, guia 3883 emitida 09:26 (TUSS 22070384)
--   13:00 → janela 09:19:45–09:59:29, guia 5401 emitida 09:59 (TUSS 22070460)
--
-- Uso — dry-run primeiro, SEMPRE:
--   SELECT * FROM public.reconciliar_guias_por_janela('2026-07-01','2026-08-05');
--   SELECT * FROM public.reconciliar_guias_por_janela('2026-07-01','2026-08-05', true);

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
