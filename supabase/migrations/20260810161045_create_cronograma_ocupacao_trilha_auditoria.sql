-- Trilha de auditoria da tela "cronograma/ocupacao-salas" — mesma ideia da
-- pep_trilha_auditoria (ver 20260810130000_create_pep_trilha_auditoria.sql):
-- uma linha por ação (criar/editar/excluir) sobre Sala, Alocação de sessão,
-- Núcleo ou Rótulo de Status. Histórico completo e imutável (sem UPDATE nem
-- DELETE nesta tabela, só INSERT).

CREATE TABLE IF NOT EXISTS public.cronograma_ocupacao_trilha_auditoria (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela             text        NOT NULL CHECK (tabela IN ('sala', 'alocacao', 'nucleo', 'status_label')),
  -- text (não uuid): status_label usa `codigo` (ex.: 'operacional') como chave, não uuid.
  registro_id        text        NOT NULL,
  acao               text        NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir')),
  unidade_nome       text,
  sala_nome          text,
  nucleo_nome        text,
  profissional_nome  text,
  terapia_nome       text,
  dia_semana         smallint,
  turno              text,
  antes              jsonb,
  depois             jsonb,
  motivo             text,
  usuario_id         uuid        REFERENCES public.usuarios(id),
  usuario_nome       text,
  criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cronograma_trilha_registro
  ON public.cronograma_ocupacao_trilha_auditoria (tabela, registro_id);

CREATE INDEX IF NOT EXISTS idx_cronograma_trilha_criado_em
  ON public.cronograma_ocupacao_trilha_auditoria (criado_em DESC);

ALTER TABLE public.cronograma_ocupacao_trilha_auditoria ENABLE ROW LEVEL SECURITY;

-- Mesmos papéis que hoje têm permissão de escrita em cronograma_salas /
-- cronograma_salas_alocacoes (ver 20260805124824_remote_schema.sql) — quem
-- pode alterar é quem pode ver e gravar a trilha dessa alteração.
CREATE POLICY "cronograma_trilha_select" ON public.cronograma_ocupacao_trilha_auditoria
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma', 'terapeutico']));

-- Só INSERT — a trilha não pode ser editada nem apagada por ninguém,
-- inclusive admin, senão deixa de ser trilha de auditoria confiável.
CREATE POLICY "cronograma_trilha_insert" ON public.cronograma_ocupacao_trilha_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma', 'terapeutico']));
