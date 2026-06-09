-- CCO-011B: Migrar R2 para usar get_auditoria_assim como fonte oficial
--
-- Problema anterior:
--   detect_r2_sessao_sem_autorizacao usava LEFT JOIN em cco.session_authorizations,
--   que contém apenas 4 registros (0,6% dos 727 atendimentos ASSIM) porque o hash
--   SHA-256 não casava entre autorizacoes_assim e cco.atendimentos.
--   Resultado: 1.087 ocorrências R2, sendo 1.076 falsos positivos (98,9%).
--
-- Solução:
--   Substituir a lógica de hash por chamada direta a get_auditoria_assim(date),
--   que usa o mesmo matching posicional da Auditoria ASSIM do frontend.
--
-- Situações que GERAM ocorrência R2:
--   NAO_SOLICITADA         — sem entrada em fila_autorizacoes para o bloco
--   GLOSA                  — ASSIM retornou erro ou status inválido
--   RETORNO_NAO_CONFIRMADO — enviado há mais de 10 min, sem confirmação
--
-- Situações que NÃO GERAM ocorrência R2:
--   LIBERADA      — autorização confirmada pelo ASSIM
--   CANCELADA     — autorização cancelada (Liberado *)
--   SINCRONIZANDO — enviado há menos de 10 min, aguardando

CREATE OR REPLACE FUNCTION public.detect_r2_sessao_sem_autorizacao()
RETURNS TABLE(session_key text) AS $$
DECLARE
  v_data date;
BEGIN
  FOR v_data IN
    SELECT DISTINCT a.data_sessao
    FROM cco.atendimentos a
    WHERE a.convenio ILIKE '%assim%'
      AND a.data_sessao < CURRENT_DATE
      AND a.orphaned_at IS NULL
    ORDER BY a.data_sessao
  LOOP
    RETURN QUERY
    SELECT a.session_key
    FROM public.get_auditoria_assim(v_data) ga
    JOIN cco.atendimentos a
      ON  a.data_sessao = v_data
      AND a.hora_inicio = ga.hora_inicial
      AND lower(trim(a.paciente_nome)) = lower(trim(ga.paciente_nome))
    WHERE ga.situacao IN ('NAO_SOLICITADA', 'GLOSA', 'RETORNO_NAO_CONFIRMADO')
      AND a.orphaned_at IS NULL;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r2_sessao_sem_autorizacao TO service_role;

-- Resolver falsos positivos acumulados pelo critério anterior.
-- Qualquer ocorrência R2 ativa que a nova regra não detectaria é marcada como resolvida.
UPDATE cco.occurrences o
SET resolved_at = NOW(), updated_at = NOW()
WHERE o.tipo = 'SESSAO_SEM_AUTORIZACAO'
  AND o.resolved_at IS NULL
  AND o.session_key NOT IN (
    SELECT r.session_key FROM public.detect_r2_sessao_sem_autorizacao() r
  );
