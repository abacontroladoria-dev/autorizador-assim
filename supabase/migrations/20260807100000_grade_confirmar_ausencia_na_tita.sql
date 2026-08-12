-- Fase 2.5 — Distinguir "sumiu por engano" de "foi apagada mesmo".
--
-- O guarda que 20260806120000 criou barra o cálculo quando há sessão agendada
-- fora da grade. Ele achou os R$ 490,00 de julho, e depois travou agosto.
--
-- O que agosto mostrou: 7 sessões passadas com ativo = false que a reconciliação
-- não repôs. Investigadas, eram todas do MESMO paciente, com 7 profissionais
-- diferentes (todos ainda ativos) — e a última sessão ativa dele é 30/07,
-- enquanto as 59 seguintes, até 30/09, estão inativas. Isso é alta: o paciente
-- saiu e a TiTa retirou a agenda inteira dele. A inativação está CERTA, e essas
-- linhas nunca vão voltar.
--
-- Ou seja, o guarda estava perguntando a coisa errada. "Existe linha inativa?" é
-- uma pergunta cuja resposta legítima é "sim, sempre" — alta de paciente, sessão
-- cancelada, remarcação. Um alarme que nunca apaga é um alarme que se aprende a
-- ignorar, e aí o próximo R$ 490,00 passa batido junto com o ruído.
--
-- A pergunta certa é "existe linha inativa que ninguém conferiu?". E nada no
-- banco responde isso: as 38 erradas de julho e as 7 certas de agosto são
-- idênticas aqui dentro (motivo 'excluido', execução nula, mesma origem). O que
-- as separa é uma informação que só existe fora — se a TiTa ainda reporta a
-- sessão. A reconciliação diária já faz essa pergunta; o que faltava era guardar
-- a resposta.
--
-- `ausencia_confirmada_em` guarda exatamente isso: o instante em que a passada de
-- execução leu a TiTa para aquela janela e a linha NÃO veio. A partir daí ela é
-- exclusão confirmada e para de alarmar. Toda linha inativa vira, em até 24h,
-- ou reativada (estava errada) ou carimbada (estava certa) — e o contador do
-- guarda volta a zero sozinho. Se NÃO voltar, aí sim alguma coisa quebrou, que é
-- o que um alarme deve significar.
--
-- É um fato aprendido depois do fato, igual às colunas de execução, então entra
-- na lista de mutáveis do congelamento pelo mesmo motivo que elas.

ALTER TABLE public.csv_grades_profissionais
  ADD COLUMN IF NOT EXISTS ausencia_confirmada_em timestamptz;

COMMENT ON COLUMN public.csv_grades_profissionais.ausencia_confirmada_em IS
  'Instante em que a passada de execução consultou a TiTa para a janela desta linha e ela não veio na resposta — ou seja, exclusão confirmada na origem. NULL numa linha inativa significa "ainda não conferida", que é o que o guarda da remuneração conta. Só é gravado em linha com ativo = false; reativar limpa.';

-- ─── Trigger: mais um fato de execução ──────────────────────────────────────

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

COMMENT ON FUNCTION public.fn_bloquear_alteracao_grade_passada() IS
  'Em csv_grades_profissionais, torna imutável a IDENTIDADE de toda linha cuja data já passou (referência: America/Sao_Paulo), liberando as colunas de execução (status_execucao, justificativa, tratativa_*, evolucao_vinculo, criado_em_tita, excluido_em_tita, visto_em, inativado_em, ausencia_confirmada_em, updated_at) e, apenas na transição false -> true, ativo e motivo_inativacao. Inativar linha passada (true -> false) segue bloqueado; INSERT continua livre em qualquer data; DELETE segue bloqueado no passado.';

DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;

CREATE TRIGGER trg_congelar_grade_passada
  BEFORE UPDATE OR DELETE ON public.csv_grades_profissionais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_alteracao_grade_passada();

-- ─── View: expor a confirmação ──────────────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_grade_inativas
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.data,
  g.hora_inicial,
  g.paciente_id,
  g.paciente_nome,
  g.profissional_id,
  g.profissional_nome,
  g.terapia_nome,
  g.unidade_id,
  g.status_agendamento,
  g.tita_agendamento_id,
  g.origem,
  g.status_execucao,
  g.possui_tratativa,
  g.motivo_inativacao,
  g.inativado_em,
  g.visto_em,
  to_char(g.data, 'YYYY-MM') AS ano_mes,
  (g.tita_agendamento_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.csv_grades_profissionais a
      WHERE a.ativo AND a.tita_agendamento_id = g.tita_agendamento_id
   )) AS tem_substituta_ativa,
  -- No fim da lista por obrigação, não por gosto: CREATE OR REPLACE VIEW só
  -- aceita coluna nova no final. Inserir no meio renomeia as seguintes e o
  -- Postgres recusa ("cannot change name of view column").
  g.ausencia_confirmada_em
FROM public.csv_grades_profissionais g
WHERE NOT g.ativo;

COMMENT ON VIEW public.vw_grade_inativas IS
  'Linhas que vw_grade_base esconde por ativo = false, para as telas conseguirem avisar que a grade do período está incompleta. Projeção enxuta e não intercambiável com vw_grade_base/vw_grade_atendimentos — é relatório de saúde, não fonte de cálculo. Perda suspeita é tem_substituta_ativa = false E ausencia_confirmada_em IS NULL; com substituta a sessão segue na grade em outra versão, e com a ausência confirmada a TiTa realmente não a reporta mais (alta de paciente, cancelamento). Medido em 2026-08: das 43 inativas de julho, 38 eram engano do sync e voltaram; as 7 de agosto eram alta de um paciente e ficam.';

GRANT SELECT ON public.vw_grade_inativas TO authenticated, service_role;
REVOKE ALL ON public.vw_grade_inativas FROM anon;
