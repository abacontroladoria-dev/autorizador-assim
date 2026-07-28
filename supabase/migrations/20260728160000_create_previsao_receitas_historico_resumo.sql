-- Complemento da Etapa 4: tabela-resumo (1 linha por competência), pra
-- alimentar uma visão de índice mensal ("Histórico de Receitas") sem precisar
-- agregar previsao_receitas_historico (por sessão) toda vez que a tela abrir.
--
-- status:
--   'parcial' — atualizado todo dia pelo snapshot do mês CORRENTE (ainda em
--               andamento, número pode mudar até o mês fechar).
--   'fechado' — gravado pelo job de fechamento (dia 5 do mês seguinte),
--               depois de dar tempo de faltas atrasadas serem registradas.
--               Esse é o número "final" que a UI deve considerar confiável.
--
-- Uma competência sem NENHUMA linha aqui (nem parcial) significa que não há
-- dado suficiente pra esse mês (ex.: antes da implantação do histórico, ou
-- csv_grades_profissionais sem sincronização pra esse período).

CREATE TABLE IF NOT EXISTS public.previsao_receitas_historico_resumo (
  competencia         TEXT PRIMARY KEY,
  status              TEXT NOT NULL CHECK (status IN ('parcial', 'fechado')),
  snapshot_data       DATE NOT NULL,
  sessoes_mes         INTEGER NOT NULL DEFAULT 0,
  faltas_mes          INTEGER NOT NULL DEFAULT 0,
  pacientes_unicos    INTEGER NOT NULL DEFAULT 0,
  receita_sem_deducao NUMERIC(12,2) NOT NULL DEFAULT 0,
  deducao_falta       NUMERIC(12,2) NOT NULL DEFAULT 0,
  receita_com_deducao NUMERIC(12,2) NOT NULL DEFAULT 0,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.previsao_receitas_historico_resumo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "previsao_receitas_historico_resumo_select"
  ON public.previsao_receitas_historico_resumo FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "previsao_receitas_historico_resumo_upsert_insert"
  ON public.previsao_receitas_historico_resumo FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "previsao_receitas_historico_resumo_upsert_update"
  ON public.previsao_receitas_historico_resumo FOR UPDATE
  USING (auth.role() = 'service_role');
