-- Filtro: excluir pacientes inválidos das listagens CCO
-- Remove "Ainda não selecionado" e "Horário Admiistrativo" dos resultados

CREATE OR REPLACE FUNCTION public.get_cco_atendimentos(
  p_data_inicio date,
  p_data_fim     date
)
RETURNS TABLE (
  session_key             text,
  paciente_nome           text,
  data_sessao             date,
  hora_inicio             time,
  hora_fim                time,
  terapia                 text,
  profissional            text,
  possui_tratativa        boolean,
  profissional_tratativa  text,
  data_tratativa          date,
  tipos_ocorrencia        text[],
  profissional_substituto text,
  authorization_status    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.session_key,
    a.paciente_nome,
    a.data_sessao,
    a.hora_inicio,
    a.hora_fim,
    a.terapia,
    a.profissional_agendado                 AS profissional,
    COALESCE(a.possui_tratativa, false)     AS possui_tratativa,
    a.profissional_tratativa,
    a.data_tratativa,
    COALESCE(
      ARRAY(
        SELECT o.tipo::text
        FROM cco.occurrences o
        WHERE o.session_key = a.session_key
          AND o.resolved_at IS NULL
        ORDER BY o.created_at
      ),
      ARRAY[]::text[]
    )                                       AS tipos_ocorrencia,
    ss.profissional_substituto_nome         AS profissional_substituto,
    sa.authorization_status::text          AS authorization_status
  FROM cco.atendimentos a
  LEFT JOIN cco.session_substitutions ss
    ON ss.session_key = a.session_key
  LEFT JOIN cco.session_authorizations sa
    ON sa.session_key = a.session_key
   AND sa.source = 'assim'
  WHERE a.data_sessao BETWEEN p_data_inicio AND p_data_fim
    AND a.orphaned_at IS NULL
    AND a.paciente_nome NOT ILIKE 'Ainda não selecionado'
    AND a.paciente_nome NOT ILIKE 'Horário Administrat%'
  ORDER BY a.data_sessao, a.hora_inicio, a.paciente_nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cco_atendimentos(date, date) TO authenticated;
