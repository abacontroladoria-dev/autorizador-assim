-- Sample CCO data for debugging
CREATE OR REPLACE FUNCTION public.sample_cco_data()
RETURNS TABLE (
  data_type text,
  sample jsonb
) AS $$
BEGIN
  -- Sample atendimentos
  RETURN QUERY SELECT
    'atendimentos'::text,
    jsonb_build_object(
      'session_key', session_key,
      'paciente_nome', paciente_nome,
      'data_sessao', data_sessao,
      'possui_tratativa', possui_tratativa,
      'status_agendamento', status_agendamento
    )
  FROM cco.atendimentos
  LIMIT 3;

  -- Sample session_authorizations
  RETURN QUERY SELECT
    'session_authorizations'::text,
    jsonb_build_object(
      'session_key', session_key,
      'source', source,
      'authorization_status', authorization_status
    )
  FROM cco.session_authorizations
  LIMIT 3;

  -- Sample session_substitutions
  RETURN QUERY SELECT
    'session_substitutions'::text,
    jsonb_build_object(
      'session_key', session_key,
      'status_ct', status_ct,
      'profissional_substituto_id', profissional_substituto_id
    )
  FROM cco.session_substitutions
  LIMIT 3;

  -- Count possui_tratativa = false
  RETURN QUERY SELECT
    'atendimentos_sem_tratativa'::text,
    jsonb_build_object(
      'count', (SELECT COUNT(*) FROM cco.atendimentos WHERE possui_tratativa = false)
    );

  -- Count by status_agendamento
  RETURN QUERY SELECT
    'status_breakdown'::text,
    jsonb_build_object(
      'falta_paciente', (SELECT COUNT(*) FROM cco.atendimentos WHERE status_agendamento = 'FALTA_PACIENTE'),
      'outros', (SELECT COUNT(*) FROM cco.atendimentos WHERE status_agendamento != 'FALTA_PACIENTE')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sample_cco_data TO service_role;
