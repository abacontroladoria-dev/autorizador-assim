-- Passos iniciais do sistema próprio de agendamentos/grade. Agendamentos
-- (sessões) nativos, independentes do TiTa. `id_serie` agrupa sessões
-- recorrentes criadas em lote (repetição semanal) para permitir edição/
-- exclusão em massa ("esta e todas as futuras") na Etapa 4 do projeto —
-- é só um identificador de agrupamento, não é a chave primária da tabela.

CREATE TABLE IF NOT EXISTS public.reboot_agendamentos (
  id_agendamento    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_paciente       bigint      NOT NULL REFERENCES public.reboot_pacientes(id_paciente) ON DELETE RESTRICT,
  id_profissional   bigint      NOT NULL REFERENCES public.reboot_profissionais(id_profissional) ON DELETE RESTRICT,
  data              date        NOT NULL,
  horario_inicio    time        NOT NULL,
  horario_fim       time        NOT NULL,
  status            text        NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  id_serie          uuid,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reboot_agendamentos_horario_valido CHECK (horario_fim > horario_inicio)
);

CREATE INDEX IF NOT EXISTS idx_reboot_agendamentos_profissional_data
  ON public.reboot_agendamentos (id_profissional, data);

CREATE INDEX IF NOT EXISTS idx_reboot_agendamentos_paciente_data
  ON public.reboot_agendamentos (id_paciente, data);

CREATE INDEX IF NOT EXISTS idx_reboot_agendamentos_serie
  ON public.reboot_agendamentos (id_serie);

DROP TRIGGER IF EXISTS trg_reboot_agendamentos_atualizado_em ON public.reboot_agendamentos;
CREATE TRIGGER trg_reboot_agendamentos_atualizado_em
  BEFORE UPDATE ON public.reboot_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.reboot_agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reboot_agendamentos_select" ON public.reboot_agendamentos;
DROP POLICY IF EXISTS "reboot_agendamentos_write" ON public.reboot_agendamentos;

CREATE POLICY "reboot_agendamentos_select" ON public.reboot_agendamentos
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));

CREATE POLICY "reboot_agendamentos_write" ON public.reboot_agendamentos
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));
