-- Retorna a carga de agendamentos de cada profissional no dia informado.
-- Usado pelo Critério 3 (menor carga no dia) da recomendação automática.
CREATE OR REPLACE FUNCTION public.fn_carga_dia(
  profissional_ids BIGINT[],
  p_data DATE
)
RETURNS TABLE (profissional_id BIGINT, total BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT a.profissional_id, COUNT(*)::BIGINT AS total
  FROM public.agenda_tita a
  WHERE a.profissional_id = ANY(profissional_ids)
    AND a.data_atendimento = p_data
    AND a.ativo = TRUE
  GROUP BY a.profissional_id;
$$;

-- Retorna a quantidade de substituições confirmadas (não canceladas) por profissional
-- na competência informada. Usado pelo Critério 4 da recomendação automática.
CREATE OR REPLACE FUNCTION public.fn_substituicoes_competencia(
  profissional_ids BIGINT[],
  p_competencia TEXT
)
RETURNS TABLE (profissional_id BIGINT, total BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT sh.profissional_substituto_id AS profissional_id, COUNT(*)::BIGINT AS total
  FROM public.substituicoes_historico sh
  WHERE sh.profissional_substituto_id = ANY(profissional_ids)
    AND sh.competencia = p_competencia
    AND sh.cancelada = FALSE
  GROUP BY sh.profissional_substituto_id;
$$;

-- Retorna quais profissionais atendem cada um dos pacientes informados
-- na mesma semana ISO que p_data. Usado pelo Critério 1 (continuidade).
-- Retorna pares (profissional_id, paciente_id) para que o frontend
-- resolva a prioridade por sessão individualmente.
CREATE OR REPLACE FUNCTION public.fn_continuidade_semana(
  p_paciente_ids BIGINT[],
  p_data DATE,
  profissional_ids BIGINT[]
)
RETURNS TABLE (profissional_id BIGINT, paciente_id BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT DISTINCT a.profissional_id, a.paciente_id
  FROM public.agenda_tita a
  WHERE a.profissional_id = ANY(profissional_ids)
    AND a.paciente_id     = ANY(p_paciente_ids)
    AND a.ativo = TRUE
    AND DATE_TRUNC('week', a.data_atendimento) = DATE_TRUNC('week', p_data);
$$;
