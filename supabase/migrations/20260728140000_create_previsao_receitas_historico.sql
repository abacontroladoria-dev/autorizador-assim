-- Etapa 4 da evolução da Previsão de Receitas: histórico com snapshot diário.
-- Granularidade por SESSÃO (não agregada por convênio) — precisa reconstruir o
-- mesmo drilldown Convênio → Paciente → Sessão no modo histórico da tela, com
-- o mesmo detalhe que a aba "Por paciente" já mostra ao vivo (ver
-- calcularSessoesMensaisPorConvenio em frontend/lib/cronograma/faturamentoProjecao.ts).
-- Populada pela Edge Function snapshot-previsao-receitas, agendada às 05h10
-- (alguns minutos depois de sync-grade-csv-daily, pra garantir que a grade do
-- dia já foi sincronizada antes do retrato).

CREATE TABLE IF NOT EXISTS public.previsao_receitas_historico (
  id                  BIGSERIAL PRIMARY KEY,
  -- Dia em que o snapshot foi tirado (não a data da sessão) — permite ver a
  -- evolução dia a dia dentro do mês, não só o fechamento.
  snapshot_data       DATE NOT NULL,
  -- "2026-07" — mês/ano projetado, pro filtro "histórico de julho".
  competencia         TEXT NOT NULL,
  segmento            TEXT NOT NULL CHECK (segmento IN ('multidisciplinar', 'processo_diagnostico')),
  convenio_nome       TEXT NOT NULL,
  tita_agendamento_id BIGINT,
  paciente_id         BIGINT,
  paciente_nome       TEXT NOT NULL,
  terapia_id          BIGINT,
  terapia_nome        TEXT NOT NULL,
  data_sessao         DATE NOT NULL,
  hora_inicial        TIME,
  valor               NUMERIC(10,2),
  origem_valor        TEXT NOT NULL,
  em_falta            BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prh_competencia_segmento
  ON public.previsao_receitas_historico (competencia, segmento);

CREATE INDEX IF NOT EXISTS idx_prh_snapshot_data
  ON public.previsao_receitas_historico (snapshot_data);

CREATE INDEX IF NOT EXISTS idx_prh_convenio
  ON public.previsao_receitas_historico (convenio_nome);

CREATE INDEX IF NOT EXISTS idx_prh_agendamento_id
  ON public.previsao_receitas_historico (tita_agendamento_id);

ALTER TABLE public.previsao_receitas_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "previsao_receitas_historico_select"
  ON public.previsao_receitas_historico FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

-- Só a Edge Function grava (via service_role) — isso é gerado automaticamente
-- pelo job diário, não por ação de usuário via formulário.
CREATE POLICY "previsao_receitas_historico_insert"
  ON public.previsao_receitas_historico FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
