-- PRD Seção 9.7: relatório técnico de reprogramação por impedimento
-- terapêutico (REP-). Aceito o documento (com motivos e justificativas
-- técnicas), a reprogramação suspende o ajuste enquanto vigente — o que já
-- acontece estruturalmente quando o planejamento é movido para uma
-- competência futura (o item deixa de contar como pendência até lá). Falta
-- só registrar o motivo e a referência do próprio documento REP- (Seção
-- 2.3 — toda entrega, inclusive esta, precisa de evidência).

ALTER TABLE pep_planejamento_semestral
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS evidencias jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pep_planejamento_semestral.motivo IS
  'Motivos e justificativas técnicas do documento (obrigatório quando origem = reprogramacao_impedimento — PRD Seção 9.7).';
COMMENT ON COLUMN pep_planejamento_semestral.evidencias IS
  'Referência ao próprio relatório de reprogramação (REP-SIGLA-PACIENTE-MMAAAA) quando origem = reprogramacao_impedimento.';
