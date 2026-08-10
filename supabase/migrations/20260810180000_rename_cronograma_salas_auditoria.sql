-- Pedido do usuário (2026-08-10): a trilha de auditoria de Ocupação de Salas
-- muda de nome pra algo mais claro (cronograma_ocupacao_trilha_auditoria →
-- cronograma_salas_auditoria) e ganha uma coluna já formatada em horário de
-- Brasília / DD/MM/AAAA, pra quem abrir a tabela direto no Supabase Studio
-- não precisar converter UTC na cabeça.

-- Condicional: em produção a tabela já foi renomeada por fora desta migration
-- (aplicada manualmente antes desta rodada) — os blocos abaixo deixam a
-- migration segura de rodar tanto num ambiente que ainda tem o nome antigo
-- quanto num que já está com o nome novo.
DO $$
BEGIN
  IF to_regclass('public.cronograma_ocupacao_trilha_auditoria') IS NOT NULL THEN
    ALTER TABLE public.cronograma_ocupacao_trilha_auditoria RENAME TO cronograma_salas_auditoria;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_cronograma_trilha_registro') THEN
    ALTER INDEX public.idx_cronograma_trilha_registro RENAME TO idx_cronograma_salas_auditoria_registro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_cronograma_trilha_criado_em') THEN
    ALTER INDEX public.idx_cronograma_trilha_criado_em RENAME TO idx_cronograma_salas_auditoria_criado_em;
  END IF;
END $$;

ALTER TABLE public.cronograma_salas_auditoria
  ADD COLUMN IF NOT EXISTS criado_em_brasilia text;

-- Não dá pra usar coluna GERADA aqui: to_char()/AT TIME ZONE não são
-- IMMUTABLE (exigência de generated column), então o preenchimento é feito
-- por trigger — funciona igual, só roda no INSERT em vez de ser calculado
-- em leitura.
CREATE OR REPLACE FUNCTION public.set_cronograma_salas_auditoria_criado_em_brasilia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.criado_em_brasilia := to_char(NEW.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cronograma_salas_auditoria_criado_em_brasilia ON public.cronograma_salas_auditoria;
CREATE TRIGGER trg_cronograma_salas_auditoria_criado_em_brasilia
  BEFORE INSERT ON public.cronograma_salas_auditoria
  FOR EACH ROW
  EXECUTE FUNCTION public.set_cronograma_salas_auditoria_criado_em_brasilia();

-- Backfill das linhas já existentes.
UPDATE public.cronograma_salas_auditoria
SET criado_em_brasilia = to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
WHERE criado_em_brasilia IS NULL;
