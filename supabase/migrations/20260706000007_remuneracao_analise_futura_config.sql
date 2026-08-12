-- Passo 4 (Análise Futura) precisa de 2 inputs que faltaram no schema do Passo 2:
-- presença de projeção (global) e limite de CC por profissional (override).
ALTER TABLE remuneracao_config
  ADD COLUMN IF NOT EXISTS presenca_padrao numeric NOT NULL DEFAULT 80;

ALTER TABLE remuneracao_capacidades
  ADD COLUMN IF NOT EXISTS limite_cc numeric;
