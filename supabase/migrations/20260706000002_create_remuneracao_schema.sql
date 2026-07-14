-- Schema da feature "Relacionamento Prestador" (migração de calculadora-remuneracao).
-- 5 tabelas: config (defaults não sensíveis, semeados aqui) + contratos (PII, criadas
-- vazias, importadas via app) + capacidades + histórico.
-- RLS restrita a rp/admin/diretoria — mesmos roles com acesso à rota (routes.ts).

-- ===== remuneracao_config =====
-- Linha única de configuração (taxas PA, diárias, bônus ETA, limites, feriados).
CREATE TABLE IF NOT EXISTS remuneracao_config (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  taxas_pa           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  diarias            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  cc_pa_default      numeric     NOT NULL DEFAULT 35.00,
  cc_pe_default      numeric     NOT NULL DEFAULT 133.34,
  cc_lim_default     numeric     NOT NULL DEFAULT 18,
  eta_bonus_default  numeric     NOT NULL DEFAULT 500,
  dow_pt             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  feriados           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid        REFERENCES public.usuarios(id)
);

-- ===== remuneracao_contratos_antigos (PII — criada vazia) =====
CREATE TABLE IF NOT EXISTS remuneracao_contratos_antigos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_nome  text        NOT NULL,
  salario            numeric     NOT NULL DEFAULT 0,
  ch_semanal         numeric     NOT NULL DEFAULT 0,
  contrato           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remun_contratos_antigos_prof
  ON remuneracao_contratos_antigos (profissional_nome);

-- ===== remuneracao_contratos_atuais (PII — criada vazia) =====
CREATE TABLE IF NOT EXISTS remuneracao_contratos_atuais (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_nome  text        NOT NULL,
  documento_tipo     text,
  cpf                text,
  cnpj               text,
  contratos_atuais   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  observacoes        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remun_contratos_atuais_prof
  ON remuneracao_contratos_atuais (profissional_nome);

-- ===== remuneracao_capacidades =====
-- Overrides de capacidade por profissional/dia (não é PII).
CREATE TABLE IF NOT EXISTS remuneracao_capacidades (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_nome  text        NOT NULL,
  dias               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  padrao             numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remun_capacidades_prof
  ON remuneracao_capacidades (profissional_nome);

-- ===== remuneracao_historico =====
-- Snapshots mensais (Aba Histórico).
CREATE TABLE IF NOT EXISTS remuneracao_historico (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ano            text        NOT NULL,
  profissional_nome  text,
  dados              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid        REFERENCES public.usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_remun_historico_mes
  ON remuneracao_historico (mes_ano);

-- ===== RLS =====
ALTER TABLE remuneracao_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE remuneracao_contratos_antigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE remuneracao_contratos_atuais  ENABLE ROW LEVEL SECURITY;
ALTER TABLE remuneracao_capacidades       ENABLE ROW LEVEL SECURITY;
ALTER TABLE remuneracao_historico         ENABLE ROW LEVEL SECURITY;

-- remuneracao_config: leitura para rp/admin/diretoria; escrita para rp/admin.
CREATE POLICY "remuneracao_config_select"
  ON remuneracao_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "remuneracao_config_write"
  ON remuneracao_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- remuneracao_contratos_antigos: leitura e escrita restritas a rp/admin (PII).
CREATE POLICY "remuneracao_contratos_antigos_select"
  ON remuneracao_contratos_antigos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

CREATE POLICY "remuneracao_contratos_antigos_write"
  ON remuneracao_contratos_antigos FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- remuneracao_contratos_atuais: leitura e escrita restritas a rp/admin (PII).
CREATE POLICY "remuneracao_contratos_atuais_select"
  ON remuneracao_contratos_atuais FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

CREATE POLICY "remuneracao_contratos_atuais_write"
  ON remuneracao_contratos_atuais FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- remuneracao_capacidades: leitura rp/admin/diretoria; escrita rp/admin.
CREATE POLICY "remuneracao_capacidades_select"
  ON remuneracao_capacidades FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "remuneracao_capacidades_write"
  ON remuneracao_capacidades FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- remuneracao_historico: leitura rp/admin/diretoria; escrita rp/admin.
CREATE POLICY "remuneracao_historico_select"
  ON remuneracao_historico FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "remuneracao_historico_write"
  ON remuneracao_historico FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );
