-- PRD Seção 11.4: "Toda alteração manual exige motivo e fica em trilha de
-- auditoria (usuário, competência, antes/depois). O timestamp da trilha é do
-- ato administrativo da clínica, nunca da atividade do prestador."
--
-- Uma linha por ação (criar/editar/excluir) sobre pep_registros_entrega ou
-- pep_planejamento_semestral — histórico completo e imutável (sem UPDATE
-- nem DELETE nesta tabela, só INSERT).

CREATE TABLE IF NOT EXISTS pep_trilha_auditoria (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela          text        NOT NULL CHECK (tabela IN ('registro_entrega', 'planejamento_semestral')),
  registro_id     uuid        NOT NULL,
  acao            text        NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir')),
  prestador_nome  text        NOT NULL,
  paciente_nome   text,
  competencia     text,
  antes           jsonb,
  depois          jsonb,
  motivo          text,
  usuario_id      uuid        REFERENCES public.usuarios(id),
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pep_trilha_registro
  ON pep_trilha_auditoria (tabela, registro_id);

CREATE INDEX IF NOT EXISTS idx_pep_trilha_prestador_competencia
  ON pep_trilha_auditoria (prestador_nome, competencia);

ALTER TABLE pep_trilha_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pep_trilha_auditoria_select"
  ON pep_trilha_auditoria FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

-- Só INSERT — a trilha não pode ser editada nem apagada por ninguém,
-- inclusive admin, senão deixa de ser trilha de auditoria confiável.
CREATE POLICY "pep_trilha_auditoria_insert"
  ON pep_trilha_auditoria FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );
