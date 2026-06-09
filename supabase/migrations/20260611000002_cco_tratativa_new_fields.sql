-- CCO-010: Adicionar colunas de tratativa ausentes em cco.atendimentos
--
-- Colunas existentes (não duplicar):
--   possui_tratativa boolean         ← "possui tratativa"
--   profissional_tratativa text      ← "nome profissional tratativa"
--   data_tratativa date              ← "criação tratativa"
--
-- Colunas novas:
--   id_profissional_tratativa bigint ← "id profissional tratativa"
--   origem_tratativa text            ← "origem tratativa"

ALTER TABLE cco.atendimentos
  ADD COLUMN IF NOT EXISTS id_profissional_tratativa bigint,
  ADD COLUMN IF NOT EXISTS origem_tratativa text;

COMMENT ON COLUMN cco.atendimentos.id_profissional_tratativa IS
  'ID numérico do profissional que registrou a tratativa (TITA: "id profissional tratativa").';
COMMENT ON COLUMN cco.atendimentos.origem_tratativa IS
  'Origem da tratativa (TITA: "origem tratativa"). Ex: manual, automatica.';
