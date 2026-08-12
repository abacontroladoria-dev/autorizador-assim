-- =====================================================================
-- SQL CONSOLIDADO — migrations pendentes de aplicar (2026-08-10)
-- Aplicar no SQL Editor do Supabase, nesta ordem, de uma vez só.
-- Corresponde aos arquivos:
--   20260810100000_create_pep_calendario_competencias.sql
--   20260810110000_pep_reprogramacao_impedimento.sql
--   20260810120000_add_valor_pep_mensal_contratos_itens.sql
--   20260810130000_create_pep_trilha_auditoria.sql
--   20260810140000_pep_faturamento_liberado.sql
--   20260810150000_fix_pep_registro_conflito_upsert.sql  ← IMPORTANTE,
--     corrige o erro "Não foi possível salvar a quantidade entregue" ao
--     marcar itens por-paciente (TAP, Treinamento Parental, semestrais).
--   20260810160000_pep_trilha_auditoria_usuario_nome.sql  ← adiciona o nome
--     do usuário na trilha (antes só tinha usuario_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 20260810100000_create_pep_calendario_competencias.sql
-- Calendário parametrizado (PRD Seção 9.11/13.8)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pep_calendario_competencias (
  competencia                    text        PRIMARY KEY, -- 'YYYY-MM'
  semanas_supervisao_estudo      integer     NOT NULL DEFAULT 4
                                    CHECK (semanas_supervisao_estudo IN (3, 4, 5)),
  observacao                     text,
  atualizado_por                 uuid        REFERENCES public.usuarios(id),
  atualizado_em                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pep_calendario_competencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pep_calendario_competencias_select"
  ON pep_calendario_competencias FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_calendario_competencias_write"
  ON pep_calendario_competencias FOR ALL
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

-- ---------------------------------------------------------------------
-- 2) 20260810110000_pep_reprogramacao_impedimento.sql
-- REP- reprogramação por impedimento terapêutico (PRD Seção 9.7)
-- ---------------------------------------------------------------------

ALTER TABLE pep_planejamento_semestral
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS evidencias jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pep_planejamento_semestral.motivo IS
  'Motivos e justificativas técnicas do documento (obrigatório quando origem = reprogramacao_impedimento — PRD Seção 9.7).';
COMMENT ON COLUMN pep_planejamento_semestral.evidencias IS
  'Referência ao próprio relatório de reprogramação (REP-SIGLA-PACIENTE-MMAAAA) quando origem = reprogramacao_impedimento.';

-- ---------------------------------------------------------------------
-- 3) 20260810120000_add_valor_pep_mensal_contratos_itens.sql
-- Valor mensal PEP por paciente (contrato) — PRD Seção 6/13.3
-- ---------------------------------------------------------------------

ALTER TABLE remuneracao_contratos_itens
  ADD COLUMN IF NOT EXISTS valor_pep_mensal numeric;

COMMENT ON COLUMN remuneracao_contratos_itens.valor_pep_mensal IS
  'Valor mensal da PEP por paciente (V), só para contrato de Analista do Comportamento. NULL = usa remuneracao_config.cc_pe_default.';

-- ---------------------------------------------------------------------
-- 4) 20260810130000_create_pep_trilha_auditoria.sql
-- Trilha de auditoria (PRD Seção 11.4)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pep_trilha_auditoria (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela          text        NOT NULL CHECK (tabela IN ('registro_entrega', 'planejamento_semestral')),
  registro_id     uuid        NOT NULL,
  acao            text        NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir')),
  prestador_nome  text        NOT NULL,
  paciente_nome   text,
  competencia     text,
  antes           jsonb,
  depois          jsonb,
  motivo          text,
  usuario_id      uuid        REFERENCES public.usuarios(id),
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pep_trilha_registro
  ON pep_trilha_auditoria (tabela, registro_id);

CREATE INDEX IF NOT EXISTS idx_pep_trilha_prestador_competencia
  ON pep_trilha_auditoria (prestador_nome, competencia);

ALTER TABLE pep_trilha_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pep_trilha_auditoria_select"
  ON pep_trilha_auditoria FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

-- Só INSERT — a trilha não pode ser editada nem apagada por ninguém,
-- inclusive admin, senão deixa de ser trilha de auditoria confiável.
CREATE POLICY "pep_trilha_auditoria_insert"
  ON pep_trilha_auditoria FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- ---------------------------------------------------------------------
-- 5) 20260810140000_pep_faturamento_liberado.sql
-- Estado "Faturamento Liberado" (PRD Seção 11)
-- ---------------------------------------------------------------------

ALTER TABLE pep_apuracao_mensal
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'apurado'
    CHECK (estado IN ('apurado', 'liberado')),
  ADD COLUMN IF NOT EXISTS liberado_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES public.usuarios(id);

-- A trilha de auditoria (Seção 11.4) agora também cobre a apuração mensal
-- (ação "liberar"/"reabrir" fica registrada como 'editar').
ALTER TABLE pep_trilha_auditoria DROP CONSTRAINT IF EXISTS pep_trilha_auditoria_tabela_check;
ALTER TABLE pep_trilha_auditoria ADD CONSTRAINT pep_trilha_auditoria_tabela_check
  CHECK (tabela IN ('registro_entrega', 'planejamento_semestral', 'apuracao_mensal'));

-- ---------------------------------------------------------------------
-- 6) 20260810150000_fix_pep_registro_conflito_upsert.sql
-- BUGFIX: upsert de pep_registros_entrega falhava por causa de índices
-- únicos parciais (ver comentário no arquivo original da migration).
-- ---------------------------------------------------------------------

ALTER TABLE pep_registros_entrega
  ADD COLUMN IF NOT EXISTS chave_conflito text
    GENERATED ALWAYS AS (COALESCE(paciente_nome, '§GERAL§:' || prestador_nome)) STORED;

DROP INDEX IF EXISTS idx_pep_registro_por_paciente_unico;
DROP INDEX IF EXISTS idx_pep_registro_geral_unico;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_registro_conflito_unico
  ON pep_registros_entrega (chave_conflito, item_id, competencia);

COMMENT ON COLUMN pep_registros_entrega.chave_conflito IS
  'Coluna gerada só para permitir upsert por ON CONFLICT — nunca lida pela aplicação. Item por paciente: o próprio paciente_nome. Item GERAL (sem paciente): sentinel + prestador_nome, para não colidir entre prestadores diferentes.';

-- ---------------------------------------------------------------------
-- 7) 20260810160000_pep_trilha_auditoria_usuario_nome.sql
-- BUGFIX: faltava o nome do usuário na trilha (só tinha usuario_id).
-- ---------------------------------------------------------------------

ALTER TABLE pep_trilha_auditoria
  ADD COLUMN IF NOT EXISTS usuario_nome text;

COMMENT ON COLUMN pep_trilha_auditoria.usuario_nome IS
  'Nome do usuário no momento da ação, denormalizado de usuarios.nome — não é uma referência viva.';
