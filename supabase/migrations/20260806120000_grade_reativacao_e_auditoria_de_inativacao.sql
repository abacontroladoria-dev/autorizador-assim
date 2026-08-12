-- Fase 2.3 — Inativação deixa de ser um caminho sem volta.
--
-- O que aconteceu
-- ───────────────
-- Na primeira conferência de julho/2026 da aba /rp lendo a grade do banco, o
-- total ficou R$ 490,00 abaixo do mesmo cálculo feito sobre o CSV exportado da
-- TiTa. A apuração (scripts/conferir-grade-vs-tita.js) mostrou que a captura não
-- erra: nas 14.694 linhas presentes nos dois lados, status_execucao,
-- possui_tratativa, profissional e terapia batem 100%. O que diverge é a
-- POPULAÇÃO — 122 sessões que a TiTa reporta não estavam em vw_grade_base, e 25
-- delas eram pagáveis (Realizado + evoluída).
--
-- Das 43 linhas de julho com ativo = false, **as 43 continuam sendo reportadas
-- pela TiTa**. Nenhuma foi de fato apagada lá. Ou seja: em julho, 100% das
-- inativações são falso positivo.
--
-- Como isso vira perda permanente
-- ───────────────────────────────
-- sincronizarGrade lê a janela [hoje, +N], carrega as linhas ativas nela e
-- inativa tudo que a TiTa não devolveu naquela resposta. O comentário do sync diz
-- que a rodada seguinte conserta sozinha — e conserta, ENQUANTO a data ainda for
-- >= hoje, porque o piso da janela é hoje. Para uma linha cuja data é o próprio
-- dia, aquela é a última rodada que a enxerga: o falso positivo fica.
--
-- E ficava para sempre, porque o trigger de 20260806100100 congela `ativo` no
-- passado. Aquele cadeado existe por um motivo real (a TiTa apaga agendamento
-- passado quando um terapeuta é desligado, e isso não pode virar baixa
-- retroativa aqui) — mas ele foi escrito contra a direção true → false. Bloquear
-- também false → true não protege nada: impede apenas desfazer um engano.
--
-- O que esta migration faz
-- ────────────────────────
--   1. `inativado_em` — hoje não existe registro de QUANDO uma linha foi
--      inativada. inativar() grava só ativo e motivo_inativacao, e não há trigger
--      de updated_at nesta tabela, então updated_at marca a última ESCRITA DE
--      CONTEÚDO da linha, não a baixa. Foi por isso que não deu para datar o
--      episódio de julho. Sem carimbo não há auditoria.
--
--   2. Trigger passa a permitir a transição ativo false → true no passado
--      (e só ela), limpando motivo_inativacao/inativado_em junto. true → false
--      segue bloqueado, que é o cadeado de verdade.
--
--   3. vw_grade_inativas — dá ao frontend como enxergar o que a view principal
--      esconde. avaliarCoberturaGrade só conta status_execucao nulo ENTRE AS
--      LINHAS QUE EXISTEM; julho passou com 98,9% de cobertura e R$ 490 faltando.
--      Uma linha inativa em mês fechado é dinheiro sumindo calado.

-- ─── 1. Carimbo da inativação ───────────────────────────────────────────────

ALTER TABLE public.csv_grades_profissionais
  -- Preenchido por inativar() no sync junto com ativo = false; volta a NULL na
  -- reativação. Linhas inativadas antes desta migration ficam com NULL — não dá
  -- para reconstruir o instante, e inventar um seria pior que admitir a lacuna.
  ADD COLUMN IF NOT EXISTS inativado_em timestamptz;

COMMENT ON COLUMN public.csv_grades_profissionais.inativado_em IS
  'Instante em que a linha recebeu ativo = false. NULL em linha ativa e nas inativadas antes de 2026-08-06 (não havia carimbo). Não confundir com updated_at, que marca a última escrita de conteúdo, nem com excluido_em_tita, que é um fato vindo da TiTa.';

-- ─── 2. Reativação deixa de ser bloqueada no passado ────────────────────────

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
    'inativado_em',
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

  -- Linha inteiramente no futuro: o sync manda, nada a proteger.
  IF OLD.data >= v_hoje AND NEW.data >= v_hoje THEN
    RETURN NEW;
  END IF;

  -- Daqui para baixo, ou a linha já é passado, ou está sendo empurrada para lá.
  -- Note que `data` está entre as colunas congeladas, então empurrar uma linha
  -- futura para o passado cai neste teste e é recusado, como antes.
  --
  -- A exceção da reativação é deliberadamente assimétrica. Desfazer uma
  -- inativação devolve à grade uma sessão que a TiTa nunca deixou de reportar;
  -- é estritamente mais estreito que o INSERT, que sempre foi livre em qualquer
  -- data. O caminho true → false não passa por aqui e segue recusado.
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
  'Em csv_grades_profissionais, torna imutável a IDENTIDADE de toda linha cuja data já passou (referência: America/Sao_Paulo), liberando as colunas de execução (status_execucao, justificativa, tratativa_*, evolucao_vinculo, criado_em_tita, excluido_em_tita, visto_em, inativado_em, updated_at) e, apenas na transição false -> true, ativo e motivo_inativacao. Inativar linha passada (true -> false) segue bloqueado; INSERT continua livre em qualquer data; DELETE segue bloqueado no passado.';

-- O trigger em si não muda (mesma tabela, mesmo evento, mesma função), mas
-- recriar mantém a migration auto-suficiente num replay do zero.
DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;

CREATE TRIGGER trg_congelar_grade_passada
  BEFORE UPDATE OR DELETE ON public.csv_grades_profissionais
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bloquear_alteracao_grade_passada();

-- ─── 3. O que a view principal esconde ──────────────────────────────────────
--
-- Projeção deliberadamente enxuta e NÃO intercambiável com vw_grade_base /
-- vw_grade_atendimentos: esta view não é "mais uma fonte da grade", é o
-- relatório de saúde dela. Quem precisa de linha de grade para calcular usa as
-- outras duas; quem precisa saber o que está faltando usa esta.
--
-- Sem o filtro de profissional de teste de propósito: se um dia uma inativação
-- indevida atingir uma linha de teste, quero que ela apareça no relatório em vez
-- de ser escondida por uma regra que existe para o cálculo, não para a auditoria.
--
-- `tem_substituta_ativa` é a coluna que dá sentido ao resto. Nem toda linha
-- inativa é perda: o versionamento normal inativa a versão antiga e insere a
-- nova com o MESMO tita_agendamento_id, e nesse caso a sessão continua na grade.
-- Medido em julho/2026: das 43 inativas, 38 eram perda de verdade e 5 tinham
-- gêmea ativa. Uma guarda que contasse as 43 bloquearia o pagamento para sempre,
-- porque aquelas 5 nunca vão deixar de existir — alarme que não some é alarme
-- que se aprende a ignorar.

-- Sem este índice o NOT EXISTS abaixo vira um seq scan de ~148 mil linhas por
-- linha inativa. Parcial (só as ativas) porque é só nelas que se procura a
-- gêmea: em produção indexa ~148 mil de 148 mil hoje, mas não cresce com o
-- histórico inativado. É o "índice de chave natural" que 20260805160000 deixou
-- explicitamente para a Fase 2.
CREATE INDEX IF NOT EXISTS idx_csv_grades_tita_id_ativo
  ON public.csv_grades_profissionais (tita_agendamento_id)
  WHERE ativo;

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
  -- Slot 'Livre' não tem id e nunca tem gêmea por id; tratamos como perda para
  -- não afirmar o que não dá para verificar. Não afeta dinheiro — quem consulta
  -- por causa de pagamento filtra status_agendamento = 'Agendado'.
  (g.tita_agendamento_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.csv_grades_profissionais a
      WHERE a.ativo AND a.tita_agendamento_id = g.tita_agendamento_id
   )) AS tem_substituta_ativa
FROM public.csv_grades_profissionais g
WHERE NOT g.ativo;

COMMENT ON VIEW public.vw_grade_inativas IS
  'Linhas que vw_grade_base esconde por ativo = false, para as telas conseguirem avisar que a grade do período está incompleta. Projeção enxuta e não intercambiável com vw_grade_base/vw_grade_atendimentos — é relatório de saúde, não fonte de cálculo. Perda real é tem_substituta_ativa = false; com true a sessão segue na grade em outra versão (versionamento normal). Medido em 2026-08-06: das 43 de julho, 38 eram perda e as 43 continuavam sendo reportadas pela TiTa, ou seja falso positivo do sync.';

GRANT SELECT ON public.vw_grade_inativas TO authenticated, service_role;

-- Mesmo motivo do REVOKE em 20260806110000: default privilege do Supabase
-- concede em toda view nova do schema public, e esta traz nome de paciente.
REVOKE ALL ON public.vw_grade_inativas FROM anon;
