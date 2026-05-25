-- Fix: trigger_updated_at agora dispara em INSERT OR UPDATE.
-- Com o trigger apenas em UPDATE, updated_at ficava NULL após INSERT,
-- impedindo que a view classificasse o registro como SINCRONIZANDO
-- (condição `fo.ultimo_updated_at IS NOT NULL` falhava).

DROP TRIGGER IF EXISTS trigger_updated_at ON public.fila_autorizacoes;

CREATE TRIGGER trigger_updated_at
  BEFORE INSERT OR UPDATE ON public.fila_autorizacoes
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();
