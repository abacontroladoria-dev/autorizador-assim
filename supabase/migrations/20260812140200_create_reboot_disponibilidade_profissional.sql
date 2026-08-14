-- Passos iniciais do sistema próprio de agendamentos/grade. Disponibilidade
-- semanal de cada profissional: janela de atendimento, duração padrão de
-- sessão (default 40 min, editável) e intervalo opcional (ex.: pausa de
-- almoço). Uma linha por dia da semana em que o profissional atende.

CREATE TABLE IF NOT EXISTS public.reboot_disponibilidade_profissional (
  id_disponibilidade      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_profissional         bigint      NOT NULL REFERENCES public.reboot_profissionais(id_profissional) ON DELETE CASCADE,
  dia_semana              smallint    NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo .. 6=sábado
  horario_inicio          time        NOT NULL,
  horario_fim             time        NOT NULL,
  duracao_sessao_minutos  integer     NOT NULL DEFAULT 40 CHECK (duracao_sessao_minutos > 0),
  intervalo_inicio        time,
  intervalo_fim           time,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reboot_disponibilidade_horario_valido CHECK (horario_fim > horario_inicio),
  CONSTRAINT reboot_disponibilidade_intervalo_valido CHECK (
    (intervalo_inicio IS NULL AND intervalo_fim IS NULL)
    OR (
      intervalo_inicio IS NOT NULL AND intervalo_fim IS NOT NULL
      AND intervalo_fim > intervalo_inicio
      AND intervalo_inicio >= horario_inicio
      AND intervalo_fim <= horario_fim
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_reboot_disponibilidade_profissional
  ON public.reboot_disponibilidade_profissional (id_profissional, dia_semana);

DROP TRIGGER IF EXISTS trg_reboot_disponibilidade_atualizado_em ON public.reboot_disponibilidade_profissional;
CREATE TRIGGER trg_reboot_disponibilidade_atualizado_em
  BEFORE UPDATE ON public.reboot_disponibilidade_profissional
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.reboot_disponibilidade_profissional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reboot_disponibilidade_profissional_select" ON public.reboot_disponibilidade_profissional;
DROP POLICY IF EXISTS "reboot_disponibilidade_profissional_write" ON public.reboot_disponibilidade_profissional;

CREATE POLICY "reboot_disponibilidade_profissional_select" ON public.reboot_disponibilidade_profissional
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));

CREATE POLICY "reboot_disponibilidade_profissional_write" ON public.reboot_disponibilidade_profissional
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));
