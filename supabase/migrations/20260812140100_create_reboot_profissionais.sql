-- Passos iniciais do sistema próprio de agendamentos/grade. Cadastro de
-- profissionais (terapeutas). Mesmas convenções de reboot_pacientes
-- (ver 20260812140000_create_reboot_pacientes.sql).

CREATE TABLE IF NOT EXISTS public.reboot_profissionais (
  id_profissional   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              text        NOT NULL,
  especialidade     text,
  ativo             boolean     NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reboot_profissionais_atualizado_em ON public.reboot_profissionais;
CREATE TRIGGER trg_reboot_profissionais_atualizado_em
  BEFORE UPDATE ON public.reboot_profissionais
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.reboot_profissionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reboot_profissionais_select" ON public.reboot_profissionais;
DROP POLICY IF EXISTS "reboot_profissionais_write" ON public.reboot_profissionais;

CREATE POLICY "reboot_profissionais_select" ON public.reboot_profissionais
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));

CREATE POLICY "reboot_profissionais_write" ON public.reboot_profissionais
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));
