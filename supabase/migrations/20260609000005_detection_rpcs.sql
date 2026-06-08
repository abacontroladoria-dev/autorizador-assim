-- RPC wrappers for detection logic (bypass schema access limitation in Edge Functions)

CREATE OR REPLACE FUNCTION public.detect_r1_autorizacao_pendente()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'PENDENTE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r1_autorizacao_pendente TO service_role;

---

CREATE OR REPLACE FUNCTION public.detect_r2_sessao_sem_autorizacao()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  LEFT JOIN cco.session_authorizations sa ON sa.session_key = a.session_key
  WHERE sa.session_key IS NULL
    AND a.orphaned_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r2_sessao_sem_autorizacao TO service_role;

---

CREATE OR REPLACE FUNCTION public.detect_r4_falta_terapeuta()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.status_ct = 'falta'
    AND ss.profissional_substituto_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r4_falta_terapeuta TO service_role;

---

CREATE OR REPLACE FUNCTION public.detect_r5_substituicao()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY SELECT ss.session_key
  FROM cco.session_substitutions ss
  WHERE ss.profissional_substituto_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r5_substituicao TO service_role;

---

CREATE OR REPLACE FUNCTION public.detect_r6_falta_paciente()
RETURNS TABLE (
  session_key text,
  justificativa text
) AS $$
BEGIN
  RETURN QUERY SELECT a.session_key, a.justificativa
  FROM cco.atendimentos a
  WHERE a.status_agendamento = 'FALTA_PACIENTE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r6_falta_paciente TO service_role;

---

CREATE OR REPLACE FUNCTION public.detect_r7_glosa()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY SELECT sa.session_key
  FROM cco.session_authorizations sa
  WHERE sa.authorization_status = 'GLOSA';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r7_glosa TO service_role;

---

CREATE OR REPLACE FUNCTION public.upsert_occurrences(
  p_rows jsonb
)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO cco.occurrences (
    session_key,
    tipo,
    severity,
    titulo,
    descricao,
    fingerprint,
    created_at,
    updated_at
  )
  SELECT
    row->>'session_key',
    row->>'tipo',
    row->>'severity',
    row->>'titulo',
    row->>'descricao',
    row->>'fingerprint',
    row->>'created_at',
    row->>'updated_at'
  FROM jsonb_array_elements(p_rows) AS row
  ON CONFLICT (fingerprint) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_occurrences TO service_role;

---

CREATE OR REPLACE FUNCTION public.update_dashboard_snapshot()
RETURNS void AS $$
DECLARE
  v_today text := CURRENT_DATE::text;
  v_autorizacoes_pendentes integer;
  v_sessoes_sem_autorizacao integer;
  v_evolucoes_atrasadas integer;
  v_faltas_terapeuta integer;
  v_substituicoes integer;
  v_faltas_paciente integer;
  v_glosas integer;
BEGIN
  SELECT COUNT(*) INTO v_autorizacoes_pendentes
  FROM cco.occurrences
  WHERE tipo = 'AUTORIZACAO_PENDENTE' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_sessoes_sem_autorizacao
  FROM cco.occurrences
  WHERE tipo = 'SESSAO_SEM_AUTORIZACAO' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_evolucoes_atrasadas
  FROM cco.occurrences
  WHERE tipo = 'EVOLUCAO_ATRASADA' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_faltas_terapeuta
  FROM cco.occurrences
  WHERE tipo = 'FALTA_TERAPEUTA' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_substituicoes
  FROM cco.occurrences
  WHERE tipo = 'SUBSTITUICAO' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_faltas_paciente
  FROM cco.occurrences
  WHERE tipo = 'FALTA_PACIENTE' AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_glosas
  FROM cco.occurrences
  WHERE tipo = 'GLOSA' AND resolved_at IS NULL;

  INSERT INTO cco.dashboard_snapshot (
    data_ref,
    autorizacoes_pendentes,
    sessoes_sem_autorizacao,
    evolucoes_atrasadas,
    faltas_terapeuta,
    substituicoes,
    faltas_paciente,
    glosas,
    receita_em_risco_count,
    calculated_at
  ) VALUES (
    v_today,
    v_autorizacoes_pendentes,
    v_sessoes_sem_autorizacao,
    v_evolucoes_atrasadas,
    v_faltas_terapeuta,
    v_substituicoes,
    v_faltas_paciente,
    v_glosas,
    (v_autorizacoes_pendentes + v_sessoes_sem_autorizacao + v_evolucoes_atrasadas),
    NOW()
  )
  ON CONFLICT (data_ref) DO UPDATE SET
    autorizacoes_pendentes = v_autorizacoes_pendentes,
    sessoes_sem_autorizacao = v_sessoes_sem_autorizacao,
    evolucoes_atrasadas = v_evolucoes_atrasadas,
    faltas_terapeuta = v_faltas_terapeuta,
    substituicoes = v_substituicoes,
    faltas_paciente = v_faltas_paciente,
    glosas = v_glosas,
    receita_em_risco_count = (v_autorizacoes_pendentes + v_sessoes_sem_autorizacao + v_evolucoes_atrasadas),
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_dashboard_snapshot TO service_role;
