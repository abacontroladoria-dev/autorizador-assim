-- =============================================================================
-- MIGRATION: Laudos e Altas de Pacientes
-- Projeto: sistema-pulsar (Next.js + Supabase)
-- Data: 2026-08-26
-- Executar manualmente no painel SQL do Supabase
-- =============================================================================

-- PRE-REQUISITO: as tabelas 'pacientes' e 'cadastros_auditoria' devem existir
-- antes de executar este script.

-- =============================================================================
-- 1. TABELA paciente_laudos
--    Armazena os laudos medicos por paciente.
--    - situacao: coluna gerada automaticamente (Vigente / Vencido) com base na
--      validade ou em data_laudo + 6 meses quando validade e NULL.
--    - alta / data_alta / especialidade_alta: controle de alta do paciente.
--    - arquivo_path: caminho do arquivo no Supabase Storage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS paciente_laudos (
  id               bigserial   PRIMARY KEY,
  paciente_id      int8        NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
  data_laudo       date        NOT NULL,
  validade         date,
  autorizado_em    date,
  comp_agressivo   boolean,
  paciente_verbal  boolean,
  ambiente_natural boolean,
  nivel_suporte    text        CHECK (nivel_suporte IN ('1','2','3','NA')),
  alta             boolean     NOT NULL DEFAULT false,
  data_alta        date,
  especialidade_alta text,
  arquivo_path     text,
  observacoes      text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. TABELA paciente_laudo_especialidades
-- =============================================================================

CREATE TABLE IF NOT EXISTS paciente_laudo_especialidades (
  id               bigserial   PRIMARY KEY,
  laudo_id         int8        NOT NULL REFERENCES paciente_laudos(id) ON DELETE CASCADE,
  especialidade    text        NOT NULL,
  qt_laudo         int4,
  qt_autorizacao   int4,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. TABELA paciente_altas_individualidades
-- =============================================================================

CREATE TABLE IF NOT EXISTS paciente_altas_individualidades (
  id               bigserial   PRIMARY KEY,
  paciente_id      int8        NOT NULL UNIQUE REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
  comp_agressivo   boolean,
  paciente_verbal  boolean,
  ambiente_natural boolean,
  nivel_suporte    text        CHECK (nivel_suporte IN ('1','2','3','NA')),
  data_alta        date,
  especialidade_alta text,
  arquivo_alta_path text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. TRIGGER: atualizado_em
-- =============================================================================

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paciente_laudos_atualizado_em ON paciente_laudos;
CREATE TRIGGER trg_paciente_laudos_atualizado_em
  BEFORE UPDATE ON paciente_laudos
  FOR EACH ROW
  EXECUTE FUNCTION set_atualizado_em();

DROP TRIGGER IF EXISTS trg_paciente_altas_atualizado_em ON paciente_altas_individualidades;
CREATE TRIGGER trg_paciente_altas_atualizado_em
  BEFORE UPDATE ON paciente_altas_individualidades
  FOR EACH ROW
  EXECUTE FUNCTION set_atualizado_em();

-- =============================================================================
-- 5. VIEW vw_paciente_laudos_flat
-- =============================================================================

CREATE OR REPLACE VIEW vw_paciente_laudos_flat AS
SELECT
  pl.id               AS id_laudo,
  pl.paciente_id      AS id_paciente,
  p.nome              AS nome_paciente,
  pl.data_laudo,
  COALESCE(pl.validade, (pl.data_laudo + interval '6 months')::date) AS validade,
  CASE
    WHEN COALESCE(pl.validade, (pl.data_laudo + interval '6 months')::date) >= CURRENT_DATE
      THEN 'Vigente'
    ELSE 'Vencido'
  END AS situacao,
  pl.autorizado_em,
  pl.comp_agressivo,
  pl.paciente_verbal,
  pl.ambiente_natural,
  pl.nivel_suporte,
  ple.especialidade,
  ple.qt_laudo,
  ple.qt_autorizacao,
  pl.alta,
  pl.data_alta
FROM paciente_laudos pl
JOIN pacientes p
  ON p.id_paciente = pl.paciente_id
LEFT JOIN paciente_laudo_especialidades ple
  ON ple.laudo_id = pl.id;

-- =============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE paciente_laudos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paciente_laudos_select" ON paciente_laudos;
CREATE POLICY "paciente_laudos_select"
  ON paciente_laudos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "paciente_laudos_insert" ON paciente_laudos;
CREATE POLICY "paciente_laudos_insert"
  ON paciente_laudos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_laudos_update" ON paciente_laudos;
CREATE POLICY "paciente_laudos_update"
  ON paciente_laudos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_laudos_delete" ON paciente_laudos;
CREATE POLICY "paciente_laudos_delete"
  ON paciente_laudos FOR DELETE TO authenticated USING (true);

ALTER TABLE paciente_laudo_especialidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paciente_laudo_esp_select" ON paciente_laudo_especialidades;
CREATE POLICY "paciente_laudo_esp_select"
  ON paciente_laudo_especialidades FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "paciente_laudo_esp_insert" ON paciente_laudo_especialidades;
CREATE POLICY "paciente_laudo_esp_insert"
  ON paciente_laudo_especialidades FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_laudo_esp_update" ON paciente_laudo_especialidades;
CREATE POLICY "paciente_laudo_esp_update"
  ON paciente_laudo_especialidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_laudo_esp_delete" ON paciente_laudo_especialidades;
CREATE POLICY "paciente_laudo_esp_delete"
  ON paciente_laudo_especialidades FOR DELETE TO authenticated USING (true);

ALTER TABLE paciente_altas_individualidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paciente_altas_select" ON paciente_altas_individualidades;
CREATE POLICY "paciente_altas_select"
  ON paciente_altas_individualidades FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "paciente_altas_insert" ON paciente_altas_individualidades;
CREATE POLICY "paciente_altas_insert"
  ON paciente_altas_individualidades FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_altas_update" ON paciente_altas_individualidades;
CREATE POLICY "paciente_altas_update"
  ON paciente_altas_individualidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_altas_delete" ON paciente_altas_individualidades;
CREATE POLICY "paciente_altas_delete"
  ON paciente_altas_individualidades FOR DELETE TO authenticated USING (true);

-- =============================================================================
-- 7. INDICES DE PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS paciente_laudos_paciente_id_idx
  ON paciente_laudos(paciente_id);

CREATE INDEX IF NOT EXISTS paciente_laudo_esp_laudo_id_idx
  ON paciente_laudo_especialidades(laudo_id);

-- =============================================================================
-- INSTRUCOES:
-- 1. Execute este script no painel SQL do Supabase
-- 2. Verifique que as tabelas 'pacientes' e 'cadastros_auditoria' existem antes
-- 3. Para o Storage: crie manualmente o bucket 'laudos-pacientes' com acesso
--    publico para leitura
-- =============================================================================
