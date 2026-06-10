-- Fix: Remove unique constraint on tita_agendamento_id
-- Problema: O índice UNIQUE agenda_tita_unico impede múltiplas versões do mesmo agendamento
--   quando um foi marcado ativo=false durante remanejamento.
--
-- Após a migração 20260530000000_versioning_agenda_tita, registros podem ter:
--   - Versão antiga: tita_agendamento_id=X, ativo=false, motivo_inativacao='excluido'
--   - Versão nova: tita_agendamento_id=X, ativo=true
--
-- O índice UNIQUE bloqueia a segunda inserção, causando erro:
--   "duplicate key value violates unique constraint \"agenda_tita_unico\""
--
-- Solução: Dropa o índice único e cria um índice PARCIAL que enforce
--   apenas um registro ativo por tita_agendamento_id.

-- 1. Dropa o índice UNIQUE antigo
DROP INDEX IF EXISTS public.agenda_tita_unico;

-- 2. Cria índice PARCIAL: permite múltiplas linhas por ID, mas apenas uma com ativo=true
CREATE UNIQUE INDEX agenda_tita_unico_active
  ON public.agenda_tita (tita_agendamento_id)
  WHERE ativo = true;
