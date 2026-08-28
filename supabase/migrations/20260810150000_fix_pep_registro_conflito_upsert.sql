-- BUG: os dois índices únicos de pep_registros_entrega (por-paciente e
-- geral) são PARCIAIS ("WHERE paciente_nome IS NOT NULL" / "IS NULL"). O
-- upsert(...).onConflict(...) do Supabase gera "ON CONFLICT (colunas)" sem
-- cláusula WHERE — e o Postgres só infere um índice a partir do conflict
-- target quando ele NÃO é parcial (ou quando o WHERE do ON CONFLICT casa
-- exatamente com o predicado do índice, o que o cliente Supabase não
-- suporta especificar). Resultado: TODO upsert em pep_registros_entrega
-- falhava com "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" — reportado ao marcar quantidade entregue do TAP.
--
-- Fix: substitui os dois índices parciais por UMA coluna gerada que unifica
-- a chave de conflito (paciente_nome quando existe; senão um sentinel por
-- prestador para itens GERAL) e UM índice único NÃO parcial sobre ela — que
-- o Postgres consegue inferir de um ON CONFLICT simples.

ALTER TABLE pep_registros_entrega
  ADD COLUMN IF NOT EXISTS chave_conflito text
    GENERATED ALWAYS AS (COALESCE(paciente_nome, '§GERAL§:' || prestador_nome)) STORED;

DROP INDEX IF EXISTS idx_pep_registro_por_paciente_unico;
DROP INDEX IF EXISTS idx_pep_registro_geral_unico;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_registro_conflito_unico
  ON pep_registros_entrega (chave_conflito, item_id, competencia);

COMMENT ON COLUMN pep_registros_entrega.chave_conflito IS
  'Coluna gerada só para permitir upsert por ON CONFLICT — nunca lida pela aplicação. Item por paciente: o próprio paciente_nome. Item GERAL (sem paciente): sentinel + prestador_nome, para não colidir entre prestadores diferentes.';
