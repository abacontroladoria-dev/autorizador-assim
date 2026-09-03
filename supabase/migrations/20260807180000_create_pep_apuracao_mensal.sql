-- Apuração mensal da PEP por paciente/competência (Fase 3c do projeto
-- "reestruturacao-entregas-analista-comportamento"). Guarda o resultado do
-- motor de cálculo (frontend/lib/remuneracao/calculoPEP.ts) para permitir:
--   - saldo remanescente carregado de uma competência para a seguinte (9.10);
--   - devolução retroativa quando um semestral pendente é aceito (9.6) —
--     cada linha de ajuste semestral marca "devolvido" quando já creditada;
--   - auditoria/relatório sem recalcular tudo a cada carregamento de tela.
--
-- Não é uma tabela de configuração (como pep_catalogo_itens) nem de registro
-- bruto (pep_registros_entrega) — é o resultado apurado, uma linha por
-- paciente/competência.

CREATE TABLE IF NOT EXISTS pep_apuracao_mensal (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_nome                 text        NOT NULL,
  paciente_cpf                  text,
  prestador_nome                text        NOT NULL,
  competencia                   text        NOT NULL, -- 'YYYY-MM'
  valor_bruto                   numeric     NOT NULL,
  ajuste_recorrentes            jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{itemCodigo, percentual, valor}]
  ajuste_semestrais             jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{itemCodigo, percentual, valor, devolvido}]
  ajuste_recorrentes_valor      numeric     NOT NULL DEFAULT 0,
  ajuste_semestrais_valor       numeric     NOT NULL DEFAULT 0,
  saldo_remanescente_anterior   numeric     NOT NULL DEFAULT 0,
  devolucao_valor               numeric     NOT NULL DEFAULT 0,
  valor_liquido                 numeric     NOT NULL DEFAULT 0,
  saldo_remanescente_novo       numeric     NOT NULL DEFAULT 0,
  modo_teste                    boolean     NOT NULL DEFAULT false,
  calculado_em                  timestamptz NOT NULL DEFAULT now(),
  calculado_por                 uuid        REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_apuracao_paciente_competencia
  ON pep_apuracao_mensal (paciente_nome, competencia);

CREATE INDEX IF NOT EXISTS idx_pep_apuracao_prestador_competencia
  ON pep_apuracao_mensal (prestador_nome, competencia);

ALTER TABLE pep_apuracao_mensal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pep_apuracao_mensal_select" ON pep_apuracao_mensal;
CREATE POLICY "pep_apuracao_mensal_select"
  ON pep_apuracao_mensal FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

DROP POLICY IF EXISTS "pep_apuracao_mensal_write" ON pep_apuracao_mensal;
CREATE POLICY "pep_apuracao_mensal_write"
  ON pep_apuracao_mensal FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );
