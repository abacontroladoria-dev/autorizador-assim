-- Cópia para rodar no SQL Editor do Supabase.
-- Espelha supabase/migrations/20260826000000_chamada_paciente_sessao.sql —
-- se editar um, edite o outro.
--
-- Seguro de rodar mais de uma vez (IF NOT EXISTS) e sem lock relevante: são
-- três colunas nullable, sem backfill e sem reescrita de tabela.
--
-- ORDEM IMPORTA: aplique isto ANTES do deploy do frontend. A /solicitar passa a
-- gravar nessas colunas no clique de "Chamar"; se o código subir primeiro, o
-- insert falha e a recepção fica sem conseguir chamar ninguém.

ALTER TABLE public.chamada_paciente
  ADD COLUMN IF NOT EXISTS paciente_id      text,
  ADD COLUMN IF NOT EXISTS data_atendimento date,
  ADD COLUMN IF NOT EXISTS horario          time without time zone;

COMMENT ON COLUMN public.chamada_paciente.paciente_id IS
  'Sessão chamada: casa com fila_autorizacoes.paciente_id (text, sem cast).';

COMMENT ON COLUMN public.chamada_paciente.data_atendimento IS
  'Sessão chamada: parte 2 de 3 da tupla que identifica a sessão.';

COMMENT ON COLUMN public.chamada_paciente.horario IS
  'Sessão chamada: parte 3 de 3 da tupla que identifica a sessão.';

COMMENT ON COLUMN public.chamada_paciente.agenda_id IS
  'LEGADO: guardava fila_autorizacoes.id, escrito só pela /autorizacoes (removida em 2026-08-26). Nada escreve mais aqui; a leitura da TV usa a tupla de sessão.';

-- Conferência
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'chamada_paciente'
ORDER BY ordinal_position;
