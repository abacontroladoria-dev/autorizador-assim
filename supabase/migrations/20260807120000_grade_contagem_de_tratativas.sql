-- Fase 2.7 — O banco passa a saber quantas evoluções cada agendamento teve.
--
-- O relatório da TiTa emite **uma linha por tratativa, não por agendamento**.
-- Evoluir a mesma sessão duas vezes produz duas linhas com o mesmo
-- `ID Agendamento`. Medido em julho/2026: 5 casos em 19.064 linhas.
--
-- Nos dois caminhos isso estava errado, de formas opostas:
--
--   upload — somava as duas cópias e pagava a sessão duas vezes (R$ 95).
--   banco  — colapsa por `tita_agendamento_id`, então a segunda evolução
--            sobrescrevia a primeira e ninguém ficava sabendo. Uma sessão
--            paga, calada, para quem escreveu por último.
--
-- O caso que mostra por que "calado" é o pior dos dois: agendamento 2906012,
-- 01/07 08:00, Psicopedagogia. Ingrid (id 8658) evoluiu às 09:50:14 e
-- Elisangela (id 8670) evoluiu a MESMA sessão às 09:53:05. Só uma atendeu. O
-- banco escolheu a Elisangela por ser a última e pagou, sem registrar que havia
-- disputa; o upload pagou as duas.
--
-- Estas duas colunas são o sinal que faltava. Com elas, `classificarSessaoReal`
-- distingue os dois casos e o frontend chega à mesma conclusão lendo do banco ou
-- do CSV:
--
--   tratativas > 1 e tratativas_distintas = 1 → "Evolução duplicada"
--       Mesma pessoa salvou duas vezes (medido: intervalos de 3s, 12s, 41s e
--       2min). A autoria é certa, então PAGA — uma vez.
--
--   tratativas_distintas > 1 → "Evolução em conflito"
--       Pessoas diferentes evoluíram o mesmo agendamento. O sistema não tem como
--       saber qual atendeu: NÃO paga, e entra na lista de inconsistências para
--       alguém decidir.
--
-- São fatos aprendidos depois da sessão, como as outras colunas de execução, e
-- entram na lista de mutáveis do congelamento pelo mesmo motivo.

ALTER TABLE public.csv_grades_profissionais
  ADD COLUMN IF NOT EXISTS tratativas           smallint,
  ADD COLUMN IF NOT EXISTS tratativas_distintas smallint;

COMMENT ON COLUMN public.csv_grades_profissionais.tratativas IS
  'Quantas linhas a TiTa devolveu para este tita_agendamento_id na última captura — ou seja, quantas evoluções a sessão tem. NULL = ainda não capturado; 1 = normal. Maior que 1 com tratativas_distintas = 1 é a mesma pessoa salvando de novo.';

COMMENT ON COLUMN public.csv_grades_profissionais.tratativas_distintas IS
  'Quantas PESSOAS diferentes evoluíram este agendamento (distintos tratativa_profissional_id na resposta da TiTa). Maior que 1 é conflito de autoria: o cálculo da remuneração não paga a sessão até alguém resolver.';

-- ─── Trigger: mais dois fatos de execução ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_bloquear_alteracao_grade_passada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_mutaveis constant text[] := ARRAY[
    'status_execucao',
    'justificativa',
    'possui_tratativa',
    'tratativa_profissional_id',
    'tratativa_profissional_nome',
    'tratativa_criada_em',
    'tratativa_origem',
    'tratativas',
    'tratativas_distintas',
    'evolucao_vinculo',
    'criado_em_tita',
    'excluido_em_tita',
    'visto_em',
    'inativado_em',
    'ausencia_confirmada_em',
    'updated_at'
  ];

  -- Liberadas SÓ quando a linha está sendo reativada. Fora desse caso continuam
  -- congeladas: é o que impede a baixa retroativa.
  v_da_reativacao constant text[] := ARRAY['ativo', 'motivo_inativacao'];

  v_permitidas text[];
  v_antes jsonb;
  v_depois jsonb;
  v_alteradas text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.data < v_hoje THEN
      RAISE EXCEPTION
        'csv_grades_profissionais: DELETE bloqueado em data passada (% < %). O histórico é imutável; para retirar uma sessão da grade use ativo = false.',
        OLD.data, v_hoje;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.data >= v_hoje AND NEW.data >= v_hoje THEN
    RETURN NEW;
  END IF;

  v_permitidas := v_mutaveis;
  IF OLD.ativo IS NOT TRUE AND NEW.ativo IS TRUE THEN
    v_permitidas := v_mutaveis || v_da_reativacao;
  END IF;

  v_antes  := to_jsonb(OLD) - v_permitidas;
  v_depois := to_jsonb(NEW) - v_permitidas;

  IF v_antes IS DISTINCT FROM v_depois THEN
    SELECT string_agg(o.key, ', ' ORDER BY o.key)
      INTO v_alteradas
      FROM jsonb_each(v_antes) o
     WHERE o.value IS DISTINCT FROM v_depois -> o.key;

    RAISE EXCEPTION
      'csv_grades_profissionais: UPDATE bloqueado em data passada (% -> %, hoje %). A identidade da sessão é imutável; só colunas de execução podem avançar (e ativo apenas de false para true). Colunas recusadas: %.',
      OLD.data, NEW.data, v_hoje, COALESCE(v_alteradas, '(estrutura)');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;

