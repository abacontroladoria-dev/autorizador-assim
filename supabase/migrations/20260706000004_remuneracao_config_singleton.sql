-- Garante que remuneracao_config nunca tenha mais de 1 linha.
-- Truque de constraint: coluna boolean NOT NULL DEFAULT true + UNIQUE só admite
-- uma linha com singleton = true (boolean só tem 2 valores possíveis).
ALTER TABLE remuneracao_config
  ADD COLUMN IF NOT EXISTS singleton boolean NOT NULL DEFAULT true;

ALTER TABLE remuneracao_config
  ADD CONSTRAINT remuneracao_config_singleton_key UNIQUE (singleton);
