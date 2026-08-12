-- Um item recorrente pode ter mais de uma unidade esperada no mês (ex.:
-- Treinamento de Aplicadores = 2, quinzenal; Supervisão/Estudo = 4,
-- semanal — PRD Seção 7.1/13.6, que inclusive prevê nomenclatura sequencial
-- por unidade: TAP-01-PACIENTE-MMAAAA, TAP-02-PACIENTE-MMAAAA). Um único
-- campo de evidência por registro não suporta isso. Troca evidencia_caminho/
-- evidencia_nome por uma lista.
--
-- Nenhum dado real foi registrado ainda nessas colunas (feature recém-
-- construída), então a migração é uma troca direta, sem necessidade de
-- backfill.

ALTER TABLE pep_registros_entrega
  ADD COLUMN IF NOT EXISTS evidencias jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE pep_registros_entrega
  DROP COLUMN IF EXISTS evidencia_caminho,
  DROP COLUMN IF EXISTS evidencia_nome;

COMMENT ON COLUMN pep_registros_entrega.evidencias IS
  'Lista de referências à evidência (uma por unidade entregue): [{"caminho": "...", "nome": "..."}]. Nunca um upload — PRD Seção 6/12.3.';
