-- PRD Seção 11 (Ciclo mensal e estados): "Até dia 5: Clínica confere
-- (existência/tempestividade) e informa o Faturamento Liberado." Até aqui a
-- apuração (pep_apuracao_mensal) recalculava toda hora que algo mudava, sem
-- nenhum estado formal — esta migration acrescenta o gate "liberar/reabrir".
-- Liberado = a apuração daquela competência para aquele prestador está
-- fechada (referência para a Nota Fiscal); reabrir é uma alteração manual e
-- também fica na trilha de auditoria.

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