CREATE TRIGGER trg_congelar_grade_passada
  BEFORE UPDATE OR DELETE ON public.csv_grades_profissionais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_alteracao_grade_passada();

-- ─── RPC de aplicação em lote ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_aplicar_execucao_grade(p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_linhas IS NULL OR jsonb_array_length(p_linhas) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.csv_grades_profissionais g
     SET status_execucao             = e.status_execucao,
         justificativa               = e.justificativa,
         possui_tratativa            = e.possui_tratativa,
         tratativa_profissional_id   = e.tratativa_profissional_id,
         tratativa_profissional_nome = e.tratativa_profissional_nome,
         tratativa_criada_em         = e.tratativa_criada_em,
         tratativa_origem            = e.tratativa_origem,
         tratativas                  = e.tratativas,
         tratativas_distintas        = e.tratativas_distintas,
         evolucao_vinculo            = e.evolucao_vinculo,
         criado_em_tita              = e.criado_em_tita,
         excluido_em_tita            = e.excluido_em_tita,
         visto_em                    = now()
    FROM jsonb_to_recordset(p_linhas) AS e(
           id                          uuid,
           status_execucao             text,
           justificativa               text,
           possui_tratativa            boolean,
           tratativa_profissional_id   bigint,
           tratativa_profissional_nome text,
           tratativa_criada_em         timestamptz,
           tratativa_origem            text,
           tratativas                  smallint,
           tratativas_distintas        smallint,
           evolucao_vinculo            text,
           criado_em_tita              timestamptz,
           excluido_em_tita            timestamptz
         )
   WHERE g.id = e.id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

COMMENT ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) IS
  'Aplica em lote as colunas de execução de csv_grades_profissionais (status_execucao, justificativa, tratativa_*, tratativas, tratativas_distintas, evolucao_vinculo, criado_em_tita, excluido_em_tita), casando por id. Chamada pela Edge Function sync-grade-csv em modo "execucao". Não insere, não inativa e não toca em coluna de identidade — o trigger trg_congelar_grade_passada recusaria.';

REVOKE ALL ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) TO service_role;

-- ─── View: projetar as duas colunas ─────────────────────────────────────────
--
-- Vão no fim da lista por obrigação: CREATE OR REPLACE VIEW só aceita coluna
-- nova no final.

CREATE OR REPLACE VIEW public.vw_grade_base
WITH (security_invoker = true) AS
SELECT
  id, data, dia_semana, hora_inicial, hora_final,
  paciente_id, paciente_nome, profissional_id, profissional_nome,
  terapia_id, terapia_nome, terapia_exibicao_id, terapia_exibicao_nome,
  sala_nome, unidade_id, unidade_nome, convenio_nome,
  status_agendamento, tita_agendamento_id, origem,

  status_execucao, justificativa, possui_tratativa,
  tratativa_profissional_id, tratativa_profissional_nome, tratativa_criada_em,
  tratativa_origem, evolucao_vinculo, criado_em_tita, excluido_em_tita,

  EXTRACT(year  FROM data)::int AS ano,
  EXTRACT(month FROM data)::int AS mes,
  to_char(data, 'YYYY-MM')      AS ano_mes,
  EXTRACT(week  FROM data)::int AS semana_iso,

  (EXTRACT(day FROM data)::int - 1) / 7 + 1       AS semana_do_mes,
  (EXTRACT(day FROM data)::int - 1) / 7 + 1 = 1   AS is_primeira_semana,
  (EXTRACT(day FROM data)::int - 1) / 7
    = (EXTRACT(day FROM (date_trunc('month', data) + interval '1 month' - interval '1 day'))::int - 1) / 7
                                                  AS is_ultima_semana,

  data = date_trunc('month', data)::date          AS is_primeiro_dia_mes,
  data = (date_trunc('month', data) + interval '1 month' - interval '1 day')::date
                                                  AS is_ultima_data_mes,
  EXTRACT(isodow FROM data)::int BETWEEN 1 AND 5  AS is_dia_util,

  data < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS is_congelado,

  tratativas,
  tratativas_distintas

FROM public.csv_grades_profissionais
WHERE ativo
  AND COALESCE(profissional_nome, '') NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Testes Técnicos%'
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Combinar Consulta%'
  AND NOT (origem = 'backup_xls' AND tita_agendamento_id IS NULL AND data >= DATE '2026-07-01');
