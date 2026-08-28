-- Unifica remuneracao_contratos_atuais + remuneracao_contratos_antigos numa
-- única tabela remuneracao_contratos: 1 linha por profissional, uma lista
-- única de contratos (jsonb) onde cada item diz se é "atendimento" (PA por
-- sessão) ou "banco_horas" (valor total pago, valor/hora calculado em tempo
-- de execução a partir das horas agendadas na grade) e se está "vigente".
-- Um contrato antigo passa a ser só um item não-vigente na mesma lista —
-- elimina a divergência de ter o mesmo profissional cadastrado nas duas
-- telas com dados diferentes (ex.: sem CPF/CNPJ em "Antigos").
--
-- As tabelas antigas NÃO são removidas nesta migration — ficam como backup
-- até a unificação ser validada em produção. O DROP fica para uma migration
-- futura separada.

CREATE TABLE IF NOT EXISTS remuneracao_contratos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_nome  text        NOT NULL,
  documento_tipo     text,
  cpf                text,
  cnpj               text,
  contratos          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  observacoes        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remun_contratos_prof
  ON remuneracao_contratos (profissional_nome);

ALTER TABLE remuneracao_contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remuneracao_contratos_select" ON remuneracao_contratos;
CREATE POLICY "remuneracao_contratos_select" ON remuneracao_contratos FOR SELECT
  TO authenticated USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

DROP POLICY IF EXISTS "remuneracao_contratos_write" ON remuneracao_contratos;
CREATE POLICY "remuneracao_contratos_write" ON remuneracao_contratos FOR ALL
  TO authenticated
  USING (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['rp','admin','diretoria']));

-- Backfill: junta as duas tabelas por profissional_nome. Os contratos atuais
-- (jsonb) são copiados como estão; o contrato antigo (se existir) vira mais
-- um item na mesma lista, com vigente=false e modeloFaturamento="banco_horas"
-- (salario sempre representou um valor total/mês, nunca um PA por sessão).
INSERT INTO remuneracao_contratos
  (profissional_nome, documento_tipo, cpf, cnpj, contratos, observacoes)
SELECT
  coalesce(a.profissional_nome, ag.profissional_nome) AS profissional_nome,
  a.documento_tipo,
  a.cpf,
  a.cnpj,
  coalesce(a.contratos_atuais, '[]'::jsonb)
    || CASE
         WHEN ag.profissional_nome IS NOT NULL THEN
           jsonb_build_array(jsonb_build_object(
             'numero', coalesce(ag.contrato, ''),
             'funcao', '',
             'modeloFaturamento', 'banco_horas',
             'valorTotal', ag.salario,
             'vigente', false
           ))
         ELSE '[]'::jsonb
       END AS contratos,
  a.observacoes
FROM remuneracao_contratos_atuais a
FULL OUTER JOIN remuneracao_contratos_antigos ag
  ON ag.profissional_nome = a.profissional_nome
ON CONFLICT (profissional_nome) DO NOTHING;
