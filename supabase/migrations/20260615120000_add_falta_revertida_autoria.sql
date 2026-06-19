ALTER TABLE fila_autorizacoes
  ADD COLUMN IF NOT EXISTS falta_revertida_por_nome text,
  ADD COLUMN IF NOT EXISTS falta_revertida_em timestamptz;
