-- Fase 2.2 — O congelamento passa a ser consciente de coluna.
--
-- O trigger de 20260805160200 diz "linha passada não muda". Isso protegeu o
-- histórico, mas também impede registrar o que só se sabe DEPOIS da sessão: se
-- ela foi realizada, e se o profissional evoluiu. Medido em junho/2026, 24,2%
-- das evoluções nascem depois do dia da sessão (p95 = 6 dias, máximo 41) — ou
-- seja, a informação que decide o pagamento chega, por desenho, quando a linha
-- já congelou.
--
-- A regra deixa de ser "nada muda" e passa a ser:
--
--     a IDENTIDADE da sessão é imutável — quem, quando, com quem, onde;
--     o que se SABE sobre a execução dela pode avançar.
--
-- Isso é mais forte que antes, não mais fraco, porque agora está explícito o que
-- está sendo protegido. E é declarado ao contrário de propósito: a lista abaixo
-- enumera o que PODE mudar, e tudo o mais é congelado. Coluna nova que apareça
-- amanhã nasce protegida sem ninguém lembrar de nada — o modo de falhar é negar,
-- não permitir.
--
-- Três colunas merecem nota por NÃO estarem na lista:
--
--   ativo, motivo_inativacao — continuam congeladas no passado. É o cadeado
--     principal: a TiTa apaga agendamento passado quando um terapeuta é
--     desligado, e nada pode transformar isso em baixa retroativa aqui. A
--     passada de execução nunca inativa nada; se algum dia tentar, o banco
--     recusa. Para registrar que a TiTa apagou a sessão existe excluido_em_tita,
--     que é um fato de execução e não uma baixa.
--
--   status_agendamento — congelado. Ele diz se o horário estava ocupado
--     (Agendado/Livre), o que é identidade do slot. A execução mora em
--     status_execucao, que é mutável.
--
-- A comparação usa to_jsonb(OLD) - mutáveis vs to_jsonb(NEW) - mutáveis. O custo
-- só aparece em UPDATE de linha passada; o caminho normal do sync (datas
-- futuras) sai antes, no primeiro IF.

CREATE OR REPLACE FUNCTION public.fn_bloquear_alteracao_grade_passada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- O que se aprende sobre a sessão depois que ela aconteceu. Todo o resto é
  -- identidade e não muda mais.
  v_mutaveis constant text[] := ARRAY[
    'status_execucao',
    'justificativa',
    'possui_tratativa',
    'tratativa_profissional_id',
    'tratativa_profissional_nome',
    'tratativa_criada_em',
    'tratativa_origem',
    'evolucao_vinculo',
    'criado_em_tita',
    'excluido_em_tita',
    'visto_em',
    'updated_at'
  ];

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

  -- Linha inteiramente no futuro: o sync manda, nada a proteger.
  IF OLD.data >= v_hoje AND NEW.data >= v_hoje THEN
    RETURN NEW;
  END IF;

  -- Daqui para baixo, ou a linha já é passado, ou está sendo empurrada para lá.
  -- Note que `data` está entre as colunas congeladas, então empurrar uma linha
  -- futura para o passado cai neste teste e é recusado, como antes.
  v_antes  := to_jsonb(OLD) - v_mutaveis;
  v_depois := to_jsonb(NEW) - v_mutaveis;

  IF v_antes IS DISTINCT FROM v_depois THEN
    SELECT string_agg(o.key, ', ' ORDER BY o.key)
      INTO v_alteradas
      FROM jsonb_each(v_antes) o
     WHERE o.value IS DISTINCT FROM v_depois -> o.key;

    RAISE EXCEPTION
      'csv_grades_profissionais: UPDATE bloqueado em data passada (% -> %, hoje %). A identidade da sessão é imutável; só colunas de execução podem avançar. Colunas recusadas: %.',
      OLD.data, NEW.data, v_hoje, COALESCE(v_alteradas, '(estrutura)');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_bloquear_alteracao_grade_passada() IS
  'Em csv_grades_profissionais, torna imutável a IDENTIDADE de toda linha cuja data já passou (referência: America/Sao_Paulo), liberando apenas as colunas de execução (status_execucao, justificativa, tratativa_*, evolucao_vinculo, criado_em_tita, excluido_em_tita, visto_em, updated_at). ativo e motivo_inativacao seguem congelados. INSERT continua livre em qualquer data; DELETE segue bloqueado no passado.';

-- O trigger em si não muda (mesma tabela, mesmo evento, mesma função), mas
-- recriar mantém a migration auto-suficiente num replay do zero.
DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;

CREATE TRIGGER trg_congelar_grade_passada
  BEFORE UPDATE OR DELETE ON public.csv_grades_profissionais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_alteracao_grade_passada();
