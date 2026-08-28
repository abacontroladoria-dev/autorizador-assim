-- Adiciona paciente_nome e convenio_nome ao final da tabela grade_profissionais_tita
-- para suportar leitura direta da grade sem upload de CSV no cronograma.

ALTER TABLE grade_profissionais_tita
  ADD COLUMN IF NOT EXISTS paciente_nome text,
  ADD COLUMN IF NOT EXISTS convenio_nome text;
