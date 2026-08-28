-- Aceites da aba "Saída de Profissional" compartilhados entre a equipe.
-- Substitui o armazenamento somente-localStorage (SK_SAIDA = "aba_saida_v1").
-- Uma linha por slot afetado; chave natural = paciente|dia|hora|terapia.

CREATE TABLE IF NOT EXISTS public.saida_aceites (
  id             BIGSERIAL PRIMARY KEY,
  paciente       TEXT NOT NULL,
  dia            TEXT NOT NULL,
  hora           TEXT NOT NULL,
  terapia        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente',   -- StatusSaida (consulta/contagem server-side)
  dados          JSONB NOT NULL DEFAULT '{}',         -- StatusEntry completo (frontend)
  criado_por     UUID REFERENCES auth.users(id),
  atualizado_por UUID REFERENCES auth.users(id),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saida_aceites_chave_unique UNIQUE (paciente, dia, hora, terapia)
);

CREATE INDEX IF NOT EXISTS idx_saida_aceites_status
  ON public.saida_aceites (status);

ALTER TABLE public.saida_aceites ENABLE ROW LEVEL SECURITY;

-- Compartilhado entre a equipe (mesmo padrão de substituicoes_historico)
CREATE POLICY "saida_aceites_select" ON public.saida_aceites FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "saida_aceites_insert" ON public.saida_aceites FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "saida_aceites_update" ON public.saida_aceites FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "saida_aceites_delete" ON public.saida_aceites FOR DELETE
  USING (auth.role() = 'authenticated');

-- Realtime: a aba Acompanhamento assina mudanças feitas por outros usuários
ALTER PUBLICATION supabase_realtime ADD TABLE public.saida_aceites;
