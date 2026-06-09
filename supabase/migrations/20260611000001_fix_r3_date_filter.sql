-- CCO-010: R3 deve disparar apenas para sessões até D-1
-- Antes: disparava para TODAS as sessões sem tratativa (incluindo hoje e futuras)
-- Depois: dispara apenas para data_sessao < CURRENT_DATE

CREATE OR REPLACE FUNCTION public.detect_r3_evolucao_atrasada()
RETURNS TABLE (
  session_key text
) AS $$
BEGIN
  RETURN QUERY
  SELECT a.session_key
  FROM cco.atendimentos a
  WHERE a.orphaned_at IS NULL
    AND a.data_sessao < CURRENT_DATE
    AND (a.possui_tratativa = false OR a.possui_tratativa IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.detect_r3_evolucao_atrasada TO service_role;
