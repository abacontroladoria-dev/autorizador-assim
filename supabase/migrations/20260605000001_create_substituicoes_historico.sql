CREATE TABLE IF NOT EXISTS public.substituicoes_historico (
  id                           BIGSERIAL PRIMARY KEY,
  data_criacao                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_responsavel          TEXT,
  sessao_id                    BIGINT,
  paciente_id                  BIGINT,
  paciente_nome                TEXT,
  unidade_nome                 TEXT,
  terapia_real                 TEXT NOT NULL,
  data_sessao                  DATE NOT NULL,
  horario_inicio               TIME,
  horario_fim                  TIME,
  profissional_original_id     BIGINT,
  profissional_original_nome   TEXT,
  profissional_substituto_id   BIGINT NOT NULL,
  profissional_substituto_nome TEXT NOT NULL,
  competencia                  TEXT NOT NULL,
  motivo                       TEXT,
  cancelada                    BOOLEAN NOT NULL DEFAULT FALSE,
  cancelada_por                TEXT,
  cancelada_em                 TIMESTAMPTZ,
  motivo_cancelamento          TEXT
);

CREATE INDEX IF NOT EXISTS idx_subst_hist_competencia
  ON public.substituicoes_historico (competencia);

CREATE INDEX IF NOT EXISTS idx_subst_hist_prof_subst_id
  ON public.substituicoes_historico (profissional_substituto_id);

CREATE INDEX IF NOT EXISTS idx_subst_hist_data_sessao
  ON public.substituicoes_historico (data_sessao);

CREATE INDEX IF NOT EXISTS idx_subst_hist_sessao_id
  ON public.substituicoes_historico (sessao_id);

ALTER TABLE public.substituicoes_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "substituicoes_historico_select"
  ON public.substituicoes_historico FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "substituicoes_historico_insert"
  ON public.substituicoes_historico FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
