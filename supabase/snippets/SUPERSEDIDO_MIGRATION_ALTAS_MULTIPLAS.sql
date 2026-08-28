-- =============================================================================
-- MIGRATION: Múltiplas Altas por Paciente
-- Data: 2026-08-26
-- =============================================================================

-- 1. Cria a nova tabela 1:N para Altas
CREATE TABLE IF NOT EXISTS paciente_altas (
  id                 bigserial   PRIMARY KEY,
  paciente_id        int8        NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
  data_alta          date        NOT NULL,
  especialidade_alta text        NOT NULL,
  arquivo_alta_path  text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

-- 2. Trigger de atualização
DROP TRIGGER IF EXISTS trg_paciente_altas_atualizado_em ON paciente_altas;
CREATE TRIGGER trg_paciente_altas_atualizado_em
  BEFORE UPDATE ON paciente_altas
  FOR EACH ROW
  EXECUTE FUNCTION set_atualizado_em();

-- 3. RLS
ALTER TABLE paciente_altas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "paciente_altas_select" ON paciente_altas;
CREATE POLICY "paciente_altas_select" ON paciente_altas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "paciente_altas_insert" ON paciente_altas;
CREATE POLICY "paciente_altas_insert" ON paciente_altas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_altas_update" ON paciente_altas;
CREATE POLICY "paciente_altas_update" ON paciente_altas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "paciente_altas_delete" ON paciente_altas;
CREATE POLICY "paciente_altas_delete" ON paciente_altas FOR DELETE TO authenticated USING (true);

-- 4. Índice
CREATE INDEX IF NOT EXISTS paciente_altas_paciente_id_idx ON paciente_altas(paciente_id);

-- 5. Remove as colunas de alta da tabela de individualidades
ALTER TABLE paciente_altas_individualidades 
  DROP COLUMN IF EXISTS data_alta,
  DROP COLUMN IF EXISTS especialidade_alta,
  DROP COLUMN IF EXISTS arquivo_alta_path;
