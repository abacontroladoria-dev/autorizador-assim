-- Fix: Create upsert_occurrences and update_dashboard_snapshot functions
-- These were supposed to be in 20260609000005 but weren't applied

CREATE OR REPLACE FUNCTION public.upsert_occurrences(p_rows jsonb)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO cco.occurrences (
    session_key, tipo, severity, titulo, descricao,
    fingerprint, created_at, updated_at
  )
  SELECT
    row->>'session_key', row->>'tipo', row->>'severity',
    row->>'titulo', row->>'descricao', row->>'fingerprint',
    row->>'created_at', row->>'updated_at'
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
BEGIN
  INSERT INTO cco.dashboard_snapshot (
    data_ref, autorizacoes_pendentes, sessoes_sem_autorizacao,
    evolucoes_atrasadas, faltas_terapeuta, substituicoes,
    faltas_paciente, glosas, receita_em_risco_count, calculated_at
  )
  SELECT
    CURRENT_DATE::text,
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='AUTORIZACAO_PENDENTE' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='SESSAO_SEM_AUTORIZACAO' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='EVOLUCAO_ATRASADA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='FALTA_TERAPEUTA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='SUBSTITUICAO' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='FALTA_PACIENTE' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo='GLOSA' AND resolved_at IS NULL),
    (SELECT COUNT(*) FROM cco.occurrences WHERE tipo IN ('AUTORIZACAO_PENDENTE','SESSAO_SEM_AUTORIZACAO','EVOLUCAO_ATRASADA') AND resolved_at IS NULL),
    NOW()
  ON CONFLICT (data_ref) DO UPDATE SET
    autorizacoes_pendentes = EXCLUDED.autorizacoes_pendentes,
    sessoes_sem_autorizacao = EXCLUDED.sessoes_sem_autorizacao,
    evolucoes_atrasadas = EXCLUDED.evolucoes_atrasadas,
    faltas_terapeuta = EXCLUDED.faltas_terapeuta,
    substituicoes = EXCLUDED.substituicoes,
    faltas_paciente = EXCLUDED.faltas_paciente,
    glosas = EXCLUDED.glosas,
    receita_em_risco_count = EXCLUDED.receita_em_risco_count,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_dashboard_snapshot TO service_role;
