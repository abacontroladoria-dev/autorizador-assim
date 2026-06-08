-- RPC Function to upsert sessions into cco.atendimentos
-- Allows Edge Functions to insert data into non-public schemas

CREATE OR REPLACE FUNCTION public.upsert_atendimentos(
  p_rows jsonb
)
RETURNS TABLE (
  upserted_count integer
) AS $$
DECLARE
  v_count integer := 0;
  v_row jsonb;
BEGIN
  -- Loop through each row and upsert
  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO cco.atendimentos (
      session_key,
      tita_agendamento_id,
      paciente_nome,
      data_sessao,
      hora_inicio,
      hora_fim,
      profissional_agendado,
      terapia,
      convenio,
      unidade,
      status_agendamento,
      justificativa,
      possui_tratativa,
      profissional_tratativa,
      data_tratativa,
      sync_hash,
      synced_at,
      created_at,
      updated_at
    ) VALUES (
      v_row->>'session_key',
      (v_row->>'tita_agendamento_id')::bigint,
      v_row->>'paciente_nome',
      (v_row->>'data_sessao')::date,
      (v_row->>'hora_inicio')::time,
      (v_row->>'hora_fim')::time,
      v_row->>'profissional_agendado',
      v_row->>'terapia',
      v_row->>'convenio',
      v_row->>'unidade',
      v_row->>'status_agendamento',
      v_row->>'justificativa',
      (v_row->>'possui_tratativa')::boolean,
      v_row->>'profissional_tratativa',
      (v_row->>'data_tratativa')::date,
      v_row->>'sync_hash',
      (v_row->>'synced_at')::timestamptz,
      (v_row->>'created_at')::timestamptz,
      (v_row->>'updated_at')::timestamptz
    )
    ON CONFLICT (session_key) DO UPDATE SET
      tita_agendamento_id = EXCLUDED.tita_agendamento_id,
      paciente_nome = EXCLUDED.paciente_nome,
      data_sessao = EXCLUDED.data_sessao,
      hora_inicio = EXCLUDED.hora_inicio,
      hora_fim = EXCLUDED.hora_fim,
      profissional_agendado = EXCLUDED.profissional_agendado,
      terapia = EXCLUDED.terapia,
      convenio = EXCLUDED.convenio,
      unidade = EXCLUDED.unidade,
      status_agendamento = EXCLUDED.status_agendamento,
      justificativa = EXCLUDED.justificativa,
      possui_tratativa = EXCLUDED.possui_tratativa,
      profissional_tratativa = EXCLUDED.profissional_tratativa,
      data_tratativa = EXCLUDED.data_tratativa,
      sync_hash = EXCLUDED.sync_hash,
      synced_at = EXCLUDED.synced_at,
      updated_at = EXCLUDED.updated_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_atendimentos TO service_role;

COMMENT ON FUNCTION public.upsert_atendimentos IS
  'Upsert multiple session records into cco.atendimentos. Accepts array of JSON objects.';
