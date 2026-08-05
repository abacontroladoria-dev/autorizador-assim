-- Fase 1.4 — Congelamento do passado em csv_grades_profissionais.
--
-- Este é o cadeado do projeto. A TiTa apaga agendamentos passados quando o
-- cadastro muda (desligar um terapeuta remove retroativamente todo o histórico
-- dele), e até aqui a Edge Function sync-grade-csv reescrevia a tabela com
-- DELETE + INSERT — ou seja, bastava uma releitura de data passada para o
-- histórico sumir do nosso lado também.
--
-- Regra: um registro cuja própria `data` já passou é imutável. Não há data de
-- corte fixa em lugar nenhum — o congelamento rola sozinho com o calendário.
-- Hoje é 2026-08-05: 2026-08-04 já está congelado, 2026-08-05 ainda é editável;
-- amanhã 2026-08-05 congela sozinho, sem ninguém mexer em configuração.
--
--   INSERT  → sempre permitido, em qualquer data. É o que deixa importar ou
--             corrigir histórico manualmente (foi assim que o backup XLS entrou).
--   UPDATE  → bloqueado se o registro já é passado, ou se estiver sendo empurrado
--             para o passado.
--   DELETE  → bloqueado se o registro já é passado. O sync não faz DELETE em
--             caso nenhum (ver sync-grade-csv/index.ts): sessão removida na TiTa
--             vira ativo = false, nunca sumiço.
--
-- Duas sutilezas que valem o comentário:
--
-- 1. A data de referência é a de São Paulo, não CURRENT_DATE. O Postgres do
--    Supabase roda em UTC, então entre 21:00 e 23:59 BRT o CURRENT_DATE já é
--    D+1 enquanto no Brasil ainda é D — e uma escrita legítima no dia corrente
--    seria rejeitada. Mesma classe de bug já corrigida em
--    20260804040000_fix_timezone_horario_autorizacao_logs.sql.
--
-- 2. O UPDATE checa OLD.data E NEW.data. Só NEW deixaria passar a edição de um
--    registro passado que mantém a data (o caso mais comum); só OLD deixaria
--    mover um registro futuro para trás. Em DELETE, NEW nem existe.

CREATE OR REPLACE FUNCTION public.fn_bloquear_alteracao_grade_passada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.data < v_hoje THEN
      RAISE EXCEPTION
        'csv_grades_profissionais: DELETE bloqueado em data passada (% < %). O histórico é imutável; para retirar uma sessão da grade use ativo = false.',
        OLD.data, v_hoje;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.data < v_hoje OR NEW.data < v_hoje THEN
    RAISE EXCEPTION
      'csv_grades_profissionais: UPDATE bloqueado em data passada (% -> %, hoje %). O histórico é imutável.',
      OLD.data, NEW.data, v_hoje;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_bloquear_alteracao_grade_passada() IS
  'Torna imutável toda linha de csv_grades_profissionais cuja data já passou (referência: America/Sao_Paulo). INSERT segue livre em qualquer data.';

DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;

CREATE TRIGGER trg_congelar_grade_passada
  BEFORE UPDATE OR DELETE ON public.csv_grades_profissionais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_alteracao_grade_passada();
