-- A coluna remuneracao_contratos.contratos (jsonb) guarda uma lista de
-- contratos por profissional com vários campos misturados no mesmo blob
-- (numero, funcao, valorPA, vigente, modeloFaturamento, valorTotal). Extrai
-- cada campo para uma coluna própria numa tabela filha — 1 linha por
-- contrato, várias linhas por profissional — seguindo o mesmo padrão de
-- 20260710120000 (tabela antiga vira só backup, sem DROP nesta migration).

CREATE TABLE IF NOT EXISTS remuneracao_contratos_itens (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id        uuid        NOT NULL REFERENCES remuneracao_contratos(id) ON DELETE CASCADE,
  ordem              integer     NOT NULL DEFAULT 0,
  numero             text,
  funcao             text,
  valor_pa           numeric,
  vigente            boolean     NOT NULL DEFAULT true,
  modelo_faturamento text        NOT NULL DEFAULT 'atendimento'
                                  CHECK (modelo_faturamento IN ('atendimento', 'banco_horas')),
  valor_total        numeric,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remun_contratos_itens_contrato
  ON remuneracao_contratos_itens (contrato_id, ordem);

ALTER TABLE remuneracao_contratos_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remuneracao_contratos_itens_select" ON remuneracao_contratos_itens;
CREATE POLICY "remuneracao_contratos_itens_select" ON remuneracao_contratos_itens FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

DROP POLICY IF EXISTS "remuneracao_contratos_itens_write" ON remuneracao_contratos_itens;
CREATE POLICY "remuneracao_contratos_itens_write" ON remuneracao_contratos_itens FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

-- Backfill: cada elemento do array jsonb vira uma linha, na mesma ordem em
-- que aparecia no array (coluna "ordem" preserva isso).
INSERT INTO remuneracao_contratos_itens
  (contrato_id, ordem, numero, funcao, valor_pa, vigente, modelo_faturamento, valor_total)
SELECT
  rc.id,
  item.ord - 1,
  nullif(item.value->>'numero', ''),
  nullif(item.value->>'funcao', ''),
  (item.value->>'valorPA')::numeric,
  coalesce((item.value->>'vigente')::boolean, true),
  coalesce(nullif(item.value->>'modeloFaturamento', ''), 'atendimento'),
  (item.value->>'valorTotal')::numeric
FROM remuneracao_contratos rc
CROSS JOIN LATERAL jsonb_array_elements(rc.contratos) WITH ORDINALITY AS item(value, ord);
