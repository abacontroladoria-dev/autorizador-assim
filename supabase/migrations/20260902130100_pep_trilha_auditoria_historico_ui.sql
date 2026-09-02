-- Dá tela pra pep_trilha_auditoria (criada em 20260810130000): até aqui a
-- trilha era gravada mas nunca lida — getTrilhaAuditoria() existia e nunca
-- foi chamada. Ajustes necessários pro modal de Histórico (PepHistoricoModal):
--
--   1. `resumo` — mesma ideia de cadastros_auditoria/cronograma_salas_auditoria:
--      uma linha pronta, calculada no frontend na hora do insert.
--   2. `criado_em_brasilia` — mesmo trigger de cronograma_recusas_auditoria,
--      formata o timestamp em horário de Brasília pra exibição direta.
--   3. `prestador_nome` passa a aceitar NULL e `registro_id` vira text — a
--      trilha agora também cobre `calendario_competencia` (config. de
--      "Semanas no mês" por competência, sem prestador e cuja chave
--      primária, `pep_calendario_competencias.competencia`, não é uuid).
--
-- Não mexe nas policies de SELECT/INSERT: quem já acessa a tela PEP
-- (role IN ('rp','admin','diretoria') pra leitura) já pode ver o histórico.

ALTER TABLE pep_trilha_auditoria
  ADD COLUMN IF NOT EXISTS resumo text,
  ADD COLUMN IF NOT EXISTS criado_em_brasilia text;

ALTER TABLE pep_trilha_auditoria ALTER COLUMN prestador_nome DROP NOT NULL;

ALTER TABLE pep_trilha_auditoria ALTER COLUMN registro_id TYPE text USING registro_id::text;

ALTER TABLE pep_trilha_auditoria DROP CONSTRAINT IF EXISTS pep_trilha_auditoria_tabela_check;
ALTER TABLE pep_trilha_auditoria ADD CONSTRAINT pep_trilha_auditoria_tabela_check
  CHECK (tabela IN ('registro_entrega', 'planejamento_semestral', 'apuracao_mensal', 'calendario_competencia'));

CREATE OR REPLACE FUNCTION public.set_pep_trilha_auditoria_criado_em_brasilia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.criado_em_brasilia := to_char(NEW.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pep_trilha_auditoria_criado_em_brasilia ON pep_trilha_auditoria;
CREATE TRIGGER trg_pep_trilha_auditoria_criado_em_brasilia
  BEFORE INSERT ON pep_trilha_auditoria
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pep_trilha_auditoria_criado_em_brasilia();

-- Backfill das linhas já existentes (a trilha já vem sendo gravada desde
-- 2026-08-10) — sem isso, o histórico mostraria "—" no horário das entradas
-- antigas até a próxima ação.
UPDATE pep_trilha_auditoria
SET criado_em_brasilia = to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
WHERE criado_em_brasilia IS NULL;