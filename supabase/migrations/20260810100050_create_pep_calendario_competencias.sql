-- Calendário parametrizado (PRD Seção 9.11/13.8): a clínica publica, por
-- competência, se é um "mês de recesso" (menos de 4 semanas) — nesse caso
-- Supervisão e Estudo esperam 3 unidades em vez de 4, e o peso unitário passa
-- a 10% (30% ÷ 3). Fora isso, o valor da competência permanece 100% —
-- calculoPEP.ts já faz essa conta sozinho a partir de quantidade_esperada,
-- então esta tabela só precisa guardar o número de semanas por competência.
--
-- Sem tela de calendário ainda para os outros itens (TAP/Parental não são
-- afetados pelo calendário — Seção 7.2) nem para pendências (o padrão é
-- sempre 4 semanas quando a competência não está aqui).

CREATE TABLE IF NOT EXISTS pep_calendario_competencias (
  competencia                    text        PRIMARY KEY, -- 'YYYY-MM'
  semanas_supervisao_estudo      integer     NOT NULL DEFAULT 4
                                    CHECK (semanas_supervisao_estudo IN (3, 4, 5)),
  observacao                     text,
  atualizado_por                 uuid        REFERENCES public.usuarios(id),
  atualizado_em                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pep_calendario_competencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pep_calendario_competencias_select"
  ON pep_calendario_competencias FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_calendario_competencias_write"
  ON pep_calendario_competencias FOR ALL
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
